import { isDeepStrictEqual } from "node:util";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { ScheduleDraft } from "../scheduling";
import { operationRequestSchema } from "./schema";
import type { ParsedCommand } from "./schema";
import { applyCommand } from "./commands";

export type OperationCommand = ParsedCommand;
export type OperationInput = { eventId: string; actor: { id: string; role: string }; expectedVersion: number; idempotencyKey: string; command: OperationCommand };
export type OperationReceipt = { version: number; resourceId?: string };

/** Actors must come from server sessions. Every competition writer, including
 * result services, must share this event CAS and transaction boundary. */
export function createCompetitionOperations(db: PrismaClient, clock: () => Date = () => new Date()) {
  async function execute(input: OperationInput): Promise<OperationReceipt> {
    const { actor } = input;
    const request = operationRequestSchema.parse({ eventId: input.eventId, expectedVersion: input.expectedVersion, idempotencyKey: input.idempotencyKey, command: input.command });
    if (!actor?.id || !["organizer", "platform_admin", "admin"].includes(actor.role)) throw new Error("Not authorized");
    const { eventId, expectedVersion, idempotencyKey, command } = request;
    const mutation = JSON.parse(JSON.stringify({ ...request, actorId: actor.id }));
    const transact = () => db.$transaction(async tx => {
      const event = await tx.event.findUnique({ where: { id: eventId } });
      if (!event || actor.role === "organizer" && event.organizerUserId !== actor.id) throw new Error("Not authorized");
      const previous = await tx.competitionAuditLog.findFirst({ where: { eventId, idempotencyKey } });
      if (previous) {
        const payload = previous.payload as { request: Prisma.JsonValue; receipt: OperationReceipt };
        if (!isDeepStrictEqual(payload.request, mutation)) throw new Error("Idempotency key already used for a different request");
        return payload.receipt;
      }
      const updated = await tx.event.updateMany({
        where: { id: eventId, organizerUserId: event.organizerUserId, competitionVersion: expectedVersion },
        data: { competitionVersion: { increment: 1 } },
      });
      if (updated.count !== 1) throw new Error("Version conflict: refresh competition state");
      const resourceId = await applyCommand(tx, eventId, actor.id, command, expectedVersion + 1, idempotencyKey, clock());
      const receipt: OperationReceipt = { version: expectedVersion + 1, ...(resourceId ? { resourceId } : {}) };
      await tx.competitionAuditLog.create({ data: {
        eventId, actorUserId: actor.id, action: command.kind, idempotencyKey,
        matchId: "matchId" in command ? command.matchId : undefined,
        reason: "reason" in command ? command.reason || null : null,
        payload: JSON.parse(JSON.stringify({ request: mutation, receipt })),
      } });
      return receipt;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 20000 });
    // Re-read a committed retry receipt after a PostgreSQL serialization race.
    for (let attempt = 0; ; attempt++) {
      try { return await transact(); } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "P2034") {
          if (attempt < 2) continue;
          throw new Error("Version conflict: retry with the same idempotency key");
        }
        throw error;
      }
    }
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
    if (!actor?.id || !["organizer", "platform_admin", "admin"].includes(actor.role)) throw new Error("Not authorized");
    return db.$transaction(async tx => {
      const event = await tx.event.findUnique({ where: { id: eventId } });
      if (!event || actor.role === "organizer" && event.organizerUserId !== actor.id) throw new Error("Not authorized");
      const revision = await tx.scheduleRevision.findFirst({ where: { eventId, id: revisionId, status: "draft" } });
      if (!revision) return null;
      const { draft } = revision.snapshot as unknown as { draft: ScheduleDraft };
      return { competitionVersion: event.competitionVersion, revisionId: revision.id, draft };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  return { execute, readPublishedSchedule, readScheduleDraft };
}
