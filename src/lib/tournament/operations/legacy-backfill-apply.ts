import type { Prisma } from "@prisma/client";
import { evaluateBackfillGuard } from "./legacy-backfill";
import { loadCompletionRows, readExisting } from "./legacy-backfill-io";
import { predictFromRows } from "./legacy-backfill-readiness";
import type { BackfillPrediction, LegacyBackfillPlan } from "./legacy-backfill-types";
import { json } from "./state";

type Tx = Prisma.TransactionClient;

export const BACKFILL_AUDIT_ACTION = "legacy_backfill";
export const backfillIdempotencyKey = (eventId: string) => `legacy-backfill:${eventId}`;

export type BackfillApplyOutcome =
  | { status: "applied"; version: number; prediction: BackfillPrediction }
  | { status: "skipped"; reason: string };

/** Same refusals as the planner, read again inside the write transaction. */
async function assertWritable(tx: Tx, plan: LegacyBackfillPlan): Promise<string | null> {
  const guard = evaluateBackfillGuard(await readExisting(tx, plan.eventId));
  if (guard.action === "skip") return guard.reason;
  const actor = await tx.user.findUnique({ where: { id: plan.actorUserId }, select: { id: true } });
  if (!actor) throw new Error(`Actor user ${plan.actorUserId} does not exist`);
  const completion = await tx.tournamentCompletion.findUnique({ where: { eventId: plan.eventId }, select: { status: true } });
  if (completion?.status === "completed") throw new Error("Tournament completion locks competitive writes");
  return null;
}

/** Same compare-and-set on competitionVersion as every organizer command. */
async function bumpEvent(tx: Tx, plan: LegacyBackfillPlan) {
  const updated = await tx.event.updateMany({
    where: { id: plan.eventId, competitionVersion: plan.competitionVersion },
    data: { competitionVersion: { increment: 1 }, formatConfig: json(plan.formatConfig) },
  });
  if (updated.count !== 1) throw new Error("Version conflict: the event changed while planning");
}

async function writeStructure(tx: Tx, plan: LegacyBackfillPlan) {
  const { phase } = plan;
  await tx.competitionPhase.create({ data: { ...phase, configuration: json(phase.configuration) } });
  for (const update of plan.matchUpdates) {
    const { data } = update;
    await tx.match.update({ where: { id: update.matchId }, data: { ...data, scheduleMetadata: json(data.scheduleMetadata), resultSnapshot: json(data.resultSnapshot) } });
  }
  for (const match of plan.createdMatches) {
    await tx.match.create({ data: { ...match, scheduleMetadata: json(match.scheduleMetadata), resultSnapshot: json(match.resultSnapshot) } });
  }
  await tx.matchDependency.createMany({ data: plan.dependencies });
}

async function writeHistory(tx: Tx, plan: LegacyBackfillPlan, version: number) {
  await tx.matchResultRevision.createMany({ data: plan.revisions.map((revision) => ({ ...revision, scoreSnapshot: json(revision.scoreSnapshot) })) });
  const request = { kind: BACKFILL_AUDIT_ACTION, eventId: plan.eventId, matchCount: plan.matchUpdates.length + plan.createdMatches.length, createdMatchIds: plan.createdMatches.map((m) => m.id) };
  await tx.competitionAuditLog.create({ data: {
    eventId: plan.eventId, actorUserId: plan.actorUserId, action: BACKFILL_AUDIT_ACTION,
    idempotencyKey: backfillIdempotencyKey(plan.eventId), reason: plan.revisions[0]?.reason ?? null,
    payload: json({ request, receipt: { version } }),
  } });
}

/** Re-read what was written and compare it with the plan's prediction; any difference aborts the transaction. */
export async function assertWrittenAsPlanned(tx: Tx, plan: LegacyBackfillPlan, expected: BackfillPrediction): Promise<BackfillPrediction> {
  const rows = await loadCompletionRows(tx, plan.eventId);
  if (!rows.graph || rows.graph.eventId !== plan.eventId || !rows.graph.matches.length) throw new Error("Backfill check failed: the competition graph is not readable");
  const prediction = predictFromRows(rows);
  if (!prediction.final?.official) throw new Error("Backfill check failed: the final is not an official result");
  if (prediction.final.winnerTeamId !== expected.final?.winnerTeamId || prediction.final.loserTeamId !== expected.final?.loserTeamId) {
    throw new Error("Backfill check failed: champion or runner-up differs from the plan");
  }
  if (JSON.stringify(prediction.readiness) !== JSON.stringify(expected.readiness)) throw new Error("Backfill check failed: readiness differs from the plan");
  return prediction;
}

/**
 * Write a plan inside the caller's transaction. Throws on any problem so the caller rolls back; returns
 * "skipped" without writing when the event already has V3 structures. Never deletes or edits games or statistics.
 */
export async function applyLegacyBackfill(tx: Tx, plan: LegacyBackfillPlan, expected: BackfillPrediction): Promise<BackfillApplyOutcome> {
  const refusal = await assertWritable(tx, plan);
  if (refusal) return { status: "skipped", reason: refusal };
  const version = plan.competitionVersion + 1;
  await bumpEvent(tx, plan);
  await writeStructure(tx, plan);
  await writeHistory(tx, plan, version);
  const prediction = await assertWrittenAsPlanned(tx, plan, expected);
  return { status: "applied", version, prediction };
}
