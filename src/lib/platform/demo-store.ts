import {
  gameModes,
  games,
  getFallbackLogoUrl,
  getGameConfig,
  getGameIdForMode,
  getGameModeConfig,
  getGamePrimaryStatKey,
} from "@/lib/platform/config";
import type { AppUser, Event, Match, Player, Team } from "@/lib/platform/types";
import {
  aggregatePlayerLeaderboard,
  buildLeagueStandings,
  generateRoundRobinSchedule,
  generateSingleEliminationBracket,
  getPublicVisibleSingleEliminationBracket,
  getLiveStreamPresentation,
  projectSingleEliminationBracket,
} from "@/lib/tournament/engine";
import type { BracketMatch, MatchResultInput, PlayerMatchStatInput } from "@/lib/tournament/types";

type DemoState = {
  users: AppUser[];
  events: Event[];
  teams: Team[];
  players: Player[];
  matches: Match[];
  playerStats: PlayerMatchStatInput[];
};

const PUBLIC_EVENT_STATUSES = new Set<Event["status"]>(["Published", "Registration Closed", "Ongoing", "Finished"]);

function buildDemoTeams(eventId: string, names: string[]): Team[] {
  return names.map((name, index) => {
    const tag = name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 3)
      .toUpperCase();

    return {
      id: `team-${eventId.replace(/^event-/, "")}-${index + 1}`,
      eventId,
      captainId: "captain-seirin",
      name,
      logoText: tag.slice(0, 2),
      tag,
      source: "demo",
    };
  });
}

function buildDemoPlayers(eventId: string, teams: Team[], positions: string[]): Player[] {
  return teams.map((team, index) => ({
    id: `player-${team.id.replace(/^team-/, "")}`,
    teamId: team.id,
    eventId,
    displayName: `${team.name} Ace`,
    nickname: team.tag,
    position: positions[index % positions.length],
    jerseyNumber: index + 1,
  }));
}

const flashpeakFinishedTeams = buildDemoTeams("event-flashpeak-champions-32", [
  "Summit Strikers",
  "Miracle Five",
  "Northwind FC",
  "Pulse United",
  "Velvet Rangers",
  "Cinder Squad",
  "Orbit Kings",
  "Harbor Wolves",
]);
const flashpeakOngoingTeams = buildDemoTeams("event-flashpeak-rising-64", [
  "Rising Comets",
  "Thunder Street",
  "Vortex FC",
  "Scorch United",
  "Blitz Yard",
  "Cobalt Eleven",
  "Solaris Crew",
  "Metro Lions",
]);
const mlbbFinishedTeams = buildDemoTeams("event-mlbb-dawn-finals-16", [
  "Dawn Breakers",
  "Royal Turtle",
  "Midnight Retribution",
  "Gold Lane Union",
  "Crimson Minions",
  "Lord Hunters",
  "Abyss Roamers",
  "Base Invaders",
]);
const mlbbOngoingTeams = buildDemoTeams("event-mlbb-rank-war-32", [
  "Rank Warriors",
  "Savage Five",
  "Blue Buff Club",
  "Mythic Guard",
  "River Ambush",
  "Turret Breakers",
  "Jungle Tempo",
  "Lane Kings",
]);

const organizerDemoTeams = [
  ...flashpeakFinishedTeams,
  ...flashpeakOngoingTeams,
  ...mlbbFinishedTeams,
  ...mlbbOngoingTeams,
];

const organizerDemoPlayers = [
  ...buildDemoPlayers("event-flashpeak-champions-32", flashpeakFinishedTeams, ["Forward", "Midfielder", "Defender", "Goalkeeper"]),
  ...buildDemoPlayers("event-flashpeak-rising-64", flashpeakOngoingTeams, ["Forward", "Midfielder", "Defender", "Goalkeeper"]),
  ...buildDemoPlayers("event-mlbb-dawn-finals-16", mlbbFinishedTeams, ["EXP Lane", "Jungler", "Mid Lane", "Gold Lane", "Roamer"]),
  ...buildDemoPlayers("event-mlbb-rank-war-32", mlbbOngoingTeams, ["EXP Lane", "Jungler", "Mid Lane", "Gold Lane", "Roamer"]),
];

