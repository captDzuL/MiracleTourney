import { games, gameModes } from "@/lib/platform/config";
import type { AppUser, Event, Match, Player, Team } from "@/lib/platform/types";
import {
  aggregatePlayerLeaderboard,
  buildLeagueStandings,
  generateRoundRobinSchedule,
  generateSingleEliminationBracket,
  getLiveStreamPresentation,
} from "@/lib/tournament/engine";
import type { MatchResultInput, PlayerMatchStatInput } from "@/lib/tournament/types";

type DemoState = {
  users: AppUser[];
  events: Event[];
  teams: Team[];
  players: Player[];
  matches: Match[];
  playerStats: PlayerMatchStatInput[];
};

const initialState: DemoState = {
  users: [
    {
      id: "captain-seirin",
      email: "captain@miraclefc.gg",
      name: "Riko Aida",
      role: "captain",
    },
    {
      id: "admin-commish",
      email: "admin@miraclefc.gg",
      name: "League Commissioner",
      role: "admin",
    },
  ],
  events: [
    {
      id: "event-kuroko-summer",
      slug: "kuroko-summer-cup",
      name: "Kuroko Street Rival Summer Cup",
      description:
        "3v3 knockout event built for quick public viewing, clean participant management, and semifinal live coverage.",
      gameId: "game-kuroko",
      gameModeId: "mode-kuroko-3v3",
      format: "Single Elimination",
      status: "Ongoing",
      participantCap: 8,
      registrationWindow: "July 1, 2026 - July 20, 2026",
      startsAt: "July 30, 2026",
      venue: "Online Arena",
      stream: {
        platform: "youtube",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        label: "Semifinal Live Broadcast",
        enabled: true,
        isLive: true,
      },
    },
    {
      id: "event-flashpeak-open",
      slug: "flashpeak-open-league",
      name: "Flashpeak Open League",
      description:
        "5v5 league format for a cleaner recurring competition structure with simple offensive and defensive stats.",
      gameId: "game-flashpeak",
      gameModeId: "mode-flashpeak-5v5",
      format: "League",
      status: "Published",
      participantCap: 12,
      registrationWindow: "July 28, 2026 - August 10, 2026",
      startsAt: "August 15, 2026",
      venue: "Flashpeak Match Hub",
    },
  ],
  teams: [
    { id: "team-seirin", eventId: "event-kuroko-summer", captainId: "captain-seirin", name: "Seirin", logoText: "SR", tag: "SER" },
    { id: "team-kaijo", eventId: "event-kuroko-summer", captainId: "captain-seirin", name: "Kaijo", logoText: "KJ", tag: "KAI" },
    { id: "team-rakuzan", eventId: "event-kuroko-summer", captainId: "captain-seirin", name: "Rakuzan", logoText: "RZ", tag: "RAK" },
    { id: "team-shutoku", eventId: "event-kuroko-summer", captainId: "captain-seirin", name: "Shutoku", logoText: "ST", tag: "SHU" },
    { id: "team-miracle", eventId: "event-flashpeak-open", captainId: "captain-seirin", name: "Miracle Five", logoText: "M5", tag: "MFC" },
    { id: "team-thunder", eventId: "event-flashpeak-open", captainId: "captain-seirin", name: "Thunder Street", logoText: "TS", tag: "THS" },
    { id: "team-vortex", eventId: "event-flashpeak-open", captainId: "captain-seirin", name: "Vortex", logoText: "VX", tag: "VTX" },
    { id: "team-scorch", eventId: "event-flashpeak-open", captainId: "captain-seirin", name: "Scorch FC", logoText: "SC", tag: "SCR" },
  ],
  players: [
    { id: "player-kagami", teamId: "team-seirin", eventId: "event-kuroko-summer", displayName: "Taiga Kagami", nickname: "Kagami", position: "Forward", jerseyNumber: 10 },
    { id: "player-kuroko", teamId: "team-seirin", eventId: "event-kuroko-summer", displayName: "Tetsuya Kuroko", nickname: "Kuroko", position: "Guard", jerseyNumber: 11 },
    { id: "player-kiyoshi", teamId: "team-seirin", eventId: "event-kuroko-summer", displayName: "Teppei Kiyoshi", nickname: "Kiyoshi", position: "Center", jerseyNumber: 7 },
    { id: "player-kise", teamId: "team-kaijo", eventId: "event-kuroko-summer", displayName: "Ryota Kise", nickname: "Kise", position: "Forward", jerseyNumber: 8 },
    { id: "player-kasamatsu", teamId: "team-kaijo", eventId: "event-kuroko-summer", displayName: "Yukio Kasamatsu", nickname: "Kasamatsu", position: "Guard", jerseyNumber: 4 },
    { id: "player-midorima", teamId: "team-shutoku", eventId: "event-kuroko-summer", displayName: "Shintaro Midorima", nickname: "Midorima", position: "Guard", jerseyNumber: 6 },
    { id: "player-akao", teamId: "team-rakuzan", eventId: "event-kuroko-summer", displayName: "Seijuro Akashi", nickname: "Akashi", position: "Guard", jerseyNumber: 1 },
    { id: "player-rin", teamId: "team-miracle", eventId: "event-flashpeak-open", displayName: "Rin Surya", nickname: "Rin", position: "Forward", jerseyNumber: 9 },
    { id: "player-bima", teamId: "team-miracle", eventId: "event-flashpeak-open", displayName: "Bima Kartika", nickname: "Bima", position: "Goalkeeper", jerseyNumber: 1 },
    { id: "player-dino", teamId: "team-thunder", eventId: "event-flashpeak-open", displayName: "Dino", nickname: "Dino", position: "Defender", jerseyNumber: 4 },
    { id: "player-eko", teamId: "team-vortex", eventId: "event-flashpeak-open", displayName: "Eko", nickname: "Eko", position: "Midfielder", jerseyNumber: 7 },
    { id: "player-faris", teamId: "team-scorch", eventId: "event-flashpeak-open", displayName: "Faris", nickname: "Faris", position: "Forward", jerseyNumber: 10 },
  ],
  matches: [
    { id: "match-kuroko-1", eventId: "event-kuroko-summer", roundLabel: "Quarterfinal", homeTeamId: "team-seirin", awayTeamId: "team-kaijo", homeScore: 21, awayScore: 16, status: "Completed" },
    { id: "match-kuroko-2", eventId: "event-kuroko-summer", roundLabel: "Quarterfinal", homeTeamId: "team-rakuzan", awayTeamId: "team-shutoku", homeScore: 18, awayScore: 20, status: "Completed" },
    { id: "match-flash-1", eventId: "event-flashpeak-open", roundLabel: "Matchday 1", homeTeamId: "team-miracle", awayTeamId: "team-thunder", homeScore: 4, awayScore: 2, status: "Completed" },
    { id: "match-flash-2", eventId: "event-flashpeak-open", roundLabel: "Matchday 1", homeTeamId: "team-vortex", awayTeamId: "team-scorch", homeScore: 1, awayScore: 1, status: "Completed" },
  ],
  playerStats: [
    { matchId: "match-kuroko-1", playerId: "player-kagami", playerName: "Taiga Kagami", teamId: "team-seirin", position: "Forward", gameSlug: "kuroko-street-rival", stats: { points: 14, assists: 2, rebounds: 6, steals: 1, blocks: 2 } },
    { matchId: "match-kuroko-1", playerId: "player-kuroko", playerName: "Tetsuya Kuroko", teamId: "team-seirin", position: "Guard", gameSlug: "kuroko-street-rival", stats: { points: 4, assists: 8, rebounds: 1, steals: 3, blocks: 0 } },
    { matchId: "match-kuroko-2", playerId: "player-midorima", playerName: "Shintaro Midorima", teamId: "team-shutoku", position: "Guard", gameSlug: "kuroko-street-rival", stats: { points: 16, assists: 1, rebounds: 2, steals: 1, blocks: 0 } },
    { matchId: "match-kuroko-2", playerId: "player-akao", playerName: "Seijuro Akashi", teamId: "team-rakuzan", position: "Guard", gameSlug: "kuroko-street-rival", stats: { points: 10, assists: 6, rebounds: 2, steals: 2, blocks: 0 } },
    { matchId: "match-flash-1", playerId: "player-rin", playerName: "Rin Surya", teamId: "team-miracle", position: "Forward", gameSlug: "flashpeak", stats: { goals: 2, assists: 1, tackles: 1, blocks: 0 } },
    { matchId: "match-flash-1", playerId: "player-bima", playerName: "Bima Kartika", teamId: "team-miracle", position: "Goalkeeper", gameSlug: "flashpeak", stats: { goals: 0, assists: 0, tackles: 3, blocks: 2 } },
    { matchId: "match-flash-1", playerId: "player-dino", playerName: "Dino", teamId: "team-thunder", position: "Defender", gameSlug: "flashpeak", stats: { goals: 0, assists: 1, tackles: 4, blocks: 1 } },
    { matchId: "match-flash-2", playerId: "player-eko", playerName: "Eko", teamId: "team-vortex", position: "Midfielder", gameSlug: "flashpeak", stats: { goals: 1, assists: 0, tackles: 2, blocks: 0 } },
    { matchId: "match-flash-2", playerId: "player-faris", playerName: "Faris", teamId: "team-scorch", position: "Forward", gameSlug: "flashpeak", stats: { goals: 1, assists: 0, tackles: 1, blocks: 0 } },
  ],
};

