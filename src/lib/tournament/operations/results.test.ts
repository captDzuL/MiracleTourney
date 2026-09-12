import { describe, expect, it } from "vitest";
import { createCompetitionOperations, type OperationCommand } from "./index";
import { operationStore } from "./test-store";
import { TOURNAMENT_FORMAT_PRESETS } from "../formats/types";
import type { CompetitionGraph, CompetitionMatch } from "../competition";

const actor = { id: "owner", role: "organizer" };
const scheduling = { timezone: "Asia/Jakarta", eventWindow: { start: "2026-09-12T00:00:00Z", end: "2026-09-14T00:00:00Z" }, matchDurationMinutes: 10, bufferMinutes: 0, minimumRestMinutes: 0, rooms: ["room"] };
const games = (bestOf = 1, away = false) => Array.from({ length: Math.ceil(bestOf / 2) }, (_, i) => ({ gameNumber: i + 1, homeScore: away ? 0 : 2, awayScore: away ? 2 : 0 }));
async function fixture(format: keyof typeof TOURNAMENT_FORMAT_PRESETS = "singleElimination", count = 4) {
  const store = operationStore();
  const service = createCompetitionOperations(store.db, () => new Date("2026-09-12T10:00:00Z"));
  const teams = ["a", "b", ...Array.from({ length: count - 2 }, (_, i) => `t${i + 3}`)];
  teams.slice(2).forEach(id => store.seed("team", { id, eventId: "event" }));
  let key = 0;
  const run = (command: OperationCommand) => service.execute({ eventId: "event", actor, expectedVersion: Number(store.rows("event")[0].competitionVersion), idempotencyKey: `r${++key}`, command });
  await run({ kind: "initialize", config: TOURNAMENT_FORMAT_PRESETS[format], teams: teams.map((id, i) => ({ id, seed: i + 1 })) });
  const graph = (store.rows("competitionPhase")[0].configuration as { graph: CompetitionGraph }).graph;
  const submit = (m: CompetitionMatch, away = false) => run({ kind: "result_submit", matchId: m.id, games: games(m.bestOf, away) } as OperationCommand);
  return { ...store, service, run, graph, submit };
}

