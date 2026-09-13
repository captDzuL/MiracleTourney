import { describe, expect, it } from "vitest";

import type { CompetitionGraph } from "@/lib/tournament/competition";
import type { TournamentFormatConfig } from "@/lib/tournament/formats/types";
import { completeTournament, reopenTournament } from "./complete";
import { buildCompletionSource, createPrismaCompletionDependencies, type CompletionSourceRows } from "./prisma-adapter";

const revision = (matchId: string, version: number, winnerTeamId: string | null, homeScore = 2, awayScore = 0) => ({
  id: `revision-${matchId}-${version}`,
  matchId,
  version,
  winnerTeamId,
  homeScore,
  awayScore,
});

function eliminationRows(kind: "single_elimination" | "double_elimination" | "group_playoffs"): CompletionSourceRows {
  const playoffKind = kind === "double_elimination" ? "double_elimination" : "single_elimination";
  const titleId = playoffKind === "double_elimination" ? "grand-final" : "final";
  const thirdId = playoffKind === "double_elimination" ? "lower-final" : "third";
  const titleBracket = playoffKind === "double_elimination" ? "grand_final" : "single";
  const thirdBracket = playoffKind === "double_elimination" ? "lower" : "third_place";
  const config = (kind === "group_playoffs"
    ? {
        version: 1 as const, kind,
        groupCount: 2, qualifiersPerGroup: 2,
        groupStage: { legs: 1 as const, points: { win: 3, draw: 1, loss: 0 }, tiebreakers: ["score_difference" as const] },
        playoffs: {
          version: 1 as const, kind: "single_elimination" as const,
          bestOf: { earlyRounds: 1, semifinals: 1, thirdPlace: 1, final: 1 },
          thirdPlace: "required" as const, avoidImmediateGroupRematches: true,
        },
      }
    : playoffKind === "double_elimination"
      ? {
          version: 1 as const, kind,
          bestOf: { earlyRounds: 1, upperFinal: 1, lowerFinal: 1, grandFinal: 1 },
          thirdPlace: "lower_final_loser" as const,
        }
      : {
          version: 1 as const, kind,
          bestOf: { earlyRounds: 1, semifinals: 1, thirdPlace: 1, final: 1 },
          thirdPlace: "required" as const,
        }) as TournamentFormatConfig;
  const graph = {
    eventId: "event-1",
    config,
    phases: [{ id: "playoffs", sequence: 1, kind: playoffKind, standingsRules: null }],
    groups: [],
    dependencies: [],
    qualificationDependencies: [],
    matches: [
      { id: titleId, phaseId: "playoffs", groupId: null, bracket: titleBracket, round: 1, slot: 1, leg: 1, bestOf: 1, home: { kind: "team", teamId: "a", seed: 1 }, away: { kind: "team", teamId: "b", seed: 2 }, status: "pending", advance: null },
      { id: thirdId, phaseId: "playoffs", groupId: null, bracket: thirdBracket, round: 1, slot: 2, leg: 1, bestOf: 1, home: { kind: "team", teamId: playoffKind === "double_elimination" ? "b" : "c", seed: 3 }, away: { kind: "team", teamId: "d", seed: 4 }, status: "pending", advance: null },
    ],
    placements: [
      { rank: 1, source: { kind: "match", matchId: titleId, outcome: "winner" } },
      { rank: 2, source: { kind: "match", matchId: titleId, outcome: "loser" } },
      { rank: 3, source: { kind: "match", matchId: thirdId, outcome: playoffKind === "double_elimination" ? "loser" : "winner" } },
    ],
  } satisfies CompetitionGraph;
  const matches = [
    { id: titleId, homeTeamId: "a", awayTeamId: "b", homeScore: 2, awayScore: 0, winnerTeamId: "a", resultVersion: 2, status: "Completed", scheduleStatus: "completed" },
    { id: thirdId, homeTeamId: playoffKind === "double_elimination" ? "b" : "c", awayTeamId: "d", homeScore: playoffKind === "double_elimination" ? 2 : 2, awayScore: playoffKind === "double_elimination" ? 3 : 0, winnerTeamId: playoffKind === "double_elimination" ? "d" : "c", resultVersion: 1, status: "Completed", scheduleStatus: "completed" },
  ];
  return {
    event: { id: "event-1", formatConfig: config, gameId: "game-flashpeak", gameModeId: "mode-flashpeak-5v5" },
    graph,
    matches,
    revisions: [
      revision(titleId, 1, "b", 0, 1),
      revision(titleId, 2, "a"),
      revision(thirdId, 1, playoffKind === "double_elimination" ? "d" : "c", playoffKind === "double_elimination" ? 2 : 2, playoffKind === "double_elimination" ? 3 : 0),
    ],
    incidents: [],
    teams: ["a", "b", "c", "d"].map((id) => ({ id, name: `Team ${id.toUpperCase()}` })),
    playerStats: [],
    approvedSubmissions: [],
  };
}

