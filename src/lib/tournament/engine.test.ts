import { describe, expect, it } from "vitest";

import {
  aggregatePlayerLeaderboard,
  buildLeagueStandings,
  generateRoundRobinSchedule,
  generateSingleEliminationBracket,
  getLiveStreamPresentation,
  projectSingleEliminationBracket,
} from "./engine";
import { getBracketPreview, setMatchResult } from "../platform/demo-store";
import type { Match } from "../platform/types";
import type {
  BracketMatch,
  MatchResultInput,
  PlayerMatchStatInput,
  TeamSeed,
} from "./types";

const teams: TeamSeed[] = [
  { id: "team-a", name: "Team A" },
  { id: "team-b", name: "Team B" },
  { id: "team-c", name: "Team C" },
  { id: "team-d", name: "Team D" },
  { id: "team-e", name: "Team E" },
  { id: "team-f", name: "Team F" },
  { id: "team-g", name: "Team G" },
  { id: "team-h", name: "Team H" },
];

describe("generateSingleEliminationBracket", () => {
  it("creates seeded first-round matches and byes for open slots", () => {
    const bracket = generateSingleEliminationBracket(teams.slice(0, 6), 8);

    expect(bracket.length).toBe(7);
    expect(bracket.filter((match) => match.round === 1)).toHaveLength(4);
    expect(bracket.filter((match) => match.byeForTeamId)).toHaveLength(2);
    expect(bracket[0]).toMatchObject({
      round: 1,
      homeTeamId: "team-a",
      awayTeamId: null,
      byeForTeamId: "team-a",
    });
  });

  it("keeps undersubscribed events in their configured preset bracket", () => {
    const bracket = generateSingleEliminationBracket(teams.slice(0, 7), 12);

    expect(bracket.filter((match) => match.round === 1)).toHaveLength(8);
    expect(bracket.filter((match) => match.byeForTeamId)).toHaveLength(7);
  });

  it("still keeps the standard 12-team preset behavior when the event is full", () => {
    const extendedTeams: TeamSeed[] = [
      ...teams,
      { id: "team-i", name: "Team I" },
      { id: "team-j", name: "Team J" },
      { id: "team-k", name: "Team K" },
      { id: "team-l", name: "Team L" },
    ];

    const bracket = generateSingleEliminationBracket(extendedTeams, 12);

    expect(bracket.filter((match) => match.round === 1)).toHaveLength(8);
    expect(bracket.filter((match) => match.byeForTeamId)).toHaveLength(4);
  });
});

describe("projectSingleEliminationBracket", () => {
  it("auto-advances a bye winner into the next round", () => {
    const projected = projectSingleEliminationBracket({
      teams: teams.slice(0, 7),
      slotCount: 8,
      results: [],
    });

    const semifinal = projected.find((match) => match.round === 2 && match.slot === 1);
    expect(semifinal?.homeTeamId).toBe("team-a");
  });

  it("propagates completed winners into downstream matches", () => {
    const projected = projectSingleEliminationBracket({
      teams: teams.slice(0, 7),
      slotCount: 8,
      results: [
        {
          id: "bracket-r1-m2",
          eventId: "event-kuroko-summer",
          roundLabel: "Quarterfinal",
          homeTeamId: "team-d",
          awayTeamId: "team-e",
          homeScore: 15,
          awayScore: 21,
          status: "Completed",
          round: 1,
          slot: 2,
          winnerTeamId: "team-e",
        },
      ] as Match[],
    });

    const semifinal = projected.find((match) => match.round === 2 && match.slot === 1);
    expect(semifinal).toMatchObject({
      homeTeamId: "team-a",
      awayTeamId: "team-e",
    });
  });

  it("does not advance a result whose teams differ from its projected matchup", () => {
    const projected = projectSingleEliminationBracket({
      teams: teams.slice(0, 4),
      slotCount: 8,
      results: [
        {
          id: "unrelated-semifinal-result",
          eventId: "event-kuroko-summer",
          roundLabel: "Semifinal",
          homeTeamId: "team-b",
          awayTeamId: "team-c",
          homeScore: 18,
          awayScore: 21,
          status: "Completed",
          round: 2,
          slot: 1,
          winnerTeamId: "team-c",
        },
      ],
    });

    const semifinal = projected.find((match) => match.round === 2 && match.slot === 1);
    const final = projected.find((match) => match.round === 3 && match.slot === 1);

    expect(semifinal).toMatchObject({
      homeTeamId: "team-a",
      awayTeamId: "team-d",
      resolvedWinnerTeamId: null,
    });
    expect(final?.homeTeamId).toBeNull();
  });

  it("continues automatic advancement through chained byes", () => {
    const projected = projectSingleEliminationBracket({
      teams: teams.slice(0, 7),
      slotCount: 12,
      results: [],
    });

    const quarterfinal = projected.find((match) => match.round === 2 && match.slot === 1);
    const semifinal = projected.find((match) => match.round === 3 && match.slot === 1);

    expect(quarterfinal?.resolvedWinnerTeamId).toBe("team-a");
    expect(semifinal?.homeTeamId).toBe("team-a");
  });
});

