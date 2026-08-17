import { describe, expect, it } from "vitest";

import {
  aggregatePlayerLeaderboard,
  buildLeagueStandings,
  generateRoundRobinSchedule,
  generateSingleEliminationBracket,
  getPublicVisibleSingleEliminationBracket,
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

const TEST_EVENT_ID = "test-event";

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
    const bracket = generateSingleEliminationBracket(teams.slice(0, 6), 8, TEST_EVENT_ID);

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
    const bracket = generateSingleEliminationBracket(teams.slice(0, 7), 12, TEST_EVENT_ID);

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

    const bracket = generateSingleEliminationBracket(extendedTeams, 12, TEST_EVENT_ID);

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
      eventId: TEST_EVENT_ID,
    });

    const semifinal = projected.find((match) => match.round === 2 && match.slot === 1);
    expect(semifinal?.homeTeamId).toBe("team-a");
  });

  it("propagates completed winners into downstream matches", () => {
    const projected = projectSingleEliminationBracket({
      teams: teams.slice(0, 7),
      slotCount: 8,
      eventId: TEST_EVENT_ID,
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
      eventId: TEST_EVENT_ID,
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
      eventId: TEST_EVENT_ID,
    });

    const quarterfinal = projected.find((match) => match.round === 2 && match.slot === 1);
    const semifinal = projected.find((match) => match.round === 3 && match.slot === 1);

    expect(quarterfinal?.resolvedWinnerTeamId).toBe("team-a");
    expect(semifinal?.homeTeamId).toBe("team-a");
  });
});

describe("getPublicVisibleSingleEliminationBracket", () => {
  it("shows the resolved final in an 8-slot bracket with only two teams", () => {
    const visible = getPublicVisibleSingleEliminationBracket({
      teams: teams.slice(0, 2),
      slotCount: 8,
      results: [],
      eventId: TEST_EVENT_ID,
    });

    expect(visible.find((match) => match.id === `${TEST_EVENT_ID}-r3-m1`)).toMatchObject({
      homeTeamId: "team-a",
      awayTeamId: "team-b",
      visibility: "ready",
      isPublicVisible: true,
    });
  });

  it("shows a ready 12-slot semifinal when one team arrives through chained byes", () => {
    const visible = getPublicVisibleSingleEliminationBracket({
      teams: teams.slice(0, 7),
      slotCount: 12,
      eventId: TEST_EVENT_ID,
      results: [
        {
          id: "bracket-r2-m2",
          eventId: "event-1",
          roundLabel: "Quarterfinal",
          homeTeamId: "team-d",
          awayTeamId: "team-e",
          homeScore: 21,
          awayScore: 10,
          status: "Completed",
          round: 2,
          slot: 2,
          winnerTeamId: "team-d",
        },
      ],
    });

    expect(visible.find((match) => match.id === `${TEST_EVENT_ID}-r3-m1`)).toMatchObject({
      homeTeamId: "team-a",
      awayTeamId: "team-d",
      visibility: "ready",
      isPublicVisible: true,
    });
  });

  it("hides downstream rounds until both sides are known", () => {
    const teams = [
      { id: "team-1", name: "One" },
      { id: "team-2", name: "Two" },
      { id: "team-3", name: "Three" },
      { id: "team-4", name: "Four" },
      { id: "team-5", name: "Five" },
      { id: "team-6", name: "Six" },
    ];

    const visible = getPublicVisibleSingleEliminationBracket({
      teams,
      slotCount: 8,
      results: [],
      eventId: TEST_EVENT_ID,
    });

    expect(visible).toHaveLength(4);
    expect(visible.every((match) => match.round === 1)).toBe(true);
    expect(visible.find((match) => match.id === `${TEST_EVENT_ID}-r1-m2`)).toMatchObject({
      homeTeamId: "team-4",
      awayTeamId: "team-5",
      visibility: "ready",
      isPublicVisible: true,
    });
    expect(visible.filter((match) => match.byeForTeamId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `${TEST_EVENT_ID}-r1-m1`,
          byeForTeamId: "team-1",
          visibility: "auto-advance",
          isPublicVisible: true,
        }),
        expect.objectContaining({
          id: `${TEST_EVENT_ID}-r1-m3`,
          byeForTeamId: "team-2",
          visibility: "auto-advance",
          isPublicVisible: true,
        }),
      ]),
    );
    expect(visible.find((match) => match.id === `${TEST_EVENT_ID}-r2-m1`)).toBeUndefined();
    expect(visible.find((match) => match.id === `${TEST_EVENT_ID}-r2-m2`)).toBeUndefined();
  });

  it("shows a semifinal only after both quarterfinal winners are known", () => {
    const teams = Array.from({ length: 8 }, (_, index) => ({
      id: `team-${index + 1}`,
      name: `Team ${index + 1}`,
    }));

    const firstQuarterfinal = {
      id: "bracket-r1-m1",
      eventId: "event-1",
      roundLabel: "Quarterfinal",
      homeTeamId: "team-1",
      awayTeamId: "team-8",
      homeScore: 21,
      awayScore: 10,
      status: "Completed" as const,
      round: 1,
      slot: 1,
      winnerTeamId: "team-1",
    };
    const partiallyVisible = getPublicVisibleSingleEliminationBracket({
      teams,
      slotCount: 8,
      results: [firstQuarterfinal],
      eventId: TEST_EVENT_ID,
    });
    expect(partiallyVisible.some((match) => match.round === 2)).toBe(false);

    const visible = getPublicVisibleSingleEliminationBracket({
      teams,
      slotCount: 8,
      eventId: TEST_EVENT_ID,
      results: [
        firstQuarterfinal,
        {
          id: "bracket-r1-m2",
          eventId: "event-1",
          roundLabel: "Quarterfinal",
          homeTeamId: "team-4",
          awayTeamId: "team-5",
          homeScore: 21,
          awayScore: 10,
          status: "Completed",
          round: 1,
          slot: 2,
          winnerTeamId: "team-4",
        },
      ],
    });

    expect(visible.find((match) => match.id === `${TEST_EVENT_ID}-r2-m1`)).toMatchObject({
      homeTeamId: "team-1",
      awayTeamId: "team-4",
      visibility: "ready",
      isPublicVisible: true,
    });
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