describe("official result transaction", () => {
  it.each(["singleElimination", "doubleElimination"] as const)("advances winner and loser through %s and records final placements", async format => {
    const f = await fixture(format);
    for (const m of f.graph.matches.filter(m => m.status === "pending")) {
      const before = f.rows("match").find(row => row.id === m.id)!;
      expect(before.homeTeamId).toBeTruthy(); expect(before.awayTeamId).toBeTruthy();
      await f.submit(m);
      expect(f.rows("match").find(row => row.id === m.id)).toMatchObject({ status: "Completed", scheduleStatus: "completed", resultVersion: 1, winnerTeamId: before.homeTeamId });
      for (const edge of f.graph.dependencies.filter(d => d.sourceMatchId === m.id)) {
        expect(f.rows("match").find(row => row.id === edge.targetMatchId)![`${edge.targetSlot}TeamId`]).toBe(edge.outcome === "winner" ? before.homeTeamId : before.awayTeamId);
      }
    }
    const projection = (f.rows("competitionPhase")[0].configuration as { projection: { placements: { rank: number; teamId: string }[] } }).projection;
    expect(projection.placements.find(p => p.rank === 1)?.teamId).toBe("a");
    expect(f.rows("matchResultRevision")).toHaveLength(f.graph.matches.length);
  });

  it("records a draw without inventing a winner and updates configured standings", async () => {
    const f = await fixture("roundRobin", 2); const m = f.graph.matches[0];
    await f.run({ kind: "result_submit", matchId: m.id, games: [{ gameNumber: 1, homeScore: 4, awayScore: 4 }] } as OperationCommand);
    expect(f.rows("match")[0]).toMatchObject({ homeScore: 4, awayScore: 4, winnerTeamId: null, resultVersion: 1 });
    const config = f.rows("competitionPhase")[0].configuration as { projection: { standings: { rows: unknown[] }[] } };
    expect(config.projection.standings[0].rows).toEqual(expect.arrayContaining([expect.objectContaining({ teamId: "a", points: 1, draws: 1, played: 1 }), expect.objectContaining({ teamId: "b", points: 1, draws: 1 })]));
  });

  it("qualifies completed groups into playoffs and propagates their winners", async () => {
    const f = await fixture("groupPlayoffs", 16);
    const groupGames = f.graph.matches.filter(m => m.groupId);
    await f.submit(groupGames[0]);
    expect(f.rows("match").filter(m => m.phaseId === "event:phase:2").every(m => !m.homeTeamId && !m.awayTeamId)).toBe(true);
    for (const m of groupGames.slice(1)) await f.submit(m, m.home.kind === "team" && m.away.kind === "team" && m.home.seed > m.away.seed);
    for (const m of f.graph.matches.filter(m => !m.groupId)) await f.submit(m);
    expect(f.rows("match").every(m => m.status === "Completed")).toBe(true);
  });

  it.each([[[]], [[{ gameNumber: 1, homeScore: 2, awayScore: 2 }]], [[{ gameNumber: 1, homeScore: 1, awayScore: 0 }]], [[{ gameNumber: 2, homeScore: 2, awayScore: 0 }, { gameNumber: 3, homeScore: 2, awayScore: 0 }]], [games(5)]])("rejects invalid or incomplete best-of series %j", async invalid => {
    const f = await fixture();
    await expect(f.run({ kind: "result_submit", matchId: f.graph.matches[0].id, games: invalid } as OperationCommand)).rejects.toThrow();
    expect(f.rows("matchResultRevision")).toEqual([]); expect(f.rows("event")[0].competitionVersion).toBe(1);
  });

  it("returns the identical committed revision for a retry and conflicts on another stale writer", async () => {
    const f = await fixture(); const m = f.graph.matches[0];
    const request = { eventId: "event", actor, expectedVersion: 1, idempotencyKey: "same", command: { kind: "result_submit", matchId: m.id, games: games(m.bestOf) } as OperationCommand };
    const receipt = await f.service.execute(request);
    expect(await f.service.execute(request)).toEqual(receipt);
    await expect(f.service.execute({ ...request, idempotencyKey: "stale" })).rejects.toThrow("Version conflict");
    expect(f.rows("matchResultRevision")).toHaveLength(1);
    await expect(f.submit(m)).rejects.toThrow("correction");
  });

  it.each(["matchResultRevision", "match", "competitionPhase", "scheduleRevision", "competitionActionItem", "competitionAuditLog"])("rolls back every result effect when %s fails", async table => {
    const f = await fixture(); const draft = await f.run({ kind: "schedule_save", input: scheduling });
    await f.run({ kind: "schedule_publish", revisionId: draft.resourceId! });
    const tables = ["event", "match", "matchResultRevision", "competitionPhase", "scheduleRevision", "competitionActionItem", "competitionAuditLog"];
    const before = tables.map(f.rows); f.failWrites(table);
    await expect(f.submit(f.graph.matches[0])).rejects.toThrow("storage failure");
    expect(tables.map(f.rows)).toEqual(before);
  });

  it("recalculates a fresh affected draft, resolves result actions and never copies player statistics", async () => {
    const f = await fixture(); const m = f.graph.matches[0];
    const draft = await f.run({ kind: "schedule_save", input: scheduling });
    await f.run({ kind: "schedule_publish", revisionId: draft.resourceId! });
    const published = await f.service.readPublishedSchedule("event");
    f.seed("competitionActionItem", { id: "result-action", eventId: "event", matchId: m.id, conditionKey: `result:${m.id}`, resolvedAt: null });
    await f.submit(m);
    expect(await f.service.readPublishedSchedule("event")).toEqual(published);
    const next = f.rows("scheduleRevision").at(-1)!;
    expect(next.status).toBe("draft");
    expect((await f.service.readScheduleDraft("event", String(next.id), actor))?.draft).toMatchObject({ feasible: true, recalculatedMatchIds: ["event:single:r2:m1"] });
    expect(f.rows("competitionActionItem").find(a => a.id === "result-action")?.resolvedAt).toBeInstanceOf(Date);
    expect(f.rows("matchResultRevision")[0].scoreSnapshot).toEqual({ bestOf: 3, games: games(3), homeTeamId: "a", awayTeamId: "t4", homeScore: 2, awayScore: 0, winnerTeamId: "a", loserTeamId: "t4" });
  });
});