const organizerDemoMatches: Match[] = [
  { id: "match-flash-f-1", eventId: "event-flashpeak-champions-32", roundLabel: "Quarterfinal", homeTeamId: flashpeakFinishedTeams[0].id, awayTeamId: flashpeakFinishedTeams[1].id, homeScore: 3, awayScore: 1, status: "Completed", round: 1, slot: 1, winnerTeamId: flashpeakFinishedTeams[0].id },
  { id: "match-flash-f-2", eventId: "event-flashpeak-champions-32", roundLabel: "Quarterfinal", homeTeamId: flashpeakFinishedTeams[2].id, awayTeamId: flashpeakFinishedTeams[3].id, homeScore: 2, awayScore: 0, status: "Completed", round: 1, slot: 2, winnerTeamId: flashpeakFinishedTeams[2].id },
  { id: "match-flash-f-3", eventId: "event-flashpeak-champions-32", roundLabel: "Quarterfinal", homeTeamId: flashpeakFinishedTeams[4].id, awayTeamId: flashpeakFinishedTeams[5].id, homeScore: 1, awayScore: 2, status: "Completed", round: 1, slot: 3, winnerTeamId: flashpeakFinishedTeams[5].id },
  { id: "match-flash-f-4", eventId: "event-flashpeak-champions-32", roundLabel: "Quarterfinal", homeTeamId: flashpeakFinishedTeams[6].id, awayTeamId: flashpeakFinishedTeams[7].id, homeScore: 4, awayScore: 2, status: "Completed", round: 1, slot: 4, winnerTeamId: flashpeakFinishedTeams[6].id },
  { id: "match-flash-f-5", eventId: "event-flashpeak-champions-32", roundLabel: "Semifinal", homeTeamId: flashpeakFinishedTeams[0].id, awayTeamId: flashpeakFinishedTeams[2].id, homeScore: 2, awayScore: 1, status: "Completed", round: 2, slot: 1, winnerTeamId: flashpeakFinishedTeams[0].id },
  { id: "match-flash-f-6", eventId: "event-flashpeak-champions-32", roundLabel: "Semifinal", homeTeamId: flashpeakFinishedTeams[5].id, awayTeamId: flashpeakFinishedTeams[6].id, homeScore: 1, awayScore: 3, status: "Completed", round: 2, slot: 2, winnerTeamId: flashpeakFinishedTeams[6].id },
  { id: "match-flash-f-7", eventId: "event-flashpeak-champions-32", roundLabel: "Final", homeTeamId: flashpeakFinishedTeams[0].id, awayTeamId: flashpeakFinishedTeams[6].id, homeScore: 3, awayScore: 2, status: "Completed", round: 3, slot: 1, winnerTeamId: flashpeakFinishedTeams[0].id },
  { id: "match-flash-o-1", eventId: "event-flashpeak-rising-64", roundLabel: "Round 1", homeTeamId: flashpeakOngoingTeams[0].id, awayTeamId: flashpeakOngoingTeams[1].id, homeScore: 2, awayScore: 1, status: "Completed", round: 1, slot: 1, winnerTeamId: flashpeakOngoingTeams[0].id },
  { id: "match-flash-o-2", eventId: "event-flashpeak-rising-64", roundLabel: "Round 1", homeTeamId: flashpeakOngoingTeams[2].id, awayTeamId: flashpeakOngoingTeams[3].id, homeScore: 0, awayScore: 2, status: "Completed", round: 1, slot: 2, winnerTeamId: flashpeakOngoingTeams[3].id },
  { id: "match-flash-o-3", eventId: "event-flashpeak-rising-64", roundLabel: "Round 1", homeTeamId: flashpeakOngoingTeams[4].id, awayTeamId: flashpeakOngoingTeams[5].id, homeScore: 0, awayScore: 0, status: "Scheduled", round: 1, slot: 3, winnerTeamId: null, scheduledLabel: "Tonight 20:00 WIB" },
  { id: "match-flash-o-4", eventId: "event-flashpeak-rising-64", roundLabel: "Round 1", homeTeamId: flashpeakOngoingTeams[6].id, awayTeamId: flashpeakOngoingTeams[7].id, homeScore: 0, awayScore: 0, status: "Scheduled", round: 1, slot: 4, winnerTeamId: null, scheduledLabel: "Tonight 21:00 WIB" },
  { id: "match-mlbb-f-1", eventId: "event-mlbb-dawn-finals-16", roundLabel: "Quarterfinal", homeTeamId: mlbbFinishedTeams[0].id, awayTeamId: mlbbFinishedTeams[1].id, homeScore: 2, awayScore: 0, status: "Completed", round: 1, slot: 1, winnerTeamId: mlbbFinishedTeams[0].id },
  { id: "match-mlbb-f-2", eventId: "event-mlbb-dawn-finals-16", roundLabel: "Quarterfinal", homeTeamId: mlbbFinishedTeams[2].id, awayTeamId: mlbbFinishedTeams[3].id, homeScore: 2, awayScore: 1, status: "Completed", round: 1, slot: 2, winnerTeamId: mlbbFinishedTeams[2].id },
  { id: "match-mlbb-f-3", eventId: "event-mlbb-dawn-finals-16", roundLabel: "Quarterfinal", homeTeamId: mlbbFinishedTeams[4].id, awayTeamId: mlbbFinishedTeams[5].id, homeScore: 1, awayScore: 2, status: "Completed", round: 1, slot: 3, winnerTeamId: mlbbFinishedTeams[5].id },
  { id: "match-mlbb-f-4", eventId: "event-mlbb-dawn-finals-16", roundLabel: "Quarterfinal", homeTeamId: mlbbFinishedTeams[6].id, awayTeamId: mlbbFinishedTeams[7].id, homeScore: 0, awayScore: 2, status: "Completed", round: 1, slot: 4, winnerTeamId: mlbbFinishedTeams[7].id },
  { id: "match-mlbb-f-5", eventId: "event-mlbb-dawn-finals-16", roundLabel: "Semifinal", homeTeamId: mlbbFinishedTeams[0].id, awayTeamId: mlbbFinishedTeams[2].id, homeScore: 2, awayScore: 1, status: "Completed", round: 2, slot: 1, winnerTeamId: mlbbFinishedTeams[0].id },
  { id: "match-mlbb-f-6", eventId: "event-mlbb-dawn-finals-16", roundLabel: "Semifinal", homeTeamId: mlbbFinishedTeams[5].id, awayTeamId: mlbbFinishedTeams[7].id, homeScore: 1, awayScore: 2, status: "Completed", round: 2, slot: 2, winnerTeamId: mlbbFinishedTeams[7].id },
  { id: "match-mlbb-f-7", eventId: "event-mlbb-dawn-finals-16", roundLabel: "Final", homeTeamId: mlbbFinishedTeams[0].id, awayTeamId: mlbbFinishedTeams[7].id, homeScore: 3, awayScore: 2, status: "Completed", round: 3, slot: 1, winnerTeamId: mlbbFinishedTeams[0].id },
  { id: "match-mlbb-o-1", eventId: "event-mlbb-rank-war-32", roundLabel: "Round 1", homeTeamId: mlbbOngoingTeams[0].id, awayTeamId: mlbbOngoingTeams[1].id, homeScore: 2, awayScore: 1, status: "Completed", round: 1, slot: 1, winnerTeamId: mlbbOngoingTeams[0].id },
  { id: "match-mlbb-o-2", eventId: "event-mlbb-rank-war-32", roundLabel: "Round 1", homeTeamId: mlbbOngoingTeams[2].id, awayTeamId: mlbbOngoingTeams[3].id, homeScore: 1, awayScore: 2, status: "Completed", round: 1, slot: 2, winnerTeamId: mlbbOngoingTeams[3].id },
  { id: "match-mlbb-o-3", eventId: "event-mlbb-rank-war-32", roundLabel: "Round 1", homeTeamId: mlbbOngoingTeams[4].id, awayTeamId: mlbbOngoingTeams[5].id, homeScore: 0, awayScore: 0, status: "Scheduled", round: 1, slot: 3, winnerTeamId: null, scheduledLabel: "Tonight 19:30 WIB" },
  { id: "match-mlbb-o-4", eventId: "event-mlbb-rank-war-32", roundLabel: "Round 1", homeTeamId: mlbbOngoingTeams[6].id, awayTeamId: mlbbOngoingTeams[7].id, homeScore: 0, awayScore: 0, status: "Scheduled", round: 1, slot: 4, winnerTeamId: null, scheduledLabel: "Tonight 20:30 WIB" },
];

