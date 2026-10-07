import { isDeepStrictEqual } from "node:util";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { ScheduleDraft } from "../scheduling";
import { correctionPreviewSchema, internalCorrectionPreviewSchema, internalOperationRequestSchema, operationRequestSchema } from "./schema";
import type { ParsedCommand } from "./schema";
import { applyCommand } from "./commands";
import { correctionPreview, type ResultGame } from "./results";
import { CompetitionExpectedError } from "./errors";
import {
  classifyCompetitionFailure,
  isCompetitionSerializationConflict,
  makeOperationStageReporter,
  reportOperationStage,
  withOperationStage,
  type OperationObservabilityOptions,
} from "./observability";

export type OperationCommand = ParsedCommand;
export type OperationInput = { eventId: string; actor: { id: string; role: string }; expectedVersion: number; idempotencyKey: string; command: OperationCommand };
export type OperationReceipt = { version: number; resourceId?: string };
export type {
  CompetitionFailureCode,
  OperationStageEvent,
  OperationStageErrorCode,
  OperationStageReporter,
} from "./observability";
export { CompetitionExpectedError, isCompetitionExpectedError } from "./errors";
export type { CompetitionExpectedErrorCode } from "./errors";

const SERIALIZATION_RETRIES = 6;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Actors must come from server sessions. Every competition writer, including
 * result services, must share this event CAS and transaction boundary. */
