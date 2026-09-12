import type { PlayerLeaderboardEntry } from "@/lib/tournament/types";

/** Games whose position labels map onto the roster art pools below. */
const MVP_ELIGIBLE_GAME_ID = "game-flashpeak";

const ROLE_CHARACTER_POOL: Record<string, string[]> = {
  defender: ["Ford.png", "Andrew.png"],
  midfielder: ["Kelly.png", "Homer.png", "Hayato.png"],
  striker: ["Orion.png", "Shirou.png", "Rafael.png"],
  goalkeeper: ["maxim.jpg"],
};

function normalizePositionToRole(position: string): keyof typeof ROLE_CHARACTER_POOL | null {
  const key = position.trim().toLowerCase();
  if (key === "defender") return "defender";
  if (key === "midfielder") return "midfielder";
  if (key === "forward" || key === "striker") return "striker";
  if (key === "goalkeeper") return "goalkeeper";
  return null;
}

function xorshift32(seed: number) {
  let x = seed || 1;
  return () => {
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

function seedFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h) || 1;
}

/** Deterministically picks one character asset for a position, stable per seed (e.g. playerId). */
export function pickMvpCharacterArt(position: string, seed: string): string | null {
  const role = normalizePositionToRole(position);
  if (!role) return null;

  const pool = ROLE_CHARACTER_POOL[role];
  const index = Math.floor(xorshift32(seedFromString(seed))() * pool.length);
  const filename = pool[index];

  return `/character-art/roster/${role}/${filename}`;
}

/** Picks the top-stat player on the winning team from an already stat-sorted leaderboard. */
export function selectMvpEntry(
  entries: PlayerLeaderboardEntry[],
  winnerTeamId: string,
): PlayerLeaderboardEntry | null {
  return entries.find((entry) => entry.teamId === winnerTeamId) ?? null;
}

export type MvpCertificateArt = {
  url: string;
  name: string;
  roleLabel: string;
};

/** Resolves the MVP portrait + label for a certificate, or null if the game/role isn't eligible. */
export function resolveMvpForCertificate(
  gameId: string,
  entries: PlayerLeaderboardEntry[],
  winnerTeamId: string,
): MvpCertificateArt | null {
  if (gameId !== MVP_ELIGIBLE_GAME_ID) return null;

  const mvp = selectMvpEntry(entries, winnerTeamId);
  if (!mvp) return null;

  const url = pickMvpCharacterArt(mvp.position, mvp.playerId);
  if (!url) return null;

  const primaryStat = Object.entries(mvp.totalStats).find(([key]) => key === "goal")?.[1] ?? 0;

  return {
    url,
    name: mvp.playerName,
    roleLabel: `${mvp.position} · ${primaryStat} goals`,
  };
}
