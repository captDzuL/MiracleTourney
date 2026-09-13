import { describe, expect, it } from "vitest";
import { diagnoseLegacyCompetition } from "./legacy-compatibility";
import { createCompetitionOperations } from "./index";
import { operationStore } from "./test-store";
import { TOURNAMENT_FORMAT_PRESETS } from "../formats/types";
import { generateCompetitionGraph } from "../competition";

const teams = [{ id: "a", seed: 1 }, { id: "b", seed: 2 }];
const event = { id: "event", format: "League", formatConfig: TOURNAMENT_FORMAT_PRESETS.roundRobin };
const match = { id: "legacy", round: 1, slot: 1, homeTeamId: "a", awayTeamId: "b", homeScore: 0, awayScore: 0, status: "Scheduled", resultVersion: 0, winnerTeamId: null, scheduledLabel: "Original label" };
describe("legacy competition compatibility", () => {
  it("reconciles authoritative per-round best-of into a representable Single Elimination config", () => {
    const final = { ...match, roundLabel: "Final" };
    const result = diagnoseLegacyCompetition(
      { ...event, format: "Single Elimination", formatConfig: TOURNAMENT_FORMAT_PRESETS.singleElimination },
      teams,
      [final],
      { roundConfigs: [{ eventId: "event", roundLabel: "Final", bestOf: 3 }], matchGames: [] },
    );
    expect(result.graph?.matches[0]).toMatchObject({ id: "legacy", bestOf: 3 });
    expect(result.graph?.config).toMatchObject({ kind: "single_elimination", bestOf: { final: 3 } });
  });
  it("uses the legacy BO1 default when no authoritative round rule exists", () => {
    const result = diagnoseLegacyCompetition({ ...event, format: "Single Elimination", formatConfig: TOURNAMENT_FORMAT_PRESETS.singleElimination }, teams, [{ ...match, roundLabel: "Final" }], { roundConfigs: [], matchGames: [] });
    expect(result.graph?.matches[0]).toMatchObject({ id: "legacy", bestOf: 1 });
    expect(result.graph?.config).toMatchObject({ kind: "single_elimination", bestOf: { final: 1 } });
  });
  it("blocks round rules that cannot be represented without semantic loss", () => {
    const result = diagnoseLegacyCompetition(event, teams, [{ ...match, roundLabel: "Matchday 1" }], { roundConfigs: [{ eventId: "event", roundLabel: "Matchday 1", bestOf: 3 }], matchGames: [] });
    expect(result).toMatchObject({ status: "blocked", reason: "incompatible_round_rules", graph: null });
  });
  it("blocks different legacy rules that collapse into one V3 early-round bucket", () => {
    const manyTeams = Array.from({ length: 16 }, (_, index) => ({ id: `t${index + 1}`, seed: index + 1 }));
    const config = TOURNAMENT_FORMAT_PRESETS.singleElimination;
    const generated = generateCompetitionGraph({ eventId: "event", config, teams: manyTeams });
    const legacyMatches = generated.matches.map(node => ({
      id: `legacy-${node.round}-${node.slot}`, round: node.round, slot: node.slot,
      roundLabel: node.round === 1 ? "Round of 16" : node.round === 2 ? "Quarterfinal" : node.round === 3 ? "Semifinal" : "Final",
      homeTeamId: node.home.kind === "team" ? node.home.teamId : "", awayTeamId: node.away.kind === "team" ? node.away.teamId : "",
      homeScore: 0, awayScore: 0, status: "Scheduled", resultVersion: 0, winnerTeamId: null,
    }));
    const result = diagnoseLegacyCompetition({ ...event, format: "Single Elimination", formatConfig: config }, manyTeams, legacyMatches, {
      roundConfigs: [
        { eventId: "event", roundLabel: "Round of 16", bestOf: 1 },
        { eventId: "event", roundLabel: "Quarterfinal", bestOf: 3 },
      ],
      matchGames: [],
    });
    expect(result).toMatchObject({ status: "blocked", reason: "incompatible_round_rules", graph: null });
  });
  it("blocks orphan, invalid, and ambiguous authoritative round rules", () => {
    for (const roundConfigs of [
      [{ eventId: "event", roundLabel: "Unknown", bestOf: 3 }],
      [{ eventId: "event", roundLabel: "Matchday 1", bestOf: 2 }],
      [{ eventId: "event", roundLabel: "Matchday 1", bestOf: 1 }, { eventId: "event", roundLabel: "Matchday 1", bestOf: 3 }],
    ]) expect(diagnoseLegacyCompetition(event, teams, [{ ...match, roundLabel: "Matchday 1" }], { roundConfigs, matchGames: [] })).toMatchObject({ status: "blocked", reason: "incompatible_round_rules", graph: null });
  });
  it("treats MatchGame rows as recorded-result evidence", () => {
    expect(diagnoseLegacyCompetition(event, teams, [match], { roundConfigs: [], matchGames: [{ matchId: "legacy" }] })).toMatchObject({ status: "blocked", reason: "existing_results", graph: null });
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
  it("uses the same authoritative round rules inside the upgrade transaction", async () => {
    const store = operationStore();
    await store.db.$transaction(async tx => { await tx.event.update({ where: { id: "event" }, data: { ...event, format: "Single Elimination", formatConfig: TOURNAMENT_FORMAT_PRESETS.singleElimination } }); });
    store.seed("match", { ...match, eventId: "event", roundLabel: "Final" });
    store.seed("eventRoundConfig", { id: "round-final", eventId: "event", roundLabel: "Final", bestOf: 3 });
    await createCompetitionOperations(store.db).execute({ eventId: "event", actor: { id: "owner", role: "organizer" }, expectedVersion: 0, idempotencyKey: "upgrade-rule", command: { kind: "legacy_upgrade" } });
    expect(store.rows("event")[0].formatConfig).toMatchObject({ kind: "single_elimination", bestOf: { final: 3 } });
    expect(store.rows("match")[0].scheduleMetadata).toMatchObject({ graphMatch: { bestOf: 3 } });
  });
  it("rolls back CAS and all writes when MatchGame evidence appears in the transaction", async () => {
    const store = operationStore();
    await store.db.$transaction(async tx => { await tx.event.update({ where: { id: "event" }, data: event }); });
    store.seed("match", { ...match, eventId: "event" });
    store.seed("matchGame", { id: "game", matchId: "legacy", gameNumber: 1, homeScore: 1, awayScore: 0 });
    await expect(createCompetitionOperations(store.db).execute({ eventId: "event", actor: { id: "owner", role: "organizer" }, expectedVersion: 0, idempotencyKey: "upgrade-game", command: { kind: "legacy_upgrade" } })).rejects.toThrow("existing_results");
    expect(store.rows("competitionPhase")).toEqual([]);
    expect(store.rows("event")[0].competitionVersion).toBe(0);
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
