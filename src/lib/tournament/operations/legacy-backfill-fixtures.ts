// Test-only synthetic data shaped like the three finished old events. No real names, ids or scores.
import { generateCompetitionGraph, type CompetitionGraph, type CompetitionMatch, type ParticipantSource } from "../competition";
import { bracketSize } from "../competition/shared";
import type { BackfillGame, BackfillMatch, BackfillRoundConfig, LegacyBackfillInput, ThirdPlaceSpec } from "./legacy-backfill-types";

export type FixtureOptions = {
  teamCount: number;
  eventId?: string;
  /** Series length per bucket; defaults to best-of-1 everywhere. */
  bestOf?: { early?: number; semifinals?: number; final?: number };
  /** Emit a round rule for every label, even best-of-1 ones. */
  allRules?: boolean;
  withGames?: boolean;
  /** Name the two semifinal losers like the third place spec and return the spec. */
  withThirdPlace?: boolean;
  organizerUserId?: string | null;
};

export type Fixture = {
  input: LegacyBackfillInput;
  graph: CompetitionGraph;
  /** Legacy row per generated node id (bye nodes have none). */
  rowOfNode: Map<string, BackfillMatch>;
  semifinalLosers: string[];
  teamIdOfSeed: (seed: number) => string;
};

export const FIXTURE_NOW = new Date("2026-10-14T00:00:00.000Z");

export function roundLabelOf(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round;
  return ["Final", "Semifinal", "Quarterfinal", "Round of 16"][fromEnd] ?? "Round 1";
}

function gamesOf(matchId: string, bestOf: number, winnerIsHome: boolean, loserWins: number): BackfillGame[] {
  const needed = Math.ceil(bestOf / 2);
  return Array.from({ length: needed + loserWins }, (_, index) => {
    const winnerTakes = index >= loserWins;
    const homeTakes = winnerTakes === winnerIsHome;
    return { matchId, gameNumber: index + 1, homeScore: homeTakes ? 2 : 1, awayScore: homeTakes ? 1 : 2 };
  });
}

type Played = { winner: string; loser: string };

function seedOfTeam(teamId: string) {
  return Number(teamId.replace("team-", ""));
}

function resolve(source: ParticipantSource, played: Map<string, Played>): string {
  if (source.kind === "team") return source.teamId;
  if (source.kind !== "match") return "";
  const result = played.get(source.matchId);
  return result ? result[source.outcome] : "";
}

function playNode(node: CompetitionMatch, played: Map<string, Played>, index: number, options: FixtureOptions) {
  const homeTeamId = resolve(node.home, played);
  const awayTeamId = resolve(node.away, played);
  const homeWins = seedOfTeam(homeTeamId) < seedOfTeam(awayTeamId);
  const winner = homeWins ? homeTeamId : awayTeamId;
  const loser = homeWins ? awayTeamId : homeTeamId;
  const needed = Math.ceil(node.bestOf / 2);
  const loserWins = node.bestOf === 1 ? 1 : index % needed;
  const [winnerScore, loserScore] = node.bestOf === 1 ? [3, 1] : [needed, loserWins];
  const id = `${options.eventId ?? "evt"}-r${node.round}-m${node.slot}`;
  const games = node.bestOf === 1
    ? options.withGames ? [{ matchId: id, gameNumber: 1, homeScore: homeWins ? 3 : 1, awayScore: homeWins ? 1 : 3 }] : []
    : options.withGames ? gamesOf(id, node.bestOf, homeWins, loserWins) : [];
  return { loser, winner, games, row: { id, homeTeamId, awayTeamId, homeScore: homeWins ? winnerScore : loserScore, awayScore: homeWins ? loserScore : winnerScore, winnerTeamId: winner } };
}