export function createCompetitionOperations(
  db: PrismaClient,
  clock: () => Date = () => new Date(),
  options: OperationObservabilityOptions & { allowInternalInitialize?: boolean } = {},
) {
  const stageReporter = makeOperationStageReporter(options);
  async function execute(input: OperationInput): Promise<OperationReceipt> {
    const { actor } = input;
    const request = (options.allowInternalInitialize ? internalOperationRequestSchema : operationRequestSchema)
      .parse({ eventId: input.eventId, expectedVersion: input.expectedVersion, idempotencyKey: input.idempotencyKey, command: input.command });
    const { eventId, expectedVersion, idempotencyKey, command } = request;
    const isCaptainReadiness = actor?.role === "captain" && command.kind === "readiness_update";
    if (!actor?.id || !isCaptainReadiness && !["organizer", "platform_admin", "admin"].includes(actor.role)) throw new CompetitionExpectedError("unauthorized", "Not authorized");
    const mutation = JSON.parse(JSON.stringify({ ...request, actorId: actor.id }));
    const transact = (attempt: number) => {
      const startedAt = Date.now();
      reportOperationStage(stageReporter, {
        phase: "start",
        stage: "competition_transaction",
        durationMs: 0,
        counts: { attempt: attempt + 1 },
      });
      return db.$transaction(async tx => {
        const event = await tx.event.findUnique({ where: { id: eventId } });
        if (!event || actor.role === "organizer" && event.organizerUserId !== actor.id) throw new CompetitionExpectedError("unauthorized", "Not authorized");
        if (isCaptainReadiness && !await tx.team.findFirst({ where: { id: command.teamId, eventId, captainId: actor.id } })) throw new CompetitionExpectedError("unauthorized", "Not authorized");
        const previous = await tx.competitionAuditLog.findFirst({ where: { eventId, idempotencyKey } });
        if (previous) {
          const payload = previous.payload as { request: Prisma.JsonValue; receipt: OperationReceipt };
          if (!isDeepStrictEqual(payload.request, mutation)) throw new Error("Idempotency key already used for a different request");
          return payload.receipt;
        }
        const completion = await tx.tournamentCompletion.findUnique({
          where: { eventId },
          select: { status: true },
        });
        const isAnnouncementUtility = ["announcement_save", "announcement_publish", "announcement_unpublish"].includes(command.kind);
        if (completion?.status === "completed" && !isAnnouncementUtility) {
          throw new Error("Tournament completion locks competitive writes");
        }
        const updated = await tx.event.updateMany({
          where: { id: eventId, organizerUserId: event.organizerUserId, competitionVersion: expectedVersion },
          data: { competitionVersion: { increment: 1 } },
        });
        if (updated.count !== 1) throw new CompetitionExpectedError("conflict", "Version conflict: refresh competition state");
        const resourceId = await applyCommand(tx, eventId, actor.id, command, expectedVersion + 1, idempotencyKey, clock(), isCaptainReadiness ? "captain" : "organizer", stageReporter);
        const receipt: OperationReceipt = { version: expectedVersion + 1, ...(resourceId ? { resourceId } : {}) };
        await withOperationStage(stageReporter, "competition_audit", { auditCount: 1 }, () => tx.competitionAuditLog.create({ data: {
          eventId, actorUserId: actor.id, action: command.kind, idempotencyKey,
          matchId: "matchId" in command ? command.matchId : undefined,
          reason: "reason" in command ? command.reason || null : null,
          payload: JSON.parse(JSON.stringify({ request: mutation, receipt })),
        } }));
        return receipt;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 20000 })
        .then((receipt) => {
          reportOperationStage(stageReporter, {
            phase: "done",
            stage: "competition_transaction",
            durationMs: Date.now() - startedAt,
            counts: { attempt: attempt + 1 },
          });
          return receipt;
        })
        .catch((error: unknown) => {
          reportOperationStage(stageReporter, {
            phase: "failed",
            stage: "competition_transaction",
            durationMs: Date.now() - startedAt,
            counts: { attempt: attempt + 1 },
            ...(isCompetitionSerializationConflict(error)
              ? { errorCode: "serialization_conflict" as const, terminal: attempt === SERIALIZATION_RETRIES - 1 ? "failed" as const : "retry" as const }
              : { errorCode: classifyCompetitionFailure(error), terminal: "failed" as const }),
          });
          throw error;
        });
    };
    // Re-read a committed retry receipt after a PostgreSQL serialization race.
    for (let attempt = 0; attempt < SERIALIZATION_RETRIES; attempt++) {
      try {
        return await transact(attempt);
      } catch (error) {
        if (!isCompetitionSerializationConflict(error)) {
          throw error;
        }

        if (attempt === SERIALIZATION_RETRIES - 1) throw error;

        await wait(25 * 2 ** attempt);
      }
    }

    throw new Error("Database serialization retry exhausted");
  }
  async function readPublishedSchedule(eventId: string) {
    return db.$transaction(async tx => {
      const event = await tx.event.findUnique({ where: { id: eventId } });
      if (event?.publishedScheduleVersion == null) return null;
      const revision = await tx.scheduleRevision.findFirst({ where: { eventId, version: event.publishedScheduleVersion, status: "published" } });
      if (!revision) return null;
      const { draft } = revision.snapshot as unknown as { draft: ScheduleDraft };
      return { version: revision.version, timezone: draft.timezone, assignments: draft.assignments };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async function readScheduleDraft(eventId: string, revisionId: string, actor: OperationInput["actor"]) {
    if (!actor?.id || !["organizer", "platform_admin", "admin"].includes(actor.role)) throw new CompetitionExpectedError("unauthorized", "Not authorized");
    return db.$transaction(async tx => {
      const event = await tx.event.findUnique({ where: { id: eventId } });
      if (!event || actor.role === "organizer" && event.organizerUserId !== actor.id) throw new CompetitionExpectedError("unauthorized", "Not authorized");
      const revision = await tx.scheduleRevision.findFirst({ where: { eventId, id: revisionId, status: "draft" } });
      if (!revision) return null;
      const { draft } = revision.snapshot as unknown as { draft: ScheduleDraft };
      return { competitionVersion: event.competitionVersion, revisionId: revision.id, draft };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async function previewResultCorrection(input: { eventId: string; matchId: string; games: ResultGame[]; actor: OperationInput["actor"] }) {
    const { actor } = input;
    const request = (options.allowInternalInitialize ? internalCorrectionPreviewSchema : correctionPreviewSchema)
      .parse({ eventId: input.eventId, matchId: input.matchId, games: input.games });
    if (!actor?.id || !["organizer", "platform_admin", "admin"].includes(actor.role)) throw new CompetitionExpectedError("unauthorized", "Not authorized");
    return db.$transaction(async tx => {
      const event = await tx.event.findUnique({ where: { id: request.eventId } });
      if (!event || actor.role === "organizer" && event.organizerUserId !== actor.id) throw new CompetitionExpectedError("unauthorized", "Not authorized");
      return correctionPreview(tx, request.eventId, request.matchId, request.games, event.competitionVersion);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  return { execute, readPublishedSchedule, readScheduleDraft, previewResultCorrection };
}
