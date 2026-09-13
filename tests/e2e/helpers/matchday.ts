import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { validateE2eDatabaseConfiguration } from "../../../scripts/e2e-db-configuration.mjs";
import { createCompetitionOperations, type OperationCommand } from "../../../src/lib/tournament/operations";
import type { CompetitionGraph } from "../../../src/lib/tournament/competition";
import { TOURNAMENT_FORMAT_PRESETS, type TournamentFormatConfig } from "../../../src/lib/tournament/formats/types";

export const matchdayDb = new PrismaClient();
export type MatchdayKind = "single_elimination" | "double_elimination" | "round_robin" | "group_playoffs";
export const matchdayConfigs: Record<MatchdayKind, TournamentFormatConfig> = {
  single_elimination: { version: 1, kind: "single_elimination", thirdPlace: "none", bestOf: { earlyRounds: 1, semifinals: 1, final: 1, thirdPlace: 1 } },
  double_elimination: { version: 1, kind: "double_elimination", thirdPlace: "lower_final_loser", bestOf: { earlyRounds: 1, upperFinal: 1, lowerFinal: 1, grandFinal: 1 } },
  round_robin: TOURNAMENT_FORMAT_PRESETS.roundRobin,
  group_playoffs: { version: 1, kind: "group_playoffs", groupCount: 2, qualifiersPerGroup: 2, groupStage: { legs: 1, points: { win: 3, draw: 1, loss: 0 }, tiebreakers: ["score_difference", "wins"] }, playoffs: { version: 1, kind: "single_elimination", thirdPlace: "none", bestOf: { earlyRounds: 1, semifinals: 1, final: 1, thirdPlace: 1 }, avoidImmediateGroupRematches: true } },
};
export const matchdaySchedule = { timezone: "Asia/Jakarta", eventWindow: { start: "2026-01-01T02:00:00.000Z", end: "2026-01-02T02:00:00.000Z" }, matchDurationMinutes: 30, bufferMinutes: 5, minimumRestMinutes: 10, rooms: ["Arena A", "Arena B"] };

/** Test-only factory. No app endpoint; guarded even when called outside Playwright.
 * A unique namespace per attempt prevents retries from seeing mutated prior data.
 * IDs, seeds and topology within that namespace are deterministic. */
