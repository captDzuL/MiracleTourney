import { describe, expect, it } from "vitest";

import {
  aggregatePlayerLeaderboard,
  buildLeagueStandings,
  generateRoundRobinSchedule,
  generateSingleEliminationBracket,
  getLiveStreamPresentation,
} from "./engine";
import type {
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
