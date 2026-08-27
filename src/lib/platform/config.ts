import type { AppUser, Game, GameMode } from "@/lib/platform/types";

export const appUsers: AppUser[] = [
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
];

export const games: Game[] = [
  {
    id: "game-kuroko",
    name: "Kuroko no Basket Street Rival",
    slug: "kuroko-street-rival",
    accent: "from-sky-500/30 to-cyan-500/10",
    defaultModeLabel: "3v3",
    fallbackLogoUrl: "https://lh3.googleusercontent.com/d/1nuG9zliyCINk1KXWNPYv_j9fmdQcWMXA",
    primaryStatKey: "points",
    certificateThemeId: "kuroko",
    artTheme: {
      bg: "linear-gradient(135deg, #0c1445 0%, #1e3a8a 50%, #1e40af 100%)",
      orb1: "rgba(96,165,250,0.18)",
      orb2: "rgba(147,197,253,0.10)",
      ring: "rgba(147,197,253,0.12)",
      label: "KNB",
    },
  },
  {
    id: "game-flashpeak",
    name: "Flashpeak",
    slug: "flashpeak",
    accent: "from-emerald-500/30 to-lime-500/10",
    defaultModeLabel: "5v5",
    fallbackLogoUrl: "https://lh3.googleusercontent.com/d/1m01dWpxKA6qXRzfFRrEovFzho1nTnV9B",
    defaultBackgroundUrl: "/game-backgrounds/flashpeak.svg",
    primaryStatKey: "goal",
    certificateThemeId: "flashpeak",
    artTheme: {
      bg: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)",
      orb1: "rgba(74,222,128,0.18)",
      orb2: "rgba(134,239,172,0.10)",
      ring: "rgba(134,239,172,0.12)",
      label: "FP",
    },
  },
  {
    id: "game-mobile-legends",
    name: "Mobile Legends",
    slug: "mobile-legends",
    accent: "from-blue-500/30 to-indigo-500/10",
    defaultModeLabel: "5v5",
    primaryStatKey: "kills",
    defaultBackgroundUrl: "/game-backgrounds/mobile-legends.svg",
    certificateThemeId: "mlbb",
    artTheme: {
      bg: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 50%, #312e81 100%)",
      orb1: "rgba(96,165,250,0.20)",
      orb2: "rgba(165,180,252,0.10)",
      ring: "rgba(191,219,254,0.18)",
      label: "ML",
    },
  },
  {
    id: "game-hok",
    name: "Honor of Kings",
    slug: "honor-of-kings",
    accent: "from-amber-500/30 to-orange-500/10",
    defaultModeLabel: "5v5",
    primaryStatKey: "kills",
    certificateThemeId: "hok",
    artTheme: {
      bg: "linear-gradient(135deg, #431407 0%, #9a3412 52%, #f59e0b 100%)",
      orb1: "rgba(251,191,36,0.20)",
      orb2: "rgba(253,186,116,0.12)",
      ring: "rgba(254,215,170,0.18)",
      label: "HOK",
    },
  },
  {
    id: "game-valorant",
    name: "Valorant",
    slug: "valorant",
    accent: "from-rose-500/30 to-red-500/10",
    defaultModeLabel: "5v5",
    primaryStatKey: "kills",
    certificateThemeId: "valorant",
    artTheme: {
      bg: "linear-gradient(135deg, #111827 0%, #991b1b 48%, #ef4444 100%)",
      orb1: "rgba(248,113,113,0.18)",
      orb2: "rgba(254,202,202,0.10)",
      ring: "rgba(254,205,211,0.16)",
      label: "VLR",
    },
  },
  {
    id: "game-dota2",
    name: "DOTA 2",
    slug: "dota-2",
    accent: "from-red-700/30 to-stone-500/10",
    defaultModeLabel: "5v5",
    primaryStatKey: "kills",
    certificateThemeId: "dota2",
    artTheme: {
      bg: "linear-gradient(135deg, #1c1917 0%, #7f1d1d 55%, #b91c1c 100%)",
      orb1: "rgba(248,113,113,0.18)",
      orb2: "rgba(254,226,226,0.08)",
      ring: "rgba(252,165,165,0.15)",
      label: "D2",
    },
  },
];