export async function prepareMatchdayFixture(kind: MatchdayKind = "single_elimination", stage: "empty" | "graph" | "published" | "showcase" = "published", namespace = randomUUID().slice(0, 12)) {
  const safe = validateE2eDatabaseConfiguration(process.env);
  if (!safe.ok) throw new Error(safe.message);
  if (process.env.E2E_DATABASE_RESET_ALLOWED !== "true") throw new Error("Blocked: set E2E_DATABASE_RESET_ALLOWED=true in .env.test before creating DB-backed fixtures.");
  if (!/^[a-z0-9-]{1,48}$/.test(namespace)) throw new Error("Invalid fixture namespace");
  const id = `e2e-md-${kind}-${namespace}`;
  const actor = await matchdayDb.user.findUniqueOrThrow({ where: { email: "organizer-a@miraclefc.gg" }, select: { id: true, role: true } });
  // Explicit fixture identity makes reruns idempotent without touching unrelated data.
  await matchdayDb.event.deleteMany({ where: { id, slug: id } });
  const config = matchdayConfigs[kind];
  try {
    await matchdayDb.event.create({ data: { id, slug: id, name: `Match Day ${kind} ${namespace}`, description: "Match Day V3 deterministic E2E fixture", gameId: "game-flashpeak", gameModeId: "mode-flashpeak-5v5", organizerUserId: actor.id, organizerName: "Match Day Organizer", status: "Ongoing", format: kind.includes("elimination") ? "Single Elimination" : "League", formatConfig: config as Prisma.InputJsonValue, participantCap: stage === "showcase" ? 8 : 4, timezone: "Asia/Jakarta", eventStartsAt: new Date(matchdaySchedule.eventWindow.start), startsAt: "2026-01-01", registrationWindow: "Closed", venue: "Arena", publishedAt: new Date("2026-01-01T00:00:00Z") } });
    const teams = Array.from({ length: stage === "showcase" ? 8 : 4 }, (_, i) => ({ id: `${id}-team-${i + 1}`, eventId: id, name: `Team ${i + 1}`, tag: `M${i + 1}`, logoText: `M${i + 1}`, source: "e2e", createdAt: new Date(1700000000000 + i) }));
    await matchdayDb.team.createMany({ data: teams });
    const operations = createCompetitionOperations(matchdayDb);
    let sequence = 0;
    const run = async (command: OperationCommand) => {
      const event = await matchdayDb.event.findUniqueOrThrow({ where: { id }, select: { competitionVersion: true } });
      return operations.execute({ eventId: id, actor, expectedVersion: event.competitionVersion, idempotencyKey: `fixture-${++sequence}`, command });
    };
    if (stage !== "empty") await run({ kind: "initialize", config, teams: teams.map((t, i) => ({ id: t.id, seed: i + 1 })) });
    if (stage === "published" || stage === "showcase") {
      const draft = await run({ kind: "schedule_save", input: matchdaySchedule });
      await run({ kind: "schedule_publish", revisionId: draft.resourceId! });
    }
    const graph = async () => {
      const phase = await matchdayDb.competitionPhase.findFirstOrThrow({ where: { eventId: id, sequence: 1 } });
      return (phase.configuration as unknown as { graph: CompetitionGraph }).graph;
    };
    if (stage === "showcase") {
      const playable = (await graph()).matches.filter(m => m.home.kind === "team" && m.away.kind === "team");
      const first = playable[0];
      await run({ kind: "match_start", matchId: first.id, reason: "Showcase fixture setup" });
      await run({ kind: "result_submit", matchId: first.id, games: [{ gameNumber: 1, homeScore: 2, awayScore: 0 }] });
      const games = [{ gameNumber: 1, homeScore: 0, awayScore: 2 }];
      const preview = await operations.previewResultCorrection({ eventId: id, actor, matchId: first.id, games });
      await run({ kind: "result_correct", matchId: first.id, games, reason: "Verified desk correction", previewToken: preview.token });
      const liveTeams = new Set<string>(); let liveCount = 0;
      for (const node of playable.slice(1)) {
        if (node.home.kind !== "team" || node.away.kind !== "team" || liveTeams.has(node.home.teamId) || liveTeams.has(node.away.teamId)) continue;
        for (const teamId of [node.home.teamId, node.away.teamId]) {
          await run({ kind: "readiness_update", matchId: node.id, teamId, status: "checked_in" });
          await run({ kind: "readiness_update", matchId: node.id, teamId, status: "ready" }); liveTeams.add(teamId);
        }
        await run({ kind: "match_start", matchId: node.id });
        if (++liveCount === 2) break;
      }
      const pending = await matchdayDb.match.findFirst({ where: { eventId: id, status: "Scheduled" } });
      if (pending) await run({ kind: "match_timing", matchId: pending.id, status: "delayed", reason: "Room equipment check" });
      for (const [title, urgency, expired, published] of [["Active urgent notice", "urgent", false, true], ["Expired notice", "important", true, true], ["Private draft notice", "info", false, false]] as const) {
        const draft = await run({ kind: "announcement_save", title, body: title, urgency, ...(expired ? { startsAt: "2025-01-01T00:00:00Z", endsAt: "2025-01-02T00:00:00Z" } : {}) });
        if (published) await run({ kind: "announcement_publish", announcementId: draft.resourceId! });
      }
      await run({ kind: "schedule_save", input: matchdaySchedule });
    }
    return { id, slug: id, teams, actor, graph, run, operations, cleanup: async () => { await matchdayDb.event.deleteMany({ where: { id, slug: id } }); } };
  } catch (error) { await matchdayDb.event.deleteMany({ where: { id, slug: id } }); throw error; }
}