describe("getBracketPreview", () => {
  it("returns propagated semifinal teams through the event-facing bracket preview", () => {
    const bracket = getBracketPreview("event-kuroko-summer") as BracketMatch[];
    const semifinal = bracket.find((match) => match.round === 2 && match.slot === 1);

    expect(semifinal?.homeTeamId).toBeTruthy();
    expect(semifinal?.awayTeamId).toBeTruthy();
  });

  it("does not project a completed store result when its teams mismatch the bracket slot", () => {
    setMatchResult({
      eventId: "event-kuroko-summer",
      matchId: "match-kuroko-1",
      homeScore: 21,
      awayScore: 18,
    });

    const preview = getBracketPreview("event-kuroko-summer");
    const final = preview.find(
      (match) => match.round === 3 && "slot" in match && match.slot === 1,
    );

    expect(final?.homeTeamId).toBeNull();
  });
});

describe("generateRoundRobinSchedule", () => {
  it("creates a full round robin schedule for all teams", () => {
    const schedule = generateRoundRobinSchedule(teams.slice(0, 4));

    expect(schedule).toHaveLength(6);
    expect(schedule.map((match) => [match.homeTeamId, match.awayTeamId])).toContainEqual([
      "team-a",
      "team-b",
    ]);
    expect(schedule.map((match) => [match.homeTeamId, match.awayTeamId])).toContainEqual([
      "team-c",
      "team-d",
    ]);
  });
});

describe("buildLeagueStandings", () => {
  it("ranks teams by points, score difference, then score for", () => {
    const results: MatchResultInput[] = [
      {
        id: "match-1",
        homeTeamId: "team-a",
        awayTeamId: "team-b",
        homeScore: 70,
        awayScore: 60,
      },
      {
        id: "match-2",
        homeTeamId: "team-c",
        awayTeamId: "team-d",
        homeScore: 60,
        awayScore: 55,
      },
      {
        id: "match-3",
        homeTeamId: "team-a",
        awayTeamId: "team-c",
        homeScore: 50,
        awayScore: 65,
      },
    ];

    const standings = buildLeagueStandings(teams.slice(0, 4), results);

    expect(standings[0]).toMatchObject({
      teamId: "team-c",
      points: 6,
      rank: 1,
    });
    expect(standings[1]).toMatchObject({
      teamId: "team-a",
      points: 3,
      wins: 1,
      losses: 1,
      scoreDifference: -5,
    });
  });
});

describe("aggregatePlayerLeaderboard", () => {
  it("aggregates game-specific player stats and supports position sorting", () => {
    const stats: PlayerMatchStatInput[] = [
      {
        matchId: "match-1",
        playerId: "player-1",
        playerName: "Aomine",
        teamId: "team-a",
        position: "Forward",
        gameSlug: "kuroko-street-rival",
        stats: { points: 18, assists: 3, rebounds: 4, steals: 2, blocks: 1 },
      },
      {
        matchId: "match-2",
        playerId: "player-1",
        playerName: "Aomine",
        teamId: "team-a",
        position: "Forward",
        gameSlug: "kuroko-street-rival",
        stats: { points: 12, assists: 4, rebounds: 5, steals: 1, blocks: 0 },
      },
      {
        matchId: "match-2",
        playerId: "player-2",
        playerName: "Midorima",
        teamId: "team-b",
        position: "Guard",
        gameSlug: "kuroko-street-rival",
        stats: { points: 20, assists: 1, rebounds: 2, steals: 0, blocks: 0 },
      },
    ];

    const leaderboard = aggregatePlayerLeaderboard(stats, "points");

    expect(leaderboard[0]).toMatchObject({
      playerId: "player-1",
      totalStats: {
        points: 30,
        assists: 7,
      },
      matchesPlayed: 2,
    });
    expect(leaderboard[1]).toMatchObject({
      playerId: "player-2",
      totalStats: {
        points: 20,
      },
      matchesPlayed: 1,
    });
  });
});

describe("getLiveStreamPresentation", () => {
  it("returns embeddable metadata for youtube and fallback metadata for tiktok", () => {
    expect(
      getLiveStreamPresentation("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    ).toMatchObject({
      platform: "youtube",
      embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      shouldEmbed: true,
    });

    expect(getLiveStreamPresentation("https://www.tiktok.com/@miracle/live")).toMatchObject({
      platform: "tiktok",
      shouldEmbed: false,
    });
  });
});

describe("setMatchResult", () => {
  it("stores completed match results with a derived winner", () => {
    const match = setMatchResult({
      eventId: "event-kuroko-summer",
      matchId: "match-kuroko-1",
      homeScore: 21,
      awayScore: 18,
    });

    expect(match).toMatchObject({
      id: "match-kuroko-1",
      status: "Completed",
      homeScore: 21,
      awayScore: 18,
      winnerTeamId: "team-seirin",
    });
  });

  it("rejects ties for single-elimination result entry", () => {
    expect(() =>
      setMatchResult({
        eventId: "event-kuroko-summer",
        matchId: "match-kuroko-1",
        homeScore: 20,
        awayScore: 20,
      }),
    ).toThrow("Single elimination matches cannot end in a draw.");
  });
});