describe("Prisma completion source adapter", () => {
  it.each([
    ["single_elimination", "final", "third_place"],
    ["double_elimination", "grand_final", "lower_final"],
    ["group_playoffs", "final", "third_place"],
  ] as const)("derives %s podium facts from graph placements and current official revisions", (kind, titleStage, thirdStage) => {
    const source = buildCompletionSource(eliminationRows(kind));
    expect(source.facts.matches.map(({ stage, official, winnerTeamId, loserTeamId, revision }) => ({ stage, official, winnerTeamId, loserTeamId, revision }))).toEqual([
      { stage: titleStage, official: true, winnerTeamId: "a", loserTeamId: "b", revision: 2 },
      { stage: thirdStage, official: true, winnerTeamId: kind === "double_elimination" ? "d" : "c", loserTeamId: kind === "double_elimination" ? "b" : "d", revision: 1 },
    ]);
    expect(source.facts.playoffFormatKind).toBe(kind === "group_playoffs" ? "single_elimination" : undefined);
  });

  it("uses the Match Day projection for locked league standings and retains unresolved ties", () => {
    const config = {
      version: 1 as const, kind: "round_robin" as const, legs: 1 as const,
      points: { win: 3, draw: 1, loss: 0 }, tiebreakers: ["score_difference" as const],
    };
    const teams = ["a", "b", "c", "d"];
    const fixtures = [
      ["ab", "a", "b", 3, 0], ["ac", "a", "c", 2, 0], ["ad", "a", "d", 1, 0],
      ["bc", "b", "c", 2, 0], ["bd", "b", "d", 1, 0], ["cd", "c", "d", 0, 0],
    ] as const;
    const graph = {
      eventId: "event-1", config,
      phases: [{ id: "league", sequence: 1, kind: "round_robin" as const, standingsRules: { legs: 1 as const, points: config.points, tiebreakers: config.tiebreakers } }],
      groups: [], dependencies: [], qualificationDependencies: [], placements: [],
      matches: fixtures.map(([id, home, away], index) => ({ id, phaseId: "league", groupId: null, bracket: "round_robin" as const, round: index + 1, slot: 1, leg: 1, bestOf: 1, home: { kind: "team" as const, teamId: home, seed: 1 }, away: { kind: "team" as const, teamId: away, seed: 2 }, status: "pending" as const, advance: null })),
    } satisfies CompetitionGraph;
    const rows: CompletionSourceRows = {
      event: { id: "event-1", formatConfig: config, gameId: "game-flashpeak", gameModeId: "mode-flashpeak-5v5" },
      graph,
      matches: fixtures.map(([id, homeTeamId, awayTeamId, homeScore, awayScore]) => ({ id, homeTeamId, awayTeamId, homeScore, awayScore, winnerTeamId: homeScore === awayScore ? null : homeTeamId, resultVersion: 1, status: "Completed", scheduleStatus: "completed" })),
      revisions: fixtures.map(([id, home, , homeScore, awayScore]) => revision(id, 1, homeScore === awayScore ? null : home, homeScore, awayScore)),
      incidents: [], teams: teams.map((id) => ({ id, name: id.toUpperCase() })), playerStats: [], approvedSubmissions: [],
    };
    expect(buildCompletionSource(rows).facts.standings).toEqual([
      { rank: 1, teamId: "a", locked: true, unresolvedTie: false },
      { rank: 2, teamId: "b", locked: true, unresolvedTie: false },
      { rank: 3, teamId: "d", locked: true, unresolvedTie: false },
      { rank: 4, teamId: "c", locked: true, unresolvedTie: false },
    ]);
  });

  it("blocks unresolved incidents and aggregates only approved captain or direct-admin finite statistics", () => {
    const rows = eliminationRows("single_elimination");
    rows.incidents.push({ id: "incident-2", matchId: null, resolvedAt: null }, { id: "incident-1", matchId: "final", resolvedAt: null });
    rows.playerStats.push(
      { matchId: "final", playerId: "p1", playerName: "Ari", teamId: "a", source: "admin", stats: { goal: 3, assist: 3, defense: 7 } },
      { matchId: "final", playerId: "p2", playerName: "Bima", teamId: "b", source: "captain", stats: { goal: 4, assist: 0, defense: 1 } },
      { matchId: "third", playerId: "p3", playerName: "Cici", teamId: "c", source: "captain", stats: { goal: 99, assist: 99, defense: 99 } },
      { matchId: "third", playerId: "p4", playerName: "Deni", teamId: "d", source: "admin", stats: { goal: -1, assist: Number.POSITIVE_INFINITY, defense: 1 } },
    );
    rows.approvedSubmissions.push({ matchId: "final", teamId: "b" });
    const source = buildCompletionSource(rows);
    expect(source.facts.activeDisputes).toEqual([{ id: "incident-1", matchId: "final" }, { id: "incident-2" }]);
    expect(source.statistics).toEqual([
      { award: "mvp", playerId: "p1", playerName: "Ari", teamId: "a", teamName: "Team A", value: 13, validated: true, status: "published" },
      { award: "top_scorer", playerId: "p1", playerName: "Ari", teamId: "a", teamName: "Team A", value: 3, validated: true, status: "published" },
      { award: "top_defender", playerId: "p1", playerName: "Ari", teamId: "a", teamName: "Team A", value: 7, validated: true, status: "published" },
      { award: "top_assist", playerId: "p1", playerName: "Ari", teamId: "a", teamName: "Team A", value: 3, validated: true, status: "published" },
      { award: "mvp", playerId: "p2", playerName: "Bima", teamId: "b", teamName: "Team B", value: 5, validated: true, status: "published" },
      { award: "top_scorer", playerId: "p2", playerName: "Bima", teamId: "b", teamName: "Team B", value: 4, validated: true, status: "published" },
      { award: "top_defender", playerId: "p2", playerName: "Bima", teamId: "b", teamName: "Team B", value: 1, validated: true, status: "published" },
      { award: "top_assist", playerId: "p2", playerName: "Bima", teamId: "b", teamName: "Team B", value: 0, validated: true, status: "published" },
    ]);
    expect(source.facts.validatedAwardStatistics).toEqual(["mvp", "top_scorer", "top_defender", "top_assist"]);
  });
});

