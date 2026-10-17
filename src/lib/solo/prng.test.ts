import { describe, expect, it } from "vitest";

import { createRng, shuffle } from "./prng";

function take(rng: () => number, count: number) {
  return Array.from({ length: count }, () => rng());
}

describe("createRng", () => {
  it("gives the same sequence for the same seed", () => {
    expect(take(createRng("seed-1"), 20)).toEqual(take(createRng("seed-1"), 20));
  });

  it("gives a different sequence for a different seed", () => {
    expect(take(createRng("seed-1"), 20)).not.toEqual(take(createRng("seed-2"), 20));
  });

  it("stays in [0, 1) and spreads across the range", () => {
    const values = take(createRng("range"), 2000);
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });

  it("rejects an empty seed", () => {
    expect(() => createRng("")).toThrow(RangeError);
    expect(() => createRng("   ")).toThrow(RangeError);
  });
});

describe("shuffle", () => {
  const items = Array.from({ length: 30 }, (_, index) => index);

  it("returns a permutation of the input", () => {
    const result = shuffle(items, createRng("perm"));
    expect([...result].sort((left, right) => left - right)).toEqual(items);
  });

  it("does not change the input", () => {
    const copy = [...items];
    shuffle(items, createRng("immutable"));
    expect(items).toEqual(copy);
  });

  it("is repeatable for a seed and varies between seeds", () => {
    expect(shuffle(items, createRng("same"))).toEqual(shuffle(items, createRng("same")));
    expect(shuffle(items, createRng("one"))).not.toEqual(shuffle(items, createRng("two")));
  });

  it("handles empty and single-item input", () => {
    expect(shuffle([], createRng("empty"))).toEqual([]);
    expect(shuffle(["only"], createRng("one"))).toEqual(["only"]);
  });

  it("puts every item in every position over many seeds", () => {
    const counts = new Map<number, number>();
    for (let run = 0; run < 600; run += 1) {
      const first = shuffle([0, 1, 2, 3], createRng(`fair-${run}`))[0];
      counts.set(first, (counts.get(first) ?? 0) + 1);
    }
    for (const item of [0, 1, 2, 3]) {
      expect(counts.get(item) ?? 0).toBeGreaterThan(100);
    }
  });
});
