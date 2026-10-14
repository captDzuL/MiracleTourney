import type { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { applyLegacyBackfill, BACKFILL_AUDIT_ACTION, backfillIdempotencyKey } from "./legacy-backfill-apply";
import { legacyFixture, FIXTURE_NOW, type FixtureOptions } from "./legacy-backfill-fixtures";
import { loadBackfillInput } from "./legacy-backfill-io";
import { planLegacyBackfill } from "./legacy-backfill";
import { tournamentFormatConfigSchema } from "../formats/types";
import { readGraph } from "./state";
import { operationStore } from "./test-store";

const S3: FixtureOptions = { eventId: "s3", teamCount: 26, bestOf: { final: 3 }, withGames: true, withThirdPlace: true, organizerUserId: null };

type Tx = Prisma.TransactionClient;

function seededStore(options: FixtureOptions = S3, users: string[] = ["actor-1"]) {
  const store = operationStore();
  const fixture = legacyFixture(options);
  const { input } = fixture;
  store.seed("event", { ...input.event, status: "Finished" });
  for (const team of input.teams) store.seed("team", { id: team.id, eventId: input.event.id, name: team.name });
  for (const match of input.matches) {
    store.seed("match", { ...match, eventId: input.event.id, scheduleStatus: "estimated", phaseId: null, scheduleMetadata: null });
  }
  for (const rule of input.roundConfigs) store.seed("eventRoundConfig", { eventId: input.event.id, ...rule });
  for (const game of input.matchGames) store.seed("matchGame", game);
  const run = <T>(work: (tx: Tx) => Promise<T>) => store.db.$transaction(async (raw) => {
    const tx = { ...(raw as object), user: { findUnique: async ({ where }: { where: { id: string } }) => (users.includes(where.id) ? { id: where.id } : null) }, statSubmission: { findMany: async () => [] } };
    return work(tx as unknown as Tx);
  });
  return { store, fixture, run, eventId: input.event.id };
}

async function planInside(run: ReturnType<typeof seededStore>["run"], eventId: string, thirdPlace = legacyFixture(S3).input.thirdPlace) {
  return run(async (tx) => {
    const input = await loadBackfillInput(tx, eventId, { actorUserId: "actor-1", now: FIXTURE_NOW, thirdPlace });
    const result = planLegacyBackfill(input);
    if (!result.ok) throw new Error(result.problems.join(" | "));
    return result;
  });
}

const snapshotOf = (store: ReturnType<typeof operationStore>) =>
  JSON.stringify(["event", "team", "match", "matchGame", "competitionPhase", "matchDependency", "matchResultRevision", "competitionAuditLog"].map((table) => store.rows(table)));

describe("applying a legacy backfill plan", () => {
  it("writes the phase, match fields, third place match, dependencies, revisions and audit entry", async () => {
    const { store, run, eventId } = seededStore();
    const { plan, prediction } = await planInside(run, eventId);
    const outcome = await run((tx) => applyLegacyBackfill(tx, plan, prediction));

    expect(outcome).toMatchObject({ status: "applied", version: 5 });
    const event = store.rows("event").find((row) => row.id === eventId)!;
    expect(event.competitionVersion).toBe(5);
    expect(tournamentFormatConfigSchema.safeParse(event.formatConfig).success).toBe(true);
    expect(store.rows("competitionPhase")).toHaveLength(1);
    const matches = store.rows("match").filter((row) => row.eventId === eventId);
    expect(matches).toHaveLength(26);
    expect(matches.every((row) => row.resultVersion === 1 && row.scheduleStatus === "completed" && row.phaseId === "s3:phase:1")).toBe(true);
    expect(matches.find((row) => row.id === "s3:third_place:r1:m1")).toMatchObject({ roundLabel: "Third Place", round: 6, slot: 1, homeScore: 1, awayScore: 0 });
    expect(store.rows("matchResultRevision")).toHaveLength(26);
    expect(store.rows("matchDependency").length).toBe(plan.dependencies.length);
    const audit = store.rows("competitionAuditLog");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ eventId, actorUserId: "actor-1", action: BACKFILL_AUDIT_ACTION, idempotencyKey: backfillIdempotencyKey(eventId) });
  });

  it("leaves a graph the competition operations can read, with stored match ids", async () => {
    const { run, eventId } = seededStore();
    const { plan, prediction } = await planInside(run, eventId);
    await run((tx) => applyLegacyBackfill(tx, plan, prediction));
    const graph = await run((tx) => readGraph(tx, eventId));
    expect(graph.eventId).toBe(eventId);
    expect(graph.matches.some((node) => node.id === "s3-r5-m1")).toBe(true);
    expect(graph.placements.map((placement) => placement.rank)).toEqual([1, 2, 3]);
  });

  it("never changes games or statistics", async () => {
    const { store, run, eventId } = seededStore();
    const before = JSON.stringify([store.rows("matchGame"), store.rows("playerStat")]);
    const { plan, prediction } = await planInside(run, eventId);
    await run((tx) => applyLegacyBackfill(tx, plan, prediction));
    expect(JSON.stringify([store.rows("matchGame"), store.rows("playerStat")])).toBe(before);
  });

  it("is a no-op the second time", async () => {
    const { store, run, eventId } = seededStore();
    const { plan, prediction } = await planInside(run, eventId);
    await run((tx) => applyLegacyBackfill(tx, plan, prediction));
    const after = snapshotOf(store);
    const again = await run((tx) => applyLegacyBackfill(tx, plan, prediction));
    expect(again).toMatchObject({ status: "skipped" });
    expect(snapshotOf(store)).toBe(after);
  });

  it("rolls everything back when a write fails midway", async () => {
    const { store, run, eventId } = seededStore();
    const { plan, prediction } = await planInside(run, eventId);
    const before = snapshotOf(store);
    store.failWrites("matchResultRevision");
    await expect(run((tx) => applyLegacyBackfill(tx, plan, prediction))).rejects.toThrow("storage failure");
    expect(snapshotOf(store)).toBe(before);
  });

  it("rolls back when the written rows do not give the predicted champion", async () => {
    const { store, run, eventId } = seededStore();
    const { plan, prediction } = await planInside(run, eventId);
    const before = snapshotOf(store);
    const wrong = { ...prediction, final: { ...prediction.final!, winnerTeamId: "someone-else" } };
    await expect(run((tx) => applyLegacyBackfill(tx, plan, wrong))).rejects.toThrow("champion or runner-up differs");
    expect(snapshotOf(store)).toBe(before);
  });

  it("rolls back when the readiness read back differs from the plan", async () => {
    const { store, run, eventId } = seededStore();
    const { plan, prediction } = await planInside(run, eventId);
    const before = snapshotOf(store);
    const wrong = { ...prediction, readiness: { ...prediction.readiness, ready: !prediction.readiness.ready } };
    await expect(run((tx) => applyLegacyBackfill(tx, plan, wrong))).rejects.toThrow("readiness differs");
    expect(snapshotOf(store)).toBe(before);
  });

  it("refuses an actor that is not a user", async () => {
    const { store, run, eventId } = seededStore(S3, []);
    const { plan, prediction } = await planInside(run, eventId);
    const before = snapshotOf(store);
    await expect(run((tx) => applyLegacyBackfill(tx, plan, prediction))).rejects.toThrow("does not exist");
    expect(snapshotOf(store)).toBe(before);
  });

  it("refuses when someone changed the event version after planning", async () => {
    const { store, run, eventId } = seededStore();
    const { plan, prediction } = await planInside(run, eventId);
    store.updateRow("event", eventId, { competitionVersion: 9 });
    await expect(run((tx) => applyLegacyBackfill(tx, plan, prediction))).rejects.toThrow("Version conflict");
  });

  it("refuses an event whose completion is already locked", async () => {
    const { store, run, eventId } = seededStore();
    const { plan, prediction } = await planInside(run, eventId);
    store.seed("tournamentCompletion", { eventId, status: "completed" });
    await expect(run((tx) => applyLegacyBackfill(tx, plan, prediction))).rejects.toThrow("locks competitive writes");
  });
});

describe("loading planner input", () => {
  it("reads existing V3 rows so the planner can refuse", async () => {
    const { store, run, eventId } = seededStore({ teamCount: 8, eventId: "s1" });
    store.seed("competitionPhase", { id: "p", eventId });
    const input = await run((tx) => loadBackfillInput(tx, eventId, { actorUserId: "actor-1", now: FIXTURE_NOW }));
    expect(input.existing).toEqual({ phaseCount: 1, resultRevisionCount: 0, dependencyCount: 0 });
    const result = planLegacyBackfill(input);
    expect(result.ok).toBe(false);
  });
});