class MemoryCompletionPrisma {
  data = {
    event: { id: "event-1", organizerUserId: "organizer-1", competitionVersion: 0 },
    user: { id: "organizer-1", role: "organizer", deactivatedAt: null as Date | null, mustChangePassword: false },
    completion: null as null | Record<string, unknown>,
    podium: [] as Record<string, unknown>[],
    awards: [] as Record<string, unknown>[],
    decisions: [] as Record<string, unknown>[],
    audit: [] as Record<string, unknown>[],
  };
  failDecision = false;
  readonly rows = (() => {
    const source = eliminationRows("single_elimination");
    source.playerStats.push({ matchId: "final", playerId: "p1", playerName: "Ari", teamId: "a", source: "admin", stats: { goal: 4, assist: 3, defense: 2 } });
    return source;
  })();

  async $transaction<T>(work: (tx: Record<string, unknown>) => Promise<T>): Promise<T> {
    const draft = structuredClone(this.data);
    const source = this.rows;
    const tx = {
      event: {
        findUnique: async ({ where }: { where: { id: string } }) => where.id === draft.event.id ? { ...draft.event, ...source.event } : null,
        updateMany: async ({ where }: { where: { id: string; competitionVersion: number } }) => {
          if (where.id !== draft.event.id || where.competitionVersion !== draft.event.competitionVersion) return { count: 0 };
          draft.event.competitionVersion += 1;
          return { count: 1 };
        },
      },
      user: {
        findUnique: async ({ where }: { where: { id: string } }) => where.id === draft.user.id
          ? structuredClone(draft.user)
          : where.id === "admin-2"
            ? { id: "admin-2", role: "admin", deactivatedAt: null, mustChangePassword: false }
            : null,
      },
      competitionPhase: {
        findFirst: async () => source.graph ? { configuration: { graph: source.graph } } : null,
      },
      match: { findMany: async () => structuredClone(source.matches) },
      matchResultRevision: { findMany: async () => structuredClone(source.revisions) },
      competitionIncident: { findMany: async () => structuredClone(source.incidents) },
      team: { findMany: async () => structuredClone(source.teams) },
      playerStat: { findMany: async () => structuredClone(source.playerStats) },
      statSubmission: { findMany: async () => structuredClone(source.approvedSubmissions) },
      tournamentCompletion: {
        findUnique: async () => draft.completion ? structuredClone(draft.completion) : null,
        upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
          draft.completion = draft.completion
            ? { ...draft.completion, ...structuredClone(update) }
            : { id: "completion-1", certificateRevision: 0, ...structuredClone(create) };
          return structuredClone(draft.completion);
        },
        update: async ({ data }: { data: Record<string, unknown> }) => {
          if (!draft.completion) throw new Error("missing completion");
          draft.completion = { ...draft.completion, ...structuredClone(data) };
          return structuredClone(draft.completion);
        },
      },
      podiumPlacement: {
        deleteMany: async () => { draft.podium = []; },
        createMany: async ({ data }: { data: Record<string, unknown>[] }) => { draft.podium.push(...structuredClone(data)); },
      },
      eventAward: {
        deleteMany: async () => { draft.awards = []; draft.decisions = []; },
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `award-${draft.awards.length + 1}`, ...structuredClone(data) };
          draft.awards.push(row);
          return structuredClone(row);
        },
      },
      awardDecision: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          if (this.failDecision) throw new Error("decision storage failed");
          const row = { id: `decision-${draft.decisions.length + 1}`, ...structuredClone(data) };
          draft.decisions.push(row);
          return structuredClone(row);
        },
      },
      completionAuditEntry: {
        findFirst: async ({ where }: { where: { completionId: string; idempotencyKey: string } }) =>
          structuredClone(draft.audit.find((row) => row.completionId === where.completionId && row.idempotencyKey === where.idempotencyKey) ?? null),
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `audit-${draft.audit.length + 1}`, createdAt: new Date(), ...structuredClone(data) };
          draft.audit.push(row);
          return structuredClone(row);
        },
      },
    };
    const result = await work(tx);
    this.data = draft;
    return result;
  }
}