const globalStore = globalThis as typeof globalThis & { __mflStore?: DemoState };

function cloneState(state: DemoState): DemoState {
  return {
    users: [...state.users],
    events: [...state.events],
    teams: [...state.teams],
    players: [...state.players],
    matches: [...state.matches],
    playerStats: [...state.playerStats],
  };
}

function getStore() {
  if (!globalStore.__mflStore) {
    globalStore.__mflStore = cloneState(initialState);
  }

  return globalStore.__mflStore;
}

export function getAllGames() {
  return games;
}

export function getGameModes() {
  return gameModes;
}

export function getEvents() {
  return getStore().events;
}

export function getEventBySlug(slug: string) {
  return getStore().events.find((event) => event.slug === slug);
}

export function getGameForEvent(event: Event) {
  return games.find((game) => game.id === event.gameId)!;
}

export function getModeForEvent(event: Event) {
  return gameModes.find((mode) => mode.id === event.gameModeId)!;
}

export function getTeamsForEvent(eventId: string) {
  return getStore().teams.filter((team) => team.eventId === eventId);
}

export function getPlayersForTeam(teamId: string) {
  return getStore().players.filter((player) => player.teamId === teamId);
}

export function getPlayersForEvent(eventId: string) {
  return getStore().players.filter((player) => player.eventId === eventId);
}