export const gameModes: GameMode[] = [
  {
    id: "mode-kuroko-3v3",
    gameId: "game-kuroko",
    name: "3v3",
    slug: "kuroko-3v3",
    defaultModeLabel: "3v3",
    teamSize: 3,
    maxRosterSize: 5,
    positions: ["Guard", "Forward", "Center"],
    statKeys: ["points", "assists", "rebounds", "steals", "blocks", "flb"],
  },
  {
    id: "mode-flashpeak-5v5",
    gameId: "game-flashpeak",
    name: "5v5",
    slug: "flashpeak-5v5",
    defaultModeLabel: "5v5",
    teamSize: 5,
    maxRosterSize: 8,
    positions: ["Forward", "Midfielder", "Defender", "Goalkeeper"],
    statKeys: ["goal", "assist", "passing", "defense"],
  },
  {
    id: "mode-mlbb-5v5",
    gameId: "game-mobile-legends",
    name: "5v5",
    slug: "mlbb-5v5",
    defaultModeLabel: "5v5",
    teamSize: 5,
    maxRosterSize: 7,
    positions: ["EXP Lane", "Jungler", "Mid Lane", "Gold Lane", "Roamer"],
    statKeys: ["kills", "assists", "deaths", "gold", "damage"],
  },
  {
    id: "mode-hok-5v5",
    gameId: "game-hok",
    name: "5v5",
    slug: "hok-5v5",
    defaultModeLabel: "5v5",
    teamSize: 5,
    maxRosterSize: 7,
    positions: ["Clash Lane", "Jungler", "Mid Lane", "Farm Lane", "Roamer"],
    statKeys: ["kills", "assists", "deaths", "gold", "damage"],
  },
  {
    id: "mode-valorant-5v5",
    gameId: "game-valorant",
    name: "5v5",
    slug: "valorant-5v5",
    defaultModeLabel: "5v5",
    teamSize: 5,
    maxRosterSize: 7,
    positions: ["Duelist", "Initiator", "Controller", "Sentinel", "Flex"],
    statKeys: ["kills", "assists", "deaths", "plants", "defuses"],
  },
  {
    id: "mode-dota2-5v5",
    gameId: "game-dota2",
    name: "5v5",
    slug: "dota2-5v5",
    defaultModeLabel: "5v5",
    teamSize: 5,
    maxRosterSize: 7,
    positions: ["Carry", "Mid", "Offlane", "Soft Support", "Hard Support"],
    statKeys: ["kills", "assists", "deaths", "gpm", "xpm"],
  },
];

const gamesById = new Map(games.map((game) => [game.id, game]));
const gameModesById = new Map(gameModes.map((mode) => [mode.id, mode]));

const genericGameArtTheme = {
  bg: "linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #334155 100%)",
  orb1: "rgba(148,163,184,0.18)",
  orb2: "rgba(203,213,225,0.10)",
  ring: "rgba(203,213,225,0.12)",
  label: "EV",
} as const;

export function findGameConfig(gameId: string) {
  return gamesById.get(gameId);
}

export function findGameModeConfig(modeId: string) {
  return gameModesById.get(modeId);
}

export function getGameConfig(gameId: string) {
  const game = findGameConfig(gameId);
  if (!game) {
    throw new Error(`Unknown game config: ${gameId}`);
  }
  return game;
}

export function getGameModeConfig(modeId: string) {
  const mode = findGameModeConfig(modeId);
  if (!mode) {
    throw new Error(`Unknown game mode config: ${modeId}`);
  }
  return mode;
}

export function getGameIdForMode(modeId: string) {
  return getGameModeConfig(modeId).gameId;
}

export function getGamePrimaryStatKey(gameId: string) {
  return getGameConfig(gameId).primaryStatKey ?? "points";
}

export function getFallbackLogoUrl(gameId: string) {
  return findGameConfig(gameId)?.fallbackLogoUrl ?? "";
}

export function getDefaultGameBackgroundUrl(gameId: string) {
  return findGameConfig(gameId)?.defaultBackgroundUrl ?? "";
}

export function getGameArtTheme(gameId: string) {
  return findGameConfig(gameId)?.artTheme ?? genericGameArtTheme;
}

export function getGameCertificateThemeId(gameId: string) {
  return getGameConfig(gameId).certificateThemeId ?? "kuroko";
}

export function getDefaultModeLabel(modeId: string, gameId?: string) {
  const mode = findGameModeConfig(modeId);
  if (mode) {
    return mode.defaultModeLabel ?? `${mode.teamSize}v${mode.teamSize}`;
  }

  const game = gameId ? findGameConfig(gameId) : undefined;
  if (game?.defaultModeLabel) {
    return game.defaultModeLabel;
  }

  return "Event";
}

export function getGameModeDisplayLabel(modeId: string) {
  const mode = getGameModeConfig(modeId);
  const game = getGameConfig(mode.gameId);
  return `${game.name} - ${mode.defaultModeLabel ?? `${mode.teamSize}v${mode.teamSize}`}`;
}

export function getStatKeysForMode(modeId: string, gameId?: string) {
  const mode = findGameModeConfig(modeId);
  if (mode) {
    return mode.statKeys;
  }

  const game = gameId ? findGameConfig(gameId) : undefined;
  const fallbackMode = game ? gameModes.find((candidate) => candidate.gameId === game.id) : undefined;
  return fallbackMode?.statKeys ?? [];
}

export function getOrderedStatEntries(
  stats: Record<string, number>,
  modeId: string,
  gameId?: string,
): Array<[string, number]> {
  const preferredKeys = getStatKeysForMode(modeId, gameId);
  const preferredKeySet = new Set(preferredKeys);
  const preferredEntries = preferredKeys
    .filter((key) => typeof stats[key] === "number")
    .map((key) => [key, stats[key]!] as [string, number]);
  const remainingEntries = Object.entries(stats).filter(([key]) => !preferredKeySet.has(key));

  return [...preferredEntries, ...remainingEntries];
}