describe("Prisma completion transaction adapter", () => {
  const decisions = ["mvp", "top_scorer", "top_defender", "top_assist"].map((award) => ({ award, playerId: "p1" })) as Parameters<typeof completeTournament>[1];
  const actor = { id: "organizer-1", role: "organizer" as const };
  const key1 = "11111111-1111-4111-8111-111111111111";
  const key2 = "22222222-2222-4222-8222-222222222222";

  it("atomically persists completion, podium, awards, decisions and an idempotent receipt", async () => {
    const db = new MemoryCompletionPrisma();
    const dependencies = createPrismaCompletionDependencies(actor, db as never);
    const first = await completeTournament("event-1", decisions, 0, key1, dependencies);
    expect(first).toMatchObject({ status: "completed", version: 1 });
    expect(db.data.event.competitionVersion).toBe(1);
    expect(db.data.completion).toMatchObject({ id: "completion-1", status: "completed", completedByUserId: "organizer-1" });
    expect(db.data.podium).toHaveLength(3);
    expect(db.data.awards).toHaveLength(4);
    expect(db.data.decisions).toHaveLength(4);
    expect(db.data.audit).toHaveLength(1);
    expect(db.data.audit[0]).toMatchObject({ action: "completed", actorUserId: "organizer-1", idempotencyKey: key1, fingerprint: expect.any(String), result: { status: "completed", version: 1 } });

    expect(await completeTournament("event-1", [...decisions].reverse(), 0, key1, dependencies)).toEqual({
      status: "already_applied", eventId: "event-1", version: 1, result: first,
    });
    expect(db.data.audit).toHaveLength(1);
  });

  it("rejects ownership changes and key reuse by another actor inside the transaction", async () => {
    const db = new MemoryCompletionPrisma();
    await completeTournament("event-1", decisions, 0, key1, createPrismaCompletionDependencies(actor, db as never));
    expect(await completeTournament("event-1", decisions, 1, key1, createPrismaCompletionDependencies({ id: "admin-2", role: "admin" }, db as never)))
      .toMatchObject({ status: "conflict", code: "idempotency_key_reused" });
    expect(await reopenTournament("event-1", "Correction", 1, key2, createPrismaCompletionDependencies({ id: "other-organizer", role: "organizer" }, db as never)))
      .toEqual({ status: "blocked", code: "unauthorized" });
  });

  it("rechecks the actor role, activation and password gate inside the database transaction", async () => {
    const db = new MemoryCompletionPrisma();
    db.data.user.deactivatedAt = new Date("2026-09-13T00:00:00Z");
    expect(await completeTournament("event-1", decisions, 0, key1, createPrismaCompletionDependencies(actor, db as never)))
      .toEqual({ status: "blocked", code: "unauthorized" });
    db.data.user.deactivatedAt = null;
    db.data.user.mustChangePassword = true;
    expect(await completeTournament("event-1", decisions, 0, key1, createPrismaCompletionDependencies(actor, db as never)))
      .toEqual({ status: "blocked", code: "unauthorized" });
    db.data.user.mustChangePassword = false;
    db.data.user.role = "captain";
    expect(await completeTournament("event-1", decisions, 0, key1, createPrismaCompletionDependencies(actor, db as never)))
      .toEqual({ status: "blocked", code: "unauthorized" });
  });

  it("preserves immutable completion receipts across reopen and re-complete", async () => {
    const db = new MemoryCompletionPrisma();
    const dependencies = createPrismaCompletionDependencies(actor, db as never);
    const first = await completeTournament("event-1", decisions, 0, key1, dependencies);
    expect(await reopenTournament("event-1", "Correct official result", 1, key2, dependencies)).toEqual({ status: "reopened", eventId: "event-1", version: 2 });
    expect(await completeTournament("event-1", decisions, 2, "33333333-3333-4333-8333-333333333333", dependencies)).toMatchObject({ status: "completed", version: 3 });
    expect(db.data.audit).toHaveLength(3);
    expect(db.data.audit[0]).toMatchObject({ result: first });
    expect(db.data.completion).toMatchObject({ status: "completed", sourceSnapshot: { version: 3 } });
  });

  it("rolls back the CAS and every partial completion write on failure", async () => {
    const db = new MemoryCompletionPrisma();
    db.failDecision = true;
    await expect(completeTournament("event-1", decisions, 0, key1, createPrismaCompletionDependencies(actor, db as never)))
      .rejects.toThrow("decision storage failed");
    expect(db.data.event.competitionVersion).toBe(0);
    expect(db.data.completion).toBeNull();
    expect(db.data.podium).toEqual([]);
    expect(db.data.awards).toEqual([]);
    expect(db.data.audit).toEqual([]);
  });

  it("returns a stable version conflict after exhausted PostgreSQL serialization retries", async () => {
    const race = Object.assign(new Error("serialization failure"), { code: "P2034" });
    const db = {
      $transaction: async () => { throw race; },
      event: { findUnique: async () => ({ competitionVersion: 7 }) },
    };
    await expect(completeTournament("event-1", decisions, 0, key1, createPrismaCompletionDependencies(actor, db as never)))
      .resolves.toEqual({ status: "conflict", code: "stale_version", version: 7 });
  });
});