describe("guarded official correction", () => {
  it("rejects a stale or changed-score preview even with a current write version", async () => {
    const f = await fixture(); const m = f.graph.matches[0]; await f.submit(m);
    const preview = await f.service.previewResultCorrection({ eventId: "event", actor, matchId: m.id, games: games(m.bestOf, true) });
    await expect(f.run({ kind: "result_correct", matchId: m.id, games: games(m.bestOf), reason: "Wrong score", previewToken: preview.token })).rejects.toThrow("preview");
    await f.run({ kind: "announcement_save", title: "Notice", body: "Hello" });
    await expect(f.run({ kind: "result_correct", matchId: m.id, games: games(m.bestOf, true), reason: "Wrong score", previewToken: preview.token })).rejects.toThrow("preview");
    await expect(f.service.previewResultCorrection({ eventId: "event", actor: { id: "other", role: "organizer" }, matchId: m.id, games: games(m.bestOf) })).rejects.toThrow("Not authorized");
  });

  it("revokes tied qualification slots, resets readiness, and restores them when corrected", async () => {
    const f = await fixture("groupPlayoffs", 16);
    const group = f.graph.groups[0];
    const fixtures = f.graph.matches.filter(m => m.groupId === group.id);
    for (const m of fixtures) await f.submit(m, m.home.kind === "team" && m.away.kind === "team" && m.home.seed > m.away.seed);
    const targetId = f.graph.qualificationDependencies.find(d => d.groupId === group.id && d.rank === 2)!.targetMatchId;
    const original = f.rows("match").find(m => m.id === targetId)!;
    const targetTeam = [original.homeTeamId, original.awayTeamId].find(Boolean)!;
    await f.run({ kind: "readiness_update", matchId: targetId, teamId: String(targetTeam), status: "ready" });
    // Replacing each score with a draw creates an unresolved qualification tie.
    for (const m of fixtures) {
      const tiedGames = [{ gameNumber: 1, homeScore: 0, awayScore: 0 }];
      const preview = await f.service.previewResultCorrection({ eventId: "event", actor, matchId: m.id, games: tiedGames });
      await f.run({ kind: "result_correct", matchId: m.id, games: tiedGames, reason: "Draw confirmed", previewToken: preview.token });
    }
    expect(f.rows("competitionActionItem").find(a => a.conditionKey === `standings-tie:${group.id}`)).toMatchObject({ resolvedAt: null });
    expect(f.rows("match").find(m => m.id === targetId)).toMatchObject({ homeTeamId: "", awayTeamId: "" });
    expect(f.rows("matchReadiness")[0]).toMatchObject({ status: "pending", readyAt: null });
    for (const m of fixtures) {
      const corrected = games(1, m.home.kind === "team" && m.away.kind === "team" && m.home.seed > m.away.seed);
      const preview = await f.service.previewResultCorrection({ eventId: "event", actor, matchId: m.id, games: corrected });
      await f.run({ kind: "result_correct", matchId: m.id, games: corrected, reason: "Official score confirmed", previewToken: preview.token });
    }
    expect(f.rows("match").find(m => m.id === targetId)).toMatchObject({ homeTeamId: original.homeTeamId, awayTeamId: original.awayTeamId });
    expect(f.rows("competitionActionItem").find(a => a.conditionKey === `standings-tie:${group.id}`)?.resolvedAt).toBeInstanceOf(Date);
  });

  it("rolls back an allowed correction at the final audit write", async () => {
    const f = await fixture(); const m = f.graph.matches[0]; await f.submit(m);
    const preview = await f.service.previewResultCorrection({ eventId: "event", actor, matchId: m.id, games: games(m.bestOf, true) });
    const tables = ["event", "match", "matchResultRevision", "competitionPhase", "competitionAuditLog"];
    const before = tables.map(f.rows); f.failWrites("competitionAuditLog");
    await expect(f.run({ kind: "result_correct", matchId: m.id, games: games(m.bestOf, true), reason: "Wrong score", previewToken: preview.token })).rejects.toThrow("storage failure");
    expect(tables.map(f.rows)).toEqual(before);
  });
  it("requires a matching preview and reason, then appends a revision and replaces downstream participants", async () => {
    const f = await fixture(); const m = f.graph.matches[0]; await f.submit(m);
    const command = { kind: "result_correct", matchId: m.id, games: games(m.bestOf, true), reason: "Scores transposed", previewToken: "missing" } as OperationCommand;
    await expect(f.run(command)).rejects.toThrow("preview");
    const preview = await f.service.previewResultCorrection({ eventId: "event", actor, matchId: m.id, games: games(m.bestOf, true) });
    expect(preview.affectedMatchIds).toContain("event:single:r2:m1");
    await expect(f.run({ ...command, previewToken: preview.token, reason: " " } as OperationCommand)).rejects.toThrow();
    const original = f.rows("matchResultRevision")[0];
    await f.run({ ...command, previewToken: preview.token } as OperationCommand);
    expect(f.rows("matchResultRevision")[0]).toEqual(original);
    expect(f.rows("matchResultRevision")).toHaveLength(2);
    expect(f.rows("match").find(row => row.id === m.id)).toMatchObject({ resultVersion: 2, winnerTeamId: "t4" });
    expect(f.rows("match").find(row => row.id === "event:single:r2:m1")?.homeTeamId).toBe("t4");
  });

  it.each(["Live", "Completed"])("blocks correction through transitive descendants with status %s", async status => {
    const f = await fixture("singleElimination", 8); const m = f.graph.matches[0]; await f.submit(m);
    await f.db.$transaction(tx => tx.match.update({ where: { id: "event:single:r3:m1" }, data: { status } }));
    const preview = await f.service.previewResultCorrection({ eventId: "event", actor, matchId: m.id, games: games(m.bestOf, true) });
    expect(preview.blockedMatchIds).toContain("event:single:r3:m1");
    await expect(f.run({ kind: "result_correct", matchId: m.id, games: games(m.bestOf, true), reason: "Wrong score", previewToken: preview.token } as OperationCommand)).rejects.toThrow("dependent");
    expect(f.rows("matchResultRevision")).toHaveLength(1);
  });

  it("blocks group correction after a qualification descendant starts", async () => {
    const f = await fixture("groupPlayoffs", 16); const m = f.graph.matches[0]; await f.submit(m);
    const playoffId = f.graph.qualificationDependencies.find(d => d.groupId === m.groupId)!.targetMatchId;
    await f.db.$transaction(tx => tx.match.update({ where: { id: playoffId }, data: { status: "Live" } }));
    const preview = await f.service.previewResultCorrection({ eventId: "event", actor, matchId: m.id, games: games() });
    expect(preview.blockedMatchIds).toContain(playoffId);
  });
});
