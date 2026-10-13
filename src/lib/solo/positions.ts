import { normalizeKey } from "./normalize";

export type ResolvedPositions =
  | { ok: true; primary: string; secondary: string | null }
  | { ok: false; message: string };

function canonical(position: string, offered: readonly string[]): string | null {
  const key = normalizeKey(position);
  return offered.find((candidate) => normalizeKey(candidate) === key) ?? null;
}

/**
 * Checks a player's positions against the ones the game offers and returns them spelled the way
 * the game spells them. A missing secondary position, or one that repeats the primary, is none.
 */
export function resolvePositions(
  input: { primary: string; secondary?: string | null },
  offered: readonly string[],
): ResolvedPositions {
  if (normalizeKey(input.primary) === "") return { ok: false, message: "Posisi utama wajib dipilih." };
  const primary = canonical(input.primary, offered);
  if (!primary) return { ok: false, message: "Posisi utama tidak tersedia untuk game ini." };

  if (input.secondary == null || normalizeKey(input.secondary) === "") return { ok: true, primary, secondary: null };
  const secondary = canonical(input.secondary, offered);
  if (!secondary) return { ok: false, message: "Posisi cadangan tidak tersedia untuk game ini." };
  return { ok: true, primary, secondary: secondary === primary ? null : secondary };
}
