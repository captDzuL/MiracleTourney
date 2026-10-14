import { describe, expect, it } from "vitest";
import { tournamentFormatConfigSchema } from "../formats/types";
import { evaluateBackfillGuard, planLegacyBackfill } from "./legacy-backfill";
import { inferBackfillSeeds } from "./legacy-backfill-seeds";
import { legacyFixture, withRow, withoutRow, type FixtureOptions } from "./legacy-backfill-fixtures";
import type { LegacyBackfillInput, LegacyBackfillPlan } from "./legacy-backfill-types";

const S1: FixtureOptions = { eventId: "s1", teamCount: 8, bestOf: { early: 3, semifinals: 3, final: 3 }, allRules: true, withGames: true };
const S2: FixtureOptions = { eventId: "s2", teamCount: 29, bestOf: { early: 3, semifinals: 3, final: 5 }, allRules: true, withGames: true };
const S3: FixtureOptions = { eventId: "s3", teamCount: 26, bestOf: { final: 3 }, withGames: true, withThirdPlace: true, organizerUserId: null };

function planned(input: LegacyBackfillInput) {
  const result = planLegacyBackfill(input);
  if (!result.ok) throw new Error(`expected a plan, got problems: ${result.problems.join(" | ")}`);
  return result;
}
function problemsOf(input: LegacyBackfillInput): string[] {
  const result = planLegacyBackfill(input);
  if (result.ok) throw new Error("expected problems, got a plan");
  return result.problems;
}
const teamOf = (seed: number) => `team-${seed}`;
const swapBye = (input: LegacyBackfillInput, round: number, slot: number, patch: { homeTeamId?: string; awayTeamId?: string }) => withRow(input, round, slot, patch);