/** A finished old event: results simulated through the V3 graph, bye rows dropped, advanced teams stored in later rounds. */
export function legacyFixture(options: FixtureOptions): Fixture {
  const eventId = options.eventId ?? "evt";
  const size = bracketSize(options.teamCount);
  const totalRounds = Math.log2(size);
  const bestOf = { earlyRounds: options.bestOf?.early ?? 1, semifinals: options.bestOf?.semifinals ?? 1, thirdPlace: 1, final: options.bestOf?.final ?? 1 };
  const seeded = Array.from({ length: options.teamCount }, (_, index) => ({ id: `team-${index + 1}`, seed: index + 1 }));
  const graph = generateCompetitionGraph({
    eventId, teams: seeded, slotCount: size,
    config: { version: 1, kind: "single_elimination", bestOf, thirdPlace: "none" },
  });
  const played = new Map<string, Played>();
  const rowOfNode = new Map<string, BackfillMatch>();
  const games: BackfillGame[] = [];
  const pending = graph.matches.filter((node) => node.status === "pending").sort((a, b) => a.round - b.round || a.slot - b.slot);
  pending.forEach((node, index) => {
    const result = playNode(node, played, index, { ...options, eventId });
    played.set(node.id, { winner: result.winner, loser: result.loser });
    games.push(...result.games);
    rowOfNode.set(node.id, {
      ...result.row, round: node.round, slot: node.slot, roundLabel: roundLabelOf(node.round, totalRounds), status: "Completed", resultVersion: 0,
    });
  });
  const semifinalLosers = pending.filter((node) => node.round === totalRounds - 1).map((node) => played.get(node.id)!.loser);
  const names = new Map(seeded.map((team) => [team.id, `Team ${team.seed}`]));
  if (options.withThirdPlace) {
    names.set(semifinalLosers[0], "Evrosheim");
    names.set(semifinalLosers[1], "Helix Eclipse");
  }
  const labels = [...new Set([...rowOfNode.values()].map((row) => row.roundLabel))];
  const bestOfOfLabel = (label: string) => [...rowOfNode].map(([id, row]) => ({ row, node: graph.matches.find((n) => n.id === id)! })).find(({ row }) => row.roundLabel === label)!.node.bestOf;
  const roundConfigs: BackfillRoundConfig[] = labels.map((roundLabel) => ({ roundLabel, bestOf: bestOfOfLabel(roundLabel) }))
    .filter((rule) => options.allRules || rule.bestOf !== 1);
  const thirdPlace: ThirdPlaceSpec | undefined = options.withThirdPlace
    ? { winnerTeamName: "Evrosheim", loserTeamName: "Helix Eclipse", reason: "Skor asli tidak tercatat; hanya pemenang yang dikonfirmasi organizer" }
    : undefined;
  const input: LegacyBackfillInput = {
    event: {
      id: eventId, slug: `${eventId}-slug`, format: "Single Elimination", formatConfig: { legacy: true },
      organizerUserId: options.organizerUserId === undefined ? "organizer-1" : options.organizerUserId,
      competitionVersion: 4, gameId: "game-flashpeak", gameModeId: "mode-flashpeak-5v5",
    },
    teams: seeded.map((team) => ({ id: team.id, name: names.get(team.id)! })),
    matches: [...rowOfNode.values()],
    roundConfigs,
    matchGames: games,
    thirdPlace,
    actorUserId: "actor-1",
    now: FIXTURE_NOW,
  };
  return { input, graph, rowOfNode, semifinalLosers, teamIdOfSeed: (seed) => `team-${seed}` };
}

/** Replace one stored row (by round and slot) without touching the fixture. */
export function withRow(input: LegacyBackfillInput, round: number, slot: number, patch: Partial<BackfillMatch>): LegacyBackfillInput {
  return { ...input, matches: input.matches.map((row) => (row.round === round && row.slot === slot ? { ...row, ...patch } : row)) };
}

export function withoutRow(input: LegacyBackfillInput, round: number, slot: number): LegacyBackfillInput {
  return { ...input, matches: input.matches.filter((row) => !(row.round === round && row.slot === slot)) };
}
