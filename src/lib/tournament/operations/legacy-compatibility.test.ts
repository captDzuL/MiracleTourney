import { describe, expect, it } from "vitest";
import { diagnoseLegacyCompetition } from "./legacy-compatibility";
import { createCompetitionOperations } from "./index";
import { operationStore } from "./test-store";
import { TOURNAMENT_FORMAT_PRESETS } from "../formats/types";

const teams = [{ id: "a", seed: 1 }, { id: "b", seed: 2 }];
const event = { id: "event", format: "League", formatConfig: TOURNAMENT_FORMAT_PRESETS.roundRobin };
const match = { id: "legacy", round: 1, slot: 1, homeTeamId: "a", awayTeamId: "b", homeScore: 0, awayScore: 0, status: "Scheduled", resultVersion: 0, winnerTeamId: null, scheduledLabel: "Original label" };
describe("legacy competition compatibility", () => {
  it("adopts explicit unplayed Single Elimination rules without changing best-of or match IDs", () => {
    const result = diagnoseLegacyCompetition({ ...event, format: "Single Elimination", formatConfig: TOURNAMENT_FORMAT_PRESETS.singleElimination }, teams, [match]);
    expect(result.graph?.matches[0]).toMatchObject({ id: "legacy", bestOf: 5 });
  });
  it("blocks V3 readiness mutation of unadopted legacy matches", async () => {
    const store = operationStore(); store.seed("match", { ...match, eventId: "event" });
    await expect(createCompetitionOperations(store.db).execute({ eventId: "event", actor: { id: "owner", role: "organizer" }, expectedVersion: 0, idempotencyKey: "unsafe", command: { kind: "readiness_update", matchId: "legacy", teamId: "a", status: "ready" } })).rejects.toThrow("Competition not initialized");
    expect(store.rows("matchReadiness")).toEqual([]);
    expect(store.rows("event")[0].competitionVersion).toBe(0);
  });
  it("adopts an exact unplayed league graph while retaining match identity", () => {
    const result = diagnoseLegacyCompetition(event, teams, [match]);
    expect(result.status).toBe("ready");
    expect(result.graph?.matches[0]).toMatchObject({ id: "legacy", home: { teamId: "a" }, away: { teamId: "b" } });
  });
  it("derives configuration only for empty supported legacy competitions", () => {
    expect(diagnoseLegacyCompetition({ ...event, format: "Single Elimination", formatConfig: null }, teams, []).graph?.config.kind).toBe("single_elimination");
    expect(diagnoseLegacyCompetition({ ...event, formatConfig: null }, teams, [match]).reason).toBe("ambiguous_configuration");
  });
  it.each([{ status: "Completed" }, { status: "Live" }, { homeScore: 1 }, { resultVersion: 1 }, { winnerTeamId: "a" }])("refuses existing result or live evidence: %j", evidence => {
    expect(diagnoseLegacyCompetition(event, teams, [{ ...match, ...evidence }]).reason).toBe("existing_results");
  });
  it("rejects partial, duplicate and ambiguous graphs without a migration projection", () => {
    for (const rows of [[match, { ...match, id: "duplicate" }], [{ ...match, awayTeamId: "outside" }]]) {
      expect(diagnoseLegacyCompetition(event, teams, rows)).toMatchObject({ status: "blocked", reason: "graph_mismatch", graph: null });
    }
    expect(diagnoseLegacyCompetition({ ...event, format: "Swiss" }, teams, []).reason).toBe("unsupported_format");
  });
  it("upgrades transactionally, preserves labels and retries without duplicate phases", async () => {
    const store = operationStore();
    await store.db.$transaction(async tx => { await tx.event.update({ where: { id: "event" }, data: event }); });
    store.seed("match", { ...match, eventId: "event" });
    const service = createCompetitionOperations(store.db);
    const input = { eventId: "event", actor: { id: "owner", role: "organizer" }, expectedVersion: 0, idempotencyKey: "upgrade", command: { kind: "legacy_upgrade" as const } };
    const receipt = await service.execute(input);
    expect(await service.execute(input)).toEqual(receipt);
    expect(store.rows("match")).toHaveLength(1);
    expect(store.rows("match")[0]).toMatchObject({ id: "legacy", scheduledLabel: "Original label", homeScore: 0, resultVersion: 0 });
    expect(store.rows("competitionPhase")).toHaveLength(1);
  });
  it("rolls back version, matches and phase on partial storage failure", async () => {
    const store = operationStore();
    await store.db.$transaction(async tx => { await tx.event.update({ where: { id: "event" }, data: event }); });
    store.seed("match", { ...match, eventId: "event" }); store.failWrites("match");
    await expect(createCompetitionOperations(store.db).execute({ eventId: "event", actor: { id: "owner", role: "organizer" }, expectedVersion: 0, idempotencyKey: "upgrade", command: { kind: "legacy_upgrade" } })).rejects.toThrow("storage failure");
    expect(store.rows("competitionPhase")).toEqual([]);
    expect(store.rows("event")[0].competitionVersion).toBe(0);
    expect(store.rows("match")[0]).toEqual({ ...match, eventId: "event" });
  });
});