const organizerDemoPlayerStats: PlayerMatchStatInput[] = organizerDemoMatches
  .filter((match) => match.status === "Completed")
  .flatMap((match) => {
    const players = organizerDemoPlayers.filter((player) => player.teamId === match.homeTeamId || player.teamId === match.awayTeamId);
    const isMlbb = match.eventId.includes("mlbb");

    return players.map((player, index) => {
      const stats: Record<string, number> = isMlbb
        ? { kills: player.teamId === match.winnerTeamId ? 9 + index : 4 + index, assists: 6 + index, deaths: player.teamId === match.winnerTeamId ? 2 : 5, gold: 12000 + index * 700, damage: 28000 + index * 3000 }
        : { goals: player.teamId === match.winnerTeamId ? 2 + index : index, assists: 1 + index, tackles: 3 + index, blocks: index };

      return {
        matchId: match.id,
        playerId: player.id,
        playerName: player.displayName,
        teamId: player.teamId,
        position: player.position,
        gameSlug: isMlbb ? "mobile-legends" : "flashpeak",
        stats,
      };
    });
  });

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
      role: "platform_admin",
    },
    {
      id: "organizer-flashpeak",
      email: "organizer-a@miraclefc.gg",
      name: "Flashpeak Organizer",
      role: "organizer",
    },
    {
      id: "organizer-mlbb",
      email: "organizer-b@miraclefc.gg",
      name: "Mobile Legends Organizer",
      role: "organizer",
    },
  ],
  events: [
    {
      id: "event-flashpeak-champions-32",
      slug: "flashpeak-champions-32",
      name: "Flashpeak Champions 32",
      description:
        "Finished 5v5 Flashpeak showcase for testing organizer-owned completed events, result states, and public finished cards.",
      gameId: "game-flashpeak",
      gameModeId: "mode-flashpeak-5v5",
      format: "Single Elimination",
      status: "Finished",
      participantCap: 32,
      registrationWindow: "June 1, 2026 - June 20, 2026",
      startsAt: "June 28, 2026",
      venue: "Flashpeak Arena",
      organizerUserId: "organizer-flashpeak",
      organizerName: "Flashpeak Organizer",
      organizerVerified: true,
      prizePoolLabel: "Rp2.000.000 + Champion Proof",
      registrationFeeLabel: "Gratis",
    },
    {
      id: "event-flashpeak-rising-64",
      slug: "flashpeak-rising-64",
      name: "Flashpeak Rising 64",
      description:
        "Ongoing large-cap Flashpeak event for testing organizer dashboard isolation, live status, and scalable event cards.",
      gameId: "game-flashpeak",
      gameModeId: "mode-flashpeak-5v5",
      format: "Single Elimination",
      status: "Ongoing",
      participantCap: 64,
      registrationWindow: "August 1, 2026 - August 9, 2026",
      startsAt: "August 12, 2026",
      venue: "Flashpeak Match Hub",
      organizerUserId: "organizer-flashpeak",
      organizerName: "Flashpeak Organizer",
      organizerVerified: true,
      prizePoolLabel: "Rp5.000.000",
      registrationFeeLabel: "Rp25.000 / team",
      stream: {
        platform: "youtube",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        label: "Flashpeak Rising Live",
        enabled: true,
        isLive: true,
      },
    },
    {
      id: "event-mlbb-dawn-finals-16",
      slug: "mlbb-dawn-finals-16",
      name: "MLBB Dawn Finals 16",
      description:
        "Finished Mobile Legends bracket for testing organizer-owned completed events with a smaller 16-team cap.",
      gameId: "game-mobile-legends",
      gameModeId: "mode-mlbb-5v5",
      format: "Single Elimination",
      status: "Finished",
      participantCap: 16,
      registrationWindow: "May 5, 2026 - May 18, 2026",
      startsAt: "May 25, 2026",
      venue: "Land of Dawn Online",
      organizerUserId: "organizer-mlbb",
      organizerName: "Mobile Legends Organizer",
      organizerVerified: false,
      prizePoolLabel: "Rp1.500.000",
      registrationFeeLabel: "Gratis",
    },
    {
      id: "event-mlbb-rank-war-32",
      slug: "mlbb-rank-war-32",
      name: "MLBB Rank War 32",
      description:
        "Ongoing Mobile Legends event for testing organizer-specific dashboard views and public live tournament discovery.",
      gameId: "game-mobile-legends",
      gameModeId: "mode-mlbb-5v5",
      format: "Single Elimination",
      status: "Ongoing",
      participantCap: 32,
      registrationWindow: "August 3, 2026 - August 11, 2026",
      startsAt: "August 12, 2026",
      venue: "Land of Dawn Online",
      organizerUserId: "organizer-mlbb",
      organizerName: "Mobile Legends Organizer",
      organizerVerified: false,
      prizePoolLabel: "Rp3.000.000",
      registrationFeeLabel: "Rp20.000 / team",
    },
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
      organizerUserId: "admin-commish",
      organizerName: "Miracle League Ops",
      organizerVerified: true,
      prizePoolLabel: "Champion Certificate",
      registrationFeeLabel: "Gratis",
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
      organizerUserId: "admin-commish",
      organizerName: "Miracle League Ops",
      organizerVerified: true,
      prizePoolLabel: "Leaderboard Showcase",
      registrationFeeLabel: "Gratis",
    },
  ],
  teams: [
    { id: "team-seirin", eventId: "event-kuroko-summer", captainId: "captain-seirin", name: "Seirin", logoText: "SR", tag: "SER", source: "demo" },
    { id: "team-kaijo", eventId: "event-kuroko-summer", captainId: "captain-seirin", name: "Kaijo", logoText: "KJ", tag: "KAI", source: "demo" },
    { id: "team-rakuzan", eventId: "event-kuroko-summer", captainId: "captain-seirin", name: "Rakuzan", logoText: "RZ", tag: "RAK", source: "demo" },
    { id: "team-shutoku", eventId: "event-kuroko-summer", captainId: "captain-seirin", name: "Shutoku", logoText: "ST", tag: "SHU", source: "demo" },
    { id: "team-miracle", eventId: "event-flashpeak-open", captainId: "captain-seirin", name: "Miracle Five", logoText: "M5", tag: "MFC", source: "demo" },
    { id: "team-thunder", eventId: "event-flashpeak-open", captainId: "captain-seirin", name: "Thunder Street", logoText: "TS", tag: "THS", source: "demo" },
    { id: "team-vortex", eventId: "event-flashpeak-open", captainId: "captain-seirin", name: "Vortex", logoText: "VX", tag: "VTX", source: "demo" },
    { id: "team-scorch", eventId: "event-flashpeak-open", captainId: "captain-seirin", name: "Scorch FC", logoText: "SC", tag: "SCR", source: "demo" },
    ...organizerDemoTeams,
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
    ...organizerDemoPlayers,
  ],
  matches: [
    { id: "match-kuroko-1", eventId: "event-kuroko-summer", roundLabel: "Quarterfinal", homeTeamId: "team-seirin", awayTeamId: "team-kaijo", homeScore: 21, awayScore: 16, status: "Completed", round: 2, slot: 1, winnerTeamId: "team-seirin" },
    { id: "match-kuroko-2", eventId: "event-kuroko-summer", roundLabel: "Quarterfinal", homeTeamId: "team-rakuzan", awayTeamId: "team-shutoku", homeScore: 18, awayScore: 20, status: "Completed", round: 2, slot: 2, winnerTeamId: "team-shutoku" },
    { id: "match-flash-1", eventId: "event-flashpeak-open", roundLabel: "Matchday 1", homeTeamId: "team-miracle", awayTeamId: "team-thunder", homeScore: 4, awayScore: 2, status: "Completed" },
    { id: "match-flash-2", eventId: "event-flashpeak-open", roundLabel: "Matchday 1", homeTeamId: "team-vortex", awayTeamId: "team-scorch", homeScore: 1, awayScore: 1, status: "Completed" },
    ...organizerDemoMatches,
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
    ...organizerDemoPlayerStats,
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

export function resetDemoStore() {
  globalStore.__mflStore = cloneState(initialState);
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

export function getPublicEvents() {
  return getStore().events.filter((event) => PUBLIC_EVENT_STATUSES.has(event.status));
}

export function getEventBySlug(slug: string) {
  return getStore().events.find((event) => event.slug === slug);
}

export function getPublicEventBySlug(slug: string) {
  return getStore().events.find((event) => event.slug === slug && PUBLIC_EVENT_STATUSES.has(event.status));
}

export function getGameForEvent(event: Event) {
  return getGameConfig(event.gameId);
}

export function getModeForEvent(event: Event) {
  return getGameModeConfig(event.gameModeId);
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

export function isEventBracketLocked(eventId: string) {
  const event = getStore().events.find((item) => item.id === eventId);
  if (!event || event.format !== "Single Elimination") return false;

  return getMatchesForEvent(eventId).some((match) => match.status === "Completed");
}

function getBracketRoundLabel(round: number, totalRounds: number) {
  const roundsRemaining = totalRounds - round + 1;

  if (roundsRemaining === 1) return "Final";
  if (roundsRemaining === 2) return "Semifinal";
  if (roundsRemaining === 3) return "Quarterfinal";
  if (roundsRemaining === 4) return "Round of 16";

  return `Round ${round}`;
}

function matchesProjectedPairing(
  match: Pick<Match, "homeTeamId" | "awayTeamId">,
  projected: Pick<BracketMatch, "homeTeamId" | "awayTeamId">,
) {
  return match.homeTeamId === projected.homeTeamId && match.awayTeamId === projected.awayTeamId;
}

function getProjectedBracketMatches(event: Event): Match[] {
  const teamSeeds = getTeamsForEvent(event.id).map((team) => ({ id: team.id, name: team.name }));
  const bracket = projectSingleEliminationBracket({
    teams: teamSeeds,
    slotCount: event.participantCap,
    results: getMatchesForEvent(event.id),
  }) as BracketMatch[];
  const existingById = new Map(getMatchesForEvent(event.id).map((match) => [match.id, match]));
  const totalRounds = Math.max(...bracket.map((match) => match.round), 1);

  return bracket
    .filter((match) => Boolean(match.homeTeamId && match.awayTeamId))
    .map((match) => {
      const existing = existingById.get(match.id);
      const alignedExisting = existing && matchesProjectedPairing(existing, match) ? existing : null;

      return {
        id: match.id,
        eventId: event.id,
        roundLabel: getBracketRoundLabel(match.round, totalRounds),
        homeTeamId: match.homeTeamId!,
        awayTeamId: match.awayTeamId!,
        homeScore: alignedExisting?.homeScore ?? 0,
        awayScore: alignedExisting?.awayScore ?? 0,
        status: alignedExisting?.status ?? "Scheduled",
        round: match.round,
        slot: match.slot,
        winnerTeamId: alignedExisting?.winnerTeamId ?? null,
      } satisfies Match;
    })
    .sort((left, right) => (left.round! - right.round!) || (left.slot! - right.slot!));
}

export function getBracketManageableMatches(eventId: string) {
  const event = getStore().events.find((item) => item.id === eventId);
  if (!event) return [];

  if (event.format === "Single Elimination") {
    return getProjectedBracketMatches(event);
  }

  return getMatchesForEvent(eventId)
    .filter((match) => match.round != null && match.slot != null)
    .sort((left, right) => (left.round! - right.round!) || (left.slot! - right.slot!));
}

export function setMatchResult(input: {
  eventId: string;
  matchId: string;
  homeScore: number;
  awayScore: number;
}) {
  const store = getStore();
  const event = store.events.find((item) => item.id === input.eventId);
  let match = store.matches.find(
    (item) => item.id === input.matchId && item.eventId === input.eventId,
  );

  if (!event) return null;
  if (event.format === "Single Elimination" && input.homeScore === input.awayScore) {
    throw new Error("Single elimination matches cannot end in a draw.");
  }

  if (!match && event.format === "Single Elimination") {
    const projectedMatch = getProjectedBracketMatches(event).find((item) => item.id === input.matchId);
    if (!projectedMatch) return null;

    match = { ...projectedMatch };
    store.matches.push(match);
  }

  if (!match) return null;

  match.homeScore = input.homeScore;
  match.awayScore = input.awayScore;
  match.status = "Completed";
  match.winnerTeamId =
    input.homeScore > input.awayScore ? match.homeTeamId : match.awayTeamId;

  return match;
}


export function getLeaderboardForEvent(eventId: string) {
  const event = getStore().events.find((item) => item.id === eventId);

  if (!event) return [];

  const game = getGameForEvent(event);
  const metric = getGamePrimaryStatKey(game.id);
  const playerIds = new Set(getPlayersForEvent(eventId).map((player) => player.id));

  return aggregatePlayerLeaderboard(
    getStore().playerStats.filter((stat) => stat.gameSlug === game.slug && playerIds.has(stat.playerId)),
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
    return projectSingleEliminationBracket({
      teams: teamSeeds,
      slotCount: event.participantCap,
      results: getMatchesForEvent(eventId),
    });
  }

  return generateRoundRobinSchedule(teamSeeds);
}

export function getPublicVisibleBracketPreview(eventId: string): ReturnType<typeof getBracketPreview> {
  const event = getStore().events.find((item) => item.id === eventId);
  if (!event || event.format !== "Single Elimination") return getBracketPreview(eventId);

  const teamSeeds = getTeamsForEvent(eventId).map((team) => ({ id: team.id, name: team.name }));

  return getPublicVisibleSingleEliminationBracket({
    teams: teamSeeds,
    slotCount: event.participantCap,
    results: getMatchesForEvent(eventId),
  });
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

export function getImportSnapshot() {
  const store = getStore();

  return {
    events: store.events.map((event) => ({
      id: event.id,
      slug: event.slug,
      participantCap: event.participantCap,
      bracketLocked: isEventBracketLocked(event.id),
    })),
    teams: store.teams.map((team) => ({ eventId: team.eventId, name: team.name, tag: team.tag })),
  };
}

export function getImportedTeams() {
  return getStore().teams.filter((team) => team.source === "csv-import");
}

export function createEvent(input: {
  name: string;
  slug: string;
  gameModeId: string;
  format: Event["format"];
  participantCap: Event["participantCap"];
  organizerUserId?: string;
  organizerName?: string;
  organizerVerified?: boolean;
}) {
  const event: Event = {
    id: `event-${input.slug}`,
    slug: input.slug,
    name: input.name,
    description: "New event created from admin panel demo mode.",
    gameId: getGameIdForMode(input.gameModeId),
    gameModeId: input.gameModeId,
    format: input.format,
    status: "Draft",
    participantCap: input.participantCap,
    registrationWindow: "TBD",
    startsAt: "TBD",
    venue: "Online",
    organizerUserId: input.organizerUserId,
    organizerName: input.organizerName,
    organizerVerified: input.organizerVerified ?? false,
  };

  getStore().events.unshift(event);
  event.logoUrl = getFallbackLogoUrl(event.gameId) || undefined;
  return event;
}

export function setEventStatus(eventId: string, status: Event["status"]) {
  const event = getStore().events.find((item) => item.id === eventId);

  if (!event) return null;

  event.status = status;
  return event;
}

export function registerTeam(input: {
  eventId: string;
  captainId: string;
  name: string;
  tag: string;
}) {
  const event = getStore().events.find((item) => item.id === input.eventId);

  if (event && isEventBracketLocked(input.eventId)) {
    throw new Error(
      `Event "${event.slug}" already has recorded match results, so additional teams cannot be registered.`,
    );
  }

  const team: Team = {
    id: `team-${Date.now()}`,
    eventId: input.eventId,
    captainId: input.captainId,
    name: input.name,
    logoText: input.tag.slice(0, 2).toUpperCase(),
    tag: input.tag.toUpperCase(),
    source: "demo",
  };

  getStore().teams.push(team);
  return team;
}

export function importTeams(input: Array<{
  eventId: string;
  teamName: string;
  teamTag: string;
  captainName: string;
  captainContact: string;
}>) {
  input.forEach((row) => {
    const event = getStore().events.find((item) => item.id === row.eventId);

    if (event && isEventBracketLocked(row.eventId)) {
      throw new Error(
        `Event "${event.slug}" already has recorded match results, so additional teams cannot be imported.`,
      );
    }
  });

  const createdTeams: Team[] = [];

  input.forEach((row, index) => {
    const team: Team = {
      id: `team-import-${Date.now()}-${index}`,
      eventId: row.eventId,
      captainId: `imported-${row.eventId}-${row.teamTag.toLowerCase()}`,
      name: row.teamName,
      logoText: row.teamTag.slice(0, 2).toUpperCase(),
      tag: row.teamTag.toUpperCase(),
      captainName: row.captainName,
      captainContact: row.captainContact,
      source: "csv-import",
    };

    getStore().teams.push(team);
    createdTeams.push(team);
  });

  return createdTeams;
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
