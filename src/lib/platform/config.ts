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
    role: "admin",
  },
];

export const games: Game[] = [
  {
    id: "game-kuroko",
    name: "Kuroko no Basket Street Rival",
    slug: "kuroko-street-rival",
    accent: "from-sky-500/30 to-cyan-500/10",
  },
  {
    id: "game-flashpeak",
    name: "Flashpeak",
    slug: "flashpeak",
    accent: "from-emerald-500/30 to-lime-500/10",
  },
];

export const gameModes: GameMode[] = [
  {
    id: "mode-kuroko-3v3",
    gameId: "game-kuroko",
    name: "3v3 Street Cup",
    slug: "kuroko-3v3",
    teamSize: 3,
    maxRosterSize: 5,
    positions: ["Guard", "Forward", "Center"],
    statKeys: ["points", "assists", "rebounds", "steals", "blocks", "flb"],
  },
  {
    id: "mode-flashpeak-5v5",
    gameId: "game-flashpeak",
    name: "5v5 League",
    slug: "flashpeak-5v5",
    teamSize: 5,
    maxRosterSize: 8,
    positions: ["Forward", "Midfielder", "Defender", "Goalkeeper"],
    statKeys: ["goals", "assists", "tackles", "blocks"],
  },
];
