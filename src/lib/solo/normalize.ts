/** Comparison key for positions and in-game names: ignores case and surrounding spaces. */
export function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

export function samePosition(left: string, right: string): boolean {
  return normalizeKey(left) === normalizeKey(right);
}
