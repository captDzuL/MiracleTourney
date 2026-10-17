import { createHash } from "node:crypto";

/** Deterministic random numbers in [0, 1): the same seed always gives the same sequence. */
export function createRng(seed: string): () => number {
  if (seed.trim() === "") throw new RangeError("A draw seed cannot be empty.");
  let state = createHash("sha256").update(seed).digest().readUInt32BE(0);
  return () => {
    // mulberry32
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle that leaves the input untouched. */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapWith = Math.floor(rng() * (index + 1));
    [result[index], result[swapWith]] = [result[swapWith], result[index]];
  }
  return result;
}