export function getMatchesForEvent(eventId: string) {
  return getStore().matches.filter((match) => match.eventId === eventId);
}

export function getLeaderboardForEvent(eventId: string) {
  const event = getStore().events.find((item) => item.id === eventId);

  if (!event) return [];

  const game = getGameForEvent(event);
  const metric = game.slug === "flashpeak" ? "goals" : "points";

  return aggregatePlayerLeaderboard(
    getStore().playerStats.filter((stat) => stat.gameSlug === game.slug),
    metric,
  );
}

export function getTeamStandings(eventId: string) {
  const event = getStore().events.find((item) => item.id === eventId);

  if (!event) return [];

  const teams = getTeamsForEvent(eventId).map((team) => ({ id: team.id, name: team.name }));
  const results: MatchResultInput[] = getMatchesForEvent(eventId)
    .filter((match) => match.status === "Completed")
    .map((match) => ({
      id: match.id,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
    }));

  return buildLeagueStandings(teams, results);
}

export function getBracketPreview(eventId: string) {
  const event = getStore().events.find((item) => item.id === eventId);

  if (!event) return [];

  const teamSeeds = getTeamsForEvent(eventId).map((team) => ({ id: team.id, name: team.name }));

  if (event.format === "Single Elimination") {
    return generateSingleEliminationBracket(teamSeeds, event.participantCap);
  }

  return generateRoundRobinSchedule(teamSeeds);
}

export function getCaptainById(userId: string | undefined) {
  if (!userId) return null;

  return getStore().users.find((user) => user.id === userId) ?? null;
}

export function getUserByEmail(email: string) {
  return getStore().users.find((user) => user.email === email) ?? null;
}

export function getCaptainTeams(userId: string | undefined) {
  if (!userId) return [];

  return getStore().teams.filter((team) => team.captainId === userId);
}

export function createEvent(input: {
  name: string;
  slug: string;
  gameModeId: string;
  format: Event["format"];
  participantCap: Event["participantCap"];
}) {
  const event: Event = {
    id: `event-${input.slug}`,
    slug: input.slug,
    name: input.name,
    description: "New event created from admin panel demo mode.",
    gameId: gameModes.find((mode) => mode.id === input.gameModeId)?.gameId ?? "game-kuroko",
    gameModeId: input.gameModeId,
    format: input.format,
    status: "Draft",
    participantCap: input.participantCap,
    registrationWindow: "TBD",
    startsAt: "TBD",
    venue: "Online",
  };

  getStore().events.unshift(event);
  return event;
}

export function registerTeam(input: {
  eventId: string;
  captainId: string;
  name: string;
  tag: string;
}) {
  const team: Team = {
    id: `team-${Date.now()}`,
    eventId: input.eventId,
    captainId: input.captainId,
    name: input.name,
    logoText: input.tag.slice(0, 2).toUpperCase(),
    tag: input.tag.toUpperCase(),
  };

  getStore().teams.push(team);
  return team;
}

export function addPlayer(input: {
  teamId: string;
  eventId: string;
  displayName: string;
  nickname: string;
  position: string;
}) {
  const player: Player = {
    id: `player-${Date.now()}`,
    teamId: input.teamId,
    eventId: input.eventId,
    displayName: input.displayName,
    nickname: input.nickname,
    position: input.position,
  };

  getStore().players.push(player);
  return player;
}

export function updateEventStream(eventId: string, url: string, label: string) {
  const event = getStore().events.find((item) => item.id === eventId);

  if (!event) return null;

  const stream = getLiveStreamPresentation(url);
  event.stream = {
    platform: stream.platform,
    url,
    label,
    enabled: true,
    isLive: true,
  };

  return event;
}
