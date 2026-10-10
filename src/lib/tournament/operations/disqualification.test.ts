import { describe, expect, it } from "vitest";
import { createCompetitionOperations, type OperationCommand } from "./index";
import { operationStore } from "./test-store";
import { TOURNAMENT_FORMAT_PRESETS } from "../formats/types";
import type { CompetitionGraph, CompetitionMatch } from "../competition";
import type { StandingsTable } from "./result-projection";

const actor = { id: "owner", role: "organizer" };
const scheduling = { timezone: "Asia/Jakarta", eventWindow: { start: "2026-09-12T00:00:00Z", end: "2026-09-14T00:00:00Z" }, matchDurationMinutes: 10, bufferMinutes: 0, minimumRestMinutes: 0, rooms: ["room"] };
const games = (bestOf = 1, away = false) => Array.from({ length: Math.ceil(bestOf / 2) }, (_, i) => ({ gameNumber: i + 1, homeScore: away ? 0 : 2, awayScore: away ? 2 : 0 }));

// 4 groups of 4, top 2 of each group qualify into an 8-team single elimination.
async function fixture() {
  const store = operationStore();
  const service = createCompetitionOperations(store.db, () => new Date("2026-09-12T10:00:00Z"), { allowInternalInitialize: true });
  const teams = ["a", "b", ...Array.from({ length: 14 }, (_, i) => `t${i + 3}`)];
  teams.slice(2).forEach(id => store.seed("team", { id, eventId: "event" }));
  let key = 0;
  const run = (command: OperationCommand) => service.execute({ eventId: "event", actor, expectedVersion: Number(store.rows("event")[0].competitionVersion), idempotencyKey: `r${++key}`, command });
  await run({ kind: "initialize", config: TOURNAMENT_FORMAT_PRESETS.groupPlayoffs, teams: teams.map((id, i) => ({ id, seed: i + 1 })) });
  const graph = (store.rows("competitionPhase")[0].configuration as { graph: CompetitionGraph }).graph;
  const start = (m: CompetitionMatch) => store.db.$transaction(async tx => tx.match.update({ where: { id: m.id }, data: { status: "Live", scheduleStatus: "live", actualStartedAt: new Date("2026-09-12T09:00:00Z") } }));
  // The better (lower) seed always wins, so standings are strict and ties never muddy a test.
  const awayWins = (m: CompetitionMatch) => m.home.kind === "team" && m.away.kind === "team" && m.home.seed > m.away.seed;
  const submit = async (m: CompetitionMatch) => { await start(m); return run({ kind: "result_submit", matchId: m.id, games: games(m.bestOf, awayWins(m)) } as OperationCommand); };
  const involves = (m: CompetitionMatch, teamId: string) => [m.home, m.away].some(s => s.kind === "team" && s.teamId === teamId);
  const groupFixtures = (groupId: string) => graph.matches.filter(m => m.groupId === groupId);
  const standings = () => (store.rows("competitionPhase")[0].configuration as { projection: { standings: StandingsTable[] } }).projection.standings;
  const table = (groupId: string) => standings().find(t => t.groupId === groupId)!;
  const match = (id: string) => store.rows("match").find(m => m.id === id)!;
  const slot = (dep: CompetitionGraph["qualificationDependencies"][number]) => String(match(dep.targetMatchId)[`${dep.targetSlot}TeamId`]);
  const preview = (teamId: string) => service.previewTeamDisqualification({ eventId: "event", actor, teamId });
  const disqualify = async (teamId: string, reason = "Used a stand-in player") => {
    const impact = await preview(teamId);
    await run({ kind: "team_disqualify", teamId, reason, previewToken: impact.token });
    return impact;
  };
  return { ...store, service, run, graph, start, submit, involves, groupFixtures, table, match, slot, preview, disqualify };
}