describe("backfill plan for an 8-team event (S1 shape)", () => {
  const { input } = legacyFixture(S1);
  const { plan, prediction } = planned(input);

  it("derives a valid single elimination config with the stored round rules and no third place", () => {
    expect(tournamentFormatConfigSchema.safeParse(plan.formatConfig).success).toBe(true);
    expect(plan.formatConfig).toEqual({ version: 1, kind: "single_elimination", bestOf: { earlyRounds: 3, semifinals: 3, thirdPlace: 1, final: 3 }, thirdPlace: "none" });
  });

  it("reads every seed back from the first round", () => {
    expect(plan.seeds).toEqual(Array.from({ length: 8 }, (_, i) => ({ id: teamOf(i + 1), seed: i + 1 })));
  });

  it("points every graph node at the stored match ids and writes one phase", () => {
    const stored = new Set(input.matches.map((m) => m.id));
    expect(plan.graph.matches.map((n) => n.id).every((id) => stored.has(id))).toBe(true);
    expect(plan.phase).toMatchObject({ id: "s1:phase:1", eventId: "s1", label: "single_elimination", sequence: 1, status: "active" });
    expect((plan.phase.configuration as { graph: unknown }).graph).toEqual(plan.graph);
    expect(plan.phase.configuration).toMatchObject({ id: "s1:phase:1", sequence: 1, kind: "single_elimination", standingsRules: null });
  });

  it("updates each match with the same fields applyResult writes", () => {
    expect(plan.matchUpdates).toHaveLength(7);
    for (const update of plan.matchUpdates) {
      expect(update.data).toMatchObject({ phaseId: "s1:phase:1", resultVersion: 1, scheduleStatus: "completed", resultConfirmedAt: input.now });
      expect(update.data.scheduleMetadata.graphMatch.id).toBe(update.matchId);
    }
    const final = plan.matchUpdates.find((u) => u.matchId === "s1-r3-m1")!;
    expect(final.data.resultSnapshot).toMatchObject({ bestOf: 3, homeTeamId: teamOf(1), awayTeamId: teamOf(2), winnerTeamId: teamOf(1), loserTeamId: teamOf(2) });
    expect(final.data.resultSnapshot.games.length).toBeGreaterThanOrEqual(2);
  });

  it("creates version 1 revisions with a unique idempotency key per match", () => {
    expect(plan.revisions).toHaveLength(7);
    expect(new Set(plan.revisions.map((r) => r.idempotencyKey)).size).toBe(7);
    const revision = plan.revisions.find((r) => r.matchId === "s1-r3-m1")!;
    expect(revision).toMatchObject({ eventId: "s1", version: 1, actorUserId: "actor-1", idempotencyKey: "legacy-backfill:s1-r3-m1:1", reason: "Hasil dipindahkan dari data lama" });
    const source = input.matches.find((m) => m.id === "s1-r3-m1")!;
    expect([revision.homeScore, revision.awayScore, revision.winnerTeamId]).toEqual([source.homeScore, source.awayScore, source.winnerTeamId]);
  });

  it("writes the graph dependencies against stored ids and creates no extra match", () => {
    expect(plan.createdMatches).toEqual([]);
    expect(plan.dependencies).toHaveLength(6);
    const stored = new Set(input.matches.map((m) => m.id));
    expect(plan.dependencies.every((d) => d.eventId === "s1" && stored.has(d.sourceMatchId) && stored.has(d.targetMatchId))).toBe(true);
  });

  it("predicts an official final with the right champion and runner-up", () => {
    expect(prediction.final).toMatchObject({ matchId: "s1-r3-m1", official: true, winnerTeamId: teamOf(1), loserTeamId: teamOf(2) });
    expect(prediction.awardStatisticCounts).toEqual({ mvp: 0, top_scorer: 0, top_defender: 0, top_assist: 0 });
  });

  it("keeps existing schedule metadata of the old row next to the graph node", () => {
    const withMeta = withRow(input, 1, 1, { scheduleMetadata: { note: "kept" } });
    const update = planned(withMeta).plan.matchUpdates.find((u) => u.matchId === "s1-r1-m1")!;
    expect(update.data.scheduleMetadata).toMatchObject({ note: "kept", graphMatch: { id: "s1-r1-m1" } });
  });

  it("does not change its input", () => {
    const before = JSON.stringify(input);
    planLegacyBackfill(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe("backfill plan for a 29-team event with three byes (S2 shape)", () => {
  const fixture = legacyFixture(S2);
  const { plan } = planned(fixture.input);

  it("has 28 stored matches, 3 bye nodes and no row for a bye", () => {
    expect(fixture.input.matches).toHaveLength(28);
    const byes = plan.graph.matches.filter((n) => n.status === "bye");
    expect(byes).toHaveLength(3);
    const stored = new Set(fixture.input.matches.map((m) => m.id));
    expect(byes.every((n) => !stored.has(n.id))).toBe(true);
    expect(plan.matchUpdates).toHaveLength(28);
    expect(plan.revisions).toHaveLength(28);
  });

  it("seats the bye teams at the better seed of their pair and everyone else from the slots", () => {
    expect(plan.seeds).toEqual(Array.from({ length: 29 }, (_, i) => ({ id: teamOf(i + 1), seed: i + 1 })));
  });

  it("never points a dependency at a bye node", () => {
    const stored = new Set(fixture.input.matches.map((m) => m.id));
    expect(plan.dependencies.length).toBeGreaterThan(0);
    expect(plan.dependencies.every((d) => stored.has(d.sourceMatchId) && stored.has(d.targetMatchId))).toBe(true);
  });

  it("derives final BO5 and earlier BO3 from the round labels", () => {
    expect(plan.formatConfig.bestOf).toEqual({ earlyRounds: 3, semifinals: 3, thirdPlace: 1, final: 5 });
    expect(plan.matchUpdates.find((u) => u.matchId === "s2-r5-m1")!.data.scheduleMetadata.graphMatch.bestOf).toBe(5);
  });

  it("stores all stored games of a match in its snapshot in order", () => {
    const update = plan.matchUpdates.find((u) => u.matchId === "s2-r5-m1")!;
    const stored = fixture.input.matchGames.filter((g) => g.matchId === "s2-r5-m1");
    expect(update.data.resultSnapshot.games).toEqual(stored.map(({ gameNumber, homeScore, awayScore }) => ({ gameNumber, homeScore, awayScore })));
  });
});

describe("backfill plan with a played third place match (S3 shape)", () => {
  const fixture = legacyFixture(S3);
  const { plan, prediction } = planned(fixture.input);
  const [evrosheim, helix] = fixture.semifinalLosers;

  it("requires third place in the config and keeps it best-of-1", () => {
    expect(plan.formatConfig).toEqual({ version: 1, kind: "single_elimination", bestOf: { earlyRounds: 1, semifinals: 1, thirdPlace: 1, final: 3 }, thirdPlace: "required" });
  });

  it("adds exactly one match for third place after the last round", () => {
    expect(plan.createdMatches).toHaveLength(1);
    expect(plan.createdMatches[0]).toMatchObject({
      id: "s3:third_place:r1:m1", eventId: "s3", phaseId: "s3:phase:1", roundLabel: "Third Place", round: 6, slot: 1,
      homeTeamId: evrosheim, awayTeamId: helix, winnerTeamId: evrosheim, homeScore: 1, awayScore: 0,
      status: "Completed", scheduleStatus: "completed", resultVersion: 1,
    });
    expect(plan.createdMatches[0].scheduleMetadata.graphMatch).toMatchObject({ id: "s3:third_place:r1:m1", bracket: "third_place", bestOf: 1 });
  });

  it("never invents game scores and says the original score was not recorded", () => {
    const [created] = plan.createdMatches;
    expect(created.resultSnapshot).toMatchObject({ games: [], scoreRecorded: false, bestOf: 1 });
    const revision = plan.revisions.find((r) => r.matchId === created.id)!;
    expect(revision.reason).toContain("Skor asli tidak tercatat");
    expect(revision.reason).toContain("Hasil dipindahkan dari data lama");
    expect(revision).toMatchObject({ version: 1, homeScore: 1, awayScore: 0, winnerTeamId: evrosheim, idempotencyKey: "legacy-backfill:s3:third_place:r1:m1:1" });
  });

  it("depends on the two semifinals by their stored ids", () => {
    const rows = plan.dependencies.filter((d) => d.targetMatchId === "s3:third_place:r1:m1");
    expect(rows.map((d) => [d.sourceMatchId, d.outcome, d.targetSlot]).sort()).toEqual([["s3-r4-m1", "loser", "home"], ["s3-r4-m2", "loser", "away"]]);
  });

  it("records an away winner as 0-1", () => {
    const flipped = { ...fixture.input, thirdPlace: { ...fixture.input.thirdPlace!, winnerTeamName: "Helix Eclipse", loserTeamName: "Evrosheim" } };
    const created = planned(flipped).plan.createdMatches[0];
    expect([created.homeScore, created.awayScore, created.winnerTeamId]).toEqual([0, 1, helix]);
  });

  it("makes the third place official so the podium has three teams", () => {
    expect(prediction.final).toMatchObject({ official: true });
    expect(prediction.readiness.podium).toEqual({ championTeamId: teamOf(1), runnerUpTeamId: teamOf(2), thirdPlaceTeamId: evrosheim });
    const codes = prediction.readiness.blockers.map((b) => b.code);
    expect(codes).not.toContain("UNOFFICIAL_REQUIRED_RESULT");
    expect(codes).not.toContain("INSUFFICIENT_PODIUM_STRUCTURE");
  });

  it("warns when the event has no organizer", () => {
    expect(plan.warnings.join(" ")).toContain("organizerUserId is NULL");
    expect(planned(legacyFixture({ ...S3, organizerUserId: "o1" }).input).plan.warnings).toEqual([]);
  });

  it("counts validated award statistics and clears the award blockers when stats exist", () => {
    const final = fixture.input.matches.find((m) => m.round === 5)!;
    const player = { id: "p1", teamId: final.winnerTeamId!, eventId: "s3", displayName: "Ari", nickname: "Ari" };
    const withStats: LegacyBackfillInput = {
      ...fixture.input,
      playerStats: [{ matchId: final.id, playerId: "p1", playerName: "Ari", teamId: final.winnerTeamId!, source: "admin", stats: { goal: 2, assist: 1, passing: 9, defense: 3 }, player }],
    };
    const result = planned(withStats);
    expect(result.prediction.awardStatisticCounts).toEqual({ mvp: 1, top_scorer: 1, top_defender: 1, top_assist: 1 });
    expect(result.prediction.readiness.ready).toBe(true);
  });

  it("does not trust captain statistics without an approved submission", () => {
    const final = fixture.input.matches.find((m) => m.round === 5)!;
    const player = { id: "p1", teamId: final.winnerTeamId!, eventId: "s3", displayName: "Ari", nickname: "Ari" };
    const row = { matchId: final.id, playerId: "p1", playerName: "Ari", teamId: final.winnerTeamId!, source: "captain", stats: { goal: 2, assist: 1, passing: 9, defense: 3 }, player };
    expect(planned({ ...fixture.input, playerStats: [row] }).prediction.awardStatisticCounts.top_scorer).toBe(0);
    const approved = planned({ ...fixture.input, playerStats: [row], approvedSubmissions: [{ matchId: final.id, teamId: final.winnerTeamId! }] });
    expect(approved.prediction.awardStatisticCounts.top_scorer).toBe(1);
  });
});

describe("seed inference with byes", () => {
  const { input } = legacyFixture(S2);

  it("takes bye teams from round 2: odd slot on the home side, even slot on the away side", () => {
    const result = inferBackfillSeeds(input.teams, input.matches);
    expect(result.problems).toEqual([]);
    expect(result).toMatchObject({ size: 32, rounds: 5 });
    expect(result.seeds.slice(0, 3)).toEqual([{ id: teamOf(1), seed: 1 }, { id: teamOf(2), seed: 2 }, { id: teamOf(3), seed: 3 }]);
  });

  it("rejects a bye team sitting on the wrong side of its round 2 match", () => {
    const round2 = input.matches.find((m) => m.round === 2 && m.slot === 1)!;
    const swapped = swapBye(input, 2, 1, { homeTeamId: round2.awayTeamId, awayTeamId: round2.homeTeamId });
    expect(problemsOf(swapped).length).toBeGreaterThan(0);
  });

  it("reports an empty side where the bye team should be", () => {
    const problems = problemsOf(swapBye(input, 2, 1, { homeTeamId: "" }));
    expect(problems.join(" ")).toContain("no team on the home side");
  });

  it("rejects a missing first-round row whose seed pair is two real teams", () => {
    const { input: eight } = legacyFixture(S1);
    expect(problemsOf(withoutRow(eight, 1, 2)).join(" ")).toContain("both seeds");
  });

  it("rejects a stored bye row with an empty side", () => {
    const { input: eight } = legacyFixture(S1);
    expect(problemsOf(swapBye(eight, 1, 1, { awayTeamId: "" })).join(" ")).toContain("stored bye row");
  });

  it("rejects a team count that does not fit the number of rounds", () => {
    expect(inferBackfillSeeds([...input.teams, { id: "x", name: "X" }, { id: "y", name: "Y" }, { id: "z", name: "Z" }, { id: "w", name: "W" }], input.matches).problems.join(" ")).toContain("do not fit");
  });
});

describe("backfill refuses and lists every inconsistency", () => {
  const eight = legacyFixture(S1).input;

  it("rejects a team placed in two first-round matches", () => {
    const problems = problemsOf(withRow(eight, 1, 2, { homeTeamId: teamOf(1) }));
    expect(problems.join(" ")).toContain("is placed more than once");
  });

  it("rejects a team that never appears", () => {
    const problems = problemsOf({ ...eight, teams: [...eight.teams.slice(0, 7), { id: "ghost", name: "Ghost" }] });
    expect(problems.join(" ")).toContain('team "Ghost" does not appear');
  });

  it("rejects a winner who did not play", () => {
    const problems = problemsOf(withRow(eight, 1, 1, { winnerTeamId: teamOf(5) }));
    expect(problems.join(" ")).toContain("is not one of the two teams");
  });

  it("rejects a later-round participant that is not the feeder winner", () => {
    const problems = problemsOf(withRow(eight, 2, 1, { homeTeamId: teamOf(8) }));
    expect(problems.join(" ")).toContain("round 2 slot 1: home is");
  });

  it("rejects a winner with the lower score", () => {
    const row = eight.matches.find((m) => m.round === 1 && m.slot === 1)!;
    const problems = problemsOf(withRow(eight, 1, 1, { homeScore: row.awayScore, awayScore: row.homeScore }));
    expect(problems.join(" ")).toContain("not a finished best-of-3 series");
  });

  it("rejects stored games that disagree with the series score", () => {
    const first = eight.matches.find((m) => m.round === 1 && m.slot === 1)!;
    const games = eight.matchGames.map((g) => (g.matchId === first.id && g.gameNumber === 1 ? { ...g, homeScore: g.awayScore, awayScore: g.homeScore } : g));
    expect(problemsOf({ ...eight, matchGames: games }).join(" ")).toContain("stored games give");
  });

  it("rejects games that belong to no match", () => {
    expect(problemsOf({ ...eight, matchGames: [...eight.matchGames, { matchId: "other", gameNumber: 1, homeScore: 1, awayScore: 0 }] }).join(" ")).toContain("not a match of this event");
  });

  it("rejects matches that are not completed or already have a result version", () => {
    expect(problemsOf(withRow(eight, 1, 1, { status: "Scheduled" })).join(" ")).toContain('status is "Scheduled"');
    expect(problemsOf(withRow(eight, 1, 1, { resultVersion: 2 })).join(" ")).toContain("already has result version 2");
  });

  it("rejects a match without a winner", () => {
    expect(problemsOf(withRow(eight, 3, 1, { winnerTeamId: null })).join(" ")).toContain("has no winner");
  });

  it("rejects a stored third place row", () => {
    const stored = { ...eight.matches[0], id: "x", round: 4, slot: 1, roundLabel: "Third Place" };
    expect(problemsOf({ ...eight, matches: [...eight.matches, stored] }).join(" ")).toContain("already a third place match");
  });

  it("rejects a format that is not single elimination", () => {
    expect(problemsOf({ ...eight, event: { ...eight.event, format: "League" } }).join(" ")).toContain('only "Single Elimination"');
  });

  it("rejects round rules that disagree inside one bucket", () => {
    const { input } = legacyFixture({ ...S2, bestOf: { early: 3, semifinals: 3, final: 5 } });
    const partial = { ...input, roundConfigs: input.roundConfigs.filter((r) => r.roundLabel !== "Round 1") };
    expect(problemsOf(partial).join(" ")).toContain("round rules disagree inside earlyRounds");
  });

  it("rejects an even or unusable best-of", () => {
    const bad = { ...eight, roundConfigs: [{ roundLabel: "Final", bestOf: 4 }] };
    expect(problemsOf(bad).join(" ")).toContain("positive odd number");
  });

  it("ignores a round rule that no match uses and says so", () => {
    const extra = { ...eight, roundConfigs: [...eight.roundConfigs, { roundLabel: "Grand Prize", bestOf: 5 }] };
    expect(planned(extra).plan.notes.join(" ")).toContain('"Grand Prize" matches no stored match');
  });

  it("reports several problems at once and never throws on junk", () => {
    const junk: LegacyBackfillInput = {
      ...eight,
      actorUserId: " ",
      matches: [{ ...eight.matches[0], round: null }, { ...eight.matches[1], slot: null, status: "Live" }],
    };
    expect(() => planLegacyBackfill(junk)).not.toThrow();
    expect(problemsOf(junk).length).toBeGreaterThanOrEqual(2);
    expect(problemsOf({ ...eight, matches: [] })).toContain("the event has no stored matches");
  });

  it("refuses when the event already has V3 structures", () => {
    const existing = { phaseCount: 1, resultRevisionCount: 0, dependencyCount: 0 };
    expect(problemsOf({ ...eight, existing }).join(" ")).toContain("already has 1 competition phase");
  });
});

describe("third place checks", () => {
  const s3 = legacyFixture(S3).input;

  it("rejects teams that are not the two semifinal losers", () => {
    const problems = problemsOf({ ...s3, thirdPlace: { ...s3.thirdPlace!, loserTeamName: "Team 1" } });
    expect(problems.join(" ")).toContain("are not the semifinal losers");
  });

  it("rejects a name used by two teams", () => {
    const teams = s3.teams.map((t) => (t.name === "Team 2" ? { ...t, name: "Evrosheim" } : t));
    expect(problemsOf({ ...s3, teams }).join(" ")).toContain("matches 2 teams");
  });

  it("rejects a name that is not a team", () => {
    expect(problemsOf({ ...s3, thirdPlace: { ...s3.thirdPlace!, winnerTeamName: "Nobody FC" } }).join(" ")).toContain('"Nobody FC" is not a team');
  });

  it("ignores case when matching names", () => {
    expect(planned({ ...s3, thirdPlace: { ...s3.thirdPlace!, winnerTeamName: "evrosheim" } }).plan.createdMatches).toHaveLength(1);
  });

  it("rejects naming the same team twice", () => {
    expect(problemsOf({ ...s3, thirdPlace: { ...s3.thirdPlace!, loserTeamName: "Evrosheim" } }).join(" ")).toContain("are not the semifinal losers");
  });

  it("rejects a third place when the semifinal losers cannot be read", () => {
    expect(problemsOf(withRow(s3, 4, 1, { winnerTeamId: null })).length).toBeGreaterThan(0);
  });
});

describe("idempotence guard", () => {
  it("proceeds on a clean event", () => {
    expect(evaluateBackfillGuard({ phaseCount: 0, resultRevisionCount: 0, dependencyCount: 0 })).toEqual({ action: "proceed" });
  });

  it.each([
    [{ phaseCount: 1, resultRevisionCount: 0, dependencyCount: 0 }, "competition phase"],
    [{ phaseCount: 0, resultRevisionCount: 3, dependencyCount: 0 }, "result revision"],
    [{ phaseCount: 0, resultRevisionCount: 0, dependencyCount: 2 }, "match dependenc"],
  ])("skips when V3 rows exist: %j", (existing, text) => {
    const guard = evaluateBackfillGuard(existing);
    expect(guard.action).toBe("skip");
    expect(guard.action === "skip" && guard.reason).toContain(text);
  });
});

describe("plan round trip", () => {
  it("is deterministic for the same input", () => {
    const { input } = legacyFixture(S2);
    const a = planned(input).plan as LegacyBackfillPlan;
    const b = planned(input).plan as LegacyBackfillPlan;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe.each([["S1 shape (8 teams)", S1], ["S2 shape (29 teams, byes)", S2]] as const)("podium prediction without third place: %s", (_label, options) => {
  const { input } = legacyFixture(options);
  const { prediction } = planned(input);

  it("gives a two-place podium and no podium blockers", () => {
    expect(prediction.final).toMatchObject({ official: true });
    expect(prediction.readiness.podium).toEqual({ championTeamId: teamOf(1), runnerUpTeamId: teamOf(2), thirdPlaceTeamId: null });
    const codes = prediction.readiness.blockers.map((b) => b.code);
    expect(codes).not.toContain("UNOFFICIAL_REQUIRED_RESULT");
    expect(codes).not.toContain("INSUFFICIENT_PODIUM_STRUCTURE");
  });
});

describe("real-data quirks seen in the prod dry run", () => {
  it("finds the third place teams when the stored names differ in case and accents", () => {
    const fixture = legacyFixture(S3);
    const [evrosheim, helix] = fixture.semifinalLosers;
    const renamed: LegacyBackfillInput = {
      ...fixture.input,
      teams: fixture.input.teams.map((team) => team.id === evrosheim ? { ...team, name: "Evroshëim" } : team.id === helix ? { ...team, name: "HELIX ECLIPSE" } : team),
    };
    const { plan } = planned(renamed);
    expect(plan.createdMatches[0]).toMatchObject({ winnerTeamId: evrosheim, homeTeamId: evrosheim, awayTeamId: helix });
  });

  it("still refuses a third place name that matches two teams after folding", () => {
    const fixture = legacyFixture(S3);
    const [evrosheim] = fixture.semifinalLosers;
    const other = fixture.input.teams.find((team) => team.id !== evrosheim && !fixture.semifinalLosers.includes(team.id))!;
    const clash: LegacyBackfillInput = { ...fixture.input, teams: fixture.input.teams.map((team) => team.id === other.id ? { ...team, name: "EVROSHEIM" } : team) };
    expect(problemsOf(clash).join(" ")).toContain("matches 2 teams");
  });

  it("mirrors games stored with home and away swapped when the score and winner agree", () => {
    const { input } = legacyFixture(S1);
    const finalRow = input.matches.find((m) => m.round === 3)!;
    const swapped: LegacyBackfillInput = {
      ...input,
      matchGames: input.matchGames.map((g) => g.matchId === finalRow.id ? { ...g, homeScore: g.awayScore, awayScore: g.homeScore } : g),
    };
    const original = input.matchGames.filter((g) => g.matchId === finalRow.id);
    const { plan } = planned(swapped);
    const update = plan.matchUpdates.find((u) => u.matchId === finalRow.id)!;
    expect(update.data.resultSnapshot.games).toEqual(original.map(({ gameNumber, homeScore, awayScore }) => ({ gameNumber, homeScore, awayScore })));
    expect(plan.warnings.join(" ")).toContain(finalRow.id);
    expect(swapped.matchGames.filter((g) => g.matchId === finalRow.id)).not.toEqual(original);
  });

  it("does not mirror games that disagree with the score in both directions", () => {
    const { input } = legacyFixture(S1);
    const finalRow = input.matches.find((m) => m.round === 3)!;
    const broken: LegacyBackfillInput = { ...input, matchGames: input.matchGames.map((g) => g.matchId === finalRow.id ? { ...g, homeScore: 1, awayScore: 1 } : g) };
    expect(problemsOf(broken).join(" ")).toContain("stored games give");
  });
});