describe("team disqualification", () => {
  it("voids every match against the team mid group stage and lets the group complete", async () => {
    const f = await fixture(); const group = f.graph.groups[0];
    const x = group.teams[1].id; // seed 5 in the snake draw, never the group winner
    const xFixtures = f.groupFixtures(group.id).filter(m => f.involves(m, x));
    for (const m of f.groupFixtures(group.id).filter(m => !f.involves(m, x))) await f.submit(m);
    await f.submit(xFixtures[0]); // x played exactly one match before being caught
    expect(f.table(group.id).complete).toBe(false);

    const impact = await f.disqualify(x);

    expect(impact.voidedMatchIds).toEqual(xFixtures.slice(1).map(m => m.id).sort());
    expect(impact.ignoredResultMatchIds).toEqual([xFixtures[0].id]);
    for (const m of xFixtures.slice(1)) expect(f.match(m.id).status).toBe("Voided");
    expect(f.match(xFixtures[0].id).status).toBe("Completed"); // history is kept
    const after = f.table(group.id);
    expect(after.complete).toBe(true);
    expect(after.disqualified).toEqual([x]);
    expect(after.rows.map(r => r.rank)).toEqual([1, 2, 3]);
    expect(after.rows.map(r => r.teamId)).not.toContain(x);
    // Nobody keeps points or score from the voided match: 3 teams play 2 each.
    expect(after.rows.every(r => r.played === 2)).toBe(true);
    for (const dep of f.graph.qualificationDependencies.filter(d => d.groupId === group.id)) {
      expect(f.slot(dep)).toBe(after.rows.find(r => r.rank === dep.rank)!.teamId);
    }
  });

  it("removes a qualified team after the group finished and promotes the next team into the fixed slot", async () => {
    const f = await fixture(); const group = f.graph.groups[0];
    for (const m of f.groupFixtures(group.id)) await f.submit(m);
    const deps = f.graph.qualificationDependencies.filter(d => d.groupId === group.id).sort((a, b) => a.rank - b.rank);
    const [first, second] = deps.map(f.slot);
    const third = f.table(group.id).rows.find(r => r.rank === 3)!.teamId;

    const impact = await f.disqualify(first);

    expect(impact.voidedMatchIds).toEqual([]);
    expect(impact.ignoredResultMatchIds).toHaveLength(3);
    expect(impact.participants.length).toBeGreaterThan(0);
    expect(deps.map(f.slot)).toEqual([second, third]);
    expect(f.rows("match").filter(m => m.phaseId === "event:phase:2").some(m => m.homeTeamId === first || m.awayTeamId === first)).toBe(false);
  });

  it("handles two disqualified teams in different groups independently", async () => {
    const f = await fixture(); const [g1, g2] = f.graph.groups;
    const x1 = g1.teams[2].id, x2 = g2.teams[3].id;
    for (const g of [g1, g2]) for (const m of f.groupFixtures(g.id).slice(0, 2)) await f.submit(m);
    await f.disqualify(x1); await f.disqualify(x2);
    for (const [g, x] of [[g1, x1], [g2, x2]] as const) {
      for (const m of f.groupFixtures(g.id).filter(m => f.involves(m, x))) {
        expect(["Voided", "Completed"]).toContain(f.match(m.id).status);
      }
      expect(f.table(g.id).rows.map(r => r.teamId)).not.toContain(x);
      expect(f.table(g.id).disqualified).toEqual([x]);
    }
  });

  it("handles two disqualified teams in the same group and raises an action when slots cannot be filled", async () => {
    const f = await fixture(); const group = f.graph.groups[0];
    const [, x, y, z] = group.teams.map(t => t.id);
    await f.disqualify(x); await f.disqualify(y);
    expect(f.table(group.id).rows).toHaveLength(2);
    expect(f.rows("competitionActionItem").some(a => String(a.conditionKey).startsWith("group-slot:"))).toBe(false);

    await f.disqualify(z); // only one team is left for two qualifying ranks
    expect(f.table(group.id).rows).toHaveLength(1);
    const [rank1, rank2] = f.graph.qualificationDependencies.filter(d => d.groupId === group.id).sort((a, b) => a.rank - b.rank);
    expect(f.slot(rank1)).toBe(group.teams[0].id);
    expect(f.slot(rank2)).toBe("");
    expect(f.rows("competitionActionItem").find(a => a.conditionKey === `group-slot:${group.id}`)).toMatchObject({ priority: "critical", resolvedAt: null });
  });

  it("blocks disqualification while the team has a live match or already played in the playoffs", async () => {
    const f = await fixture(); const group = f.graph.groups[0];
    const m = f.groupFixtures(group.id)[0];
    await f.start(m);
    const x = m.home.kind === "team" ? m.home.teamId : "";
    const live = await f.preview(x);
    expect(live.blockers).toEqual([expect.objectContaining({ code: "live_match", matchId: m.id })]);
    await expect(f.run({ kind: "team_disqualify", teamId: x, reason: "joki", previewToken: live.token })).rejects.toThrow("Cannot disqualify team");

    const g = await fixture();
    for (const match of g.graph.matches.filter(m => m.groupId)) await g.submit(match);
    const opener = g.graph.matches.find(m => !m.groupId)!;
    await g.submit(opener);
    const winner = String(g.match(opener.id).winnerTeamId);
    const played = await g.preview(winner);
    expect(played.blockers.map(b => b.code)).toContain("playoff_played");
    await expect(g.run({ kind: "team_disqualify", teamId: winner, reason: "joki", previewToken: played.token })).rejects.toThrow("playoff");
  });

  it("cancelled fixtures can no longer be started or rescheduled", async () => {
    const f = await fixture(); const group = f.graph.groups[0];
    const x = group.teams[1].id; const m = f.groupFixtures(group.id).find(m => f.involves(m, x))!;
    await f.disqualify(x);
    await expect(f.run({ kind: "match_start", matchId: m.id, reason: "force" })).rejects.toThrow("cancelled");
    await expect(f.run({ kind: "match_timing", matchId: m.id, status: "delayed", reason: "late" })).rejects.toThrow("cancelled");
  });

  it("requires a reason, a fresh preview, an unknown-free roster and refuses a repeat", async () => {
    const f = await fixture(); const group = f.graph.groups[0]; const x = group.teams[1].id;
    const impact = await f.preview(x);
    await expect(f.run({ kind: "team_disqualify", teamId: x, reason: "  ", previewToken: impact.token })).rejects.toThrow();
    await f.submit(f.groupFixtures(group.id).find(m => !f.involves(m, x))!); // changes the competition after the preview
    await expect(f.run({ kind: "team_disqualify", teamId: x, reason: "joki", previewToken: impact.token })).rejects.toThrow("stale");
    expect(f.rows("competitionAuditLog").every(a => a.action !== "team_disqualify")).toBe(true);

    await f.disqualify(x, "Confirmed stand-in player");
    expect(f.rows("competitionAuditLog").at(-1)).toMatchObject({ action: "team_disqualify", reason: "Confirmed stand-in player" });
    await expect(f.preview(x)).rejects.toThrow("already disqualified");
    await expect(f.preview("ghost")).rejects.toThrow("not part of this competition");
  });

  it("keeps a published schedule consistent: cancelled fixtures leave the next draft and the published one is untouched", async () => {
    const f = await fixture(); const group = f.graph.groups[0];
    const draft = await f.run({ kind: "schedule_save", input: scheduling });
    await f.run({ kind: "schedule_publish", revisionId: draft.resourceId! });
    const published = await f.service.readPublishedSchedule("event");
    const x = group.teams[1].id; // its fixtures are scheduled but unplayed when it is caught
    for (const m of f.groupFixtures(group.id).filter(m => !f.involves(m, x))) await f.submit(m);
    const scheduled = new Set((published?.assignments ?? []).map(a => a.matchId));
    const cancelled = f.groupFixtures(group.id).filter(m => f.involves(m, x)).map(m => m.id);
    expect(cancelled.every(id => scheduled.has(id))).toBe(true);

    const impact = await f.disqualify(x);

    expect(impact.participants.length).toBeGreaterThan(0);
    expect(await f.service.readPublishedSchedule("event")).toEqual(published);
    const next = f.rows("scheduleRevision").at(-1)!;
    expect(next.status).toBe("draft");
    const detail = await f.service.readScheduleDraft("event", String(next.id), actor);
    expect(detail?.draft.conflicts.filter(c => c.code === "INVALID_INPUT")).toEqual([]);
    expect(detail?.draft.assignments.some(a => cancelled.includes(a.matchId))).toBe(false);
  });

  it("is atomic: a storage failure leaves the competition untouched", async () => {
    const f = await fixture(); const group = f.graph.groups[0]; const x = group.teams[1].id;
    const impact = await f.preview(x);
    const tables = ["event", "match", "competitionPhase", "competitionActionItem", "competitionAuditLog"];
    const before = tables.map(f.rows);
    f.failWrites("competitionAuditLog");
    await expect(f.run({ kind: "team_disqualify", teamId: x, reason: "joki", previewToken: impact.token })).rejects.toThrow("storage failure");
    expect(tables.map(f.rows)).toEqual(before);
  });
});
