import { describe, expect, it } from "vitest";
import { monogramInitials, recipientNameFontSize } from "./miracle-v3-editorial-text";

describe("monogramInitials", () => {
  it.each([
    ["Flash Peak Championship", "FP"],
    ["Garuda Nova", "GN"],
    ["miracle", "MI"],
    ["  Vortex   ID ", "VI"],
    ["X", "X"],
    ["éclair du jour", "ÉD"],
    ["Team-Alpha 2026", "TA"],
  ])("takes up to two letters from %s", (name, expected) => {
    expect(monogramInitials(name)).toBe(expected);
  });

  it("falls back to M when the name has no letters or digits", () => {
    expect(monogramInitials("")).toBe("M");
    expect(monogramInitials("🔥🔥 !!!")).toBe("M");
  });

  it("never returns markup characters", () => {
    expect(monogramInitials('<script>alert("x")</script> & co')).toMatch(/^[\p{L}\p{N}]{1,2}$/u);
  });
});

describe("recipientNameFontSize", () => {
  it("shrinks as the name grows and never goes below the minimum", () => {
    const sizes = ["Nyx", "Garuda Nova Esports", "A".repeat(30), "A".repeat(40), "A".repeat(60), "🔥".repeat(80)].map(recipientNameFontSize);
    for (let index = 1; index < sizes.length; index++) expect(sizes[index]).toBeLessThanOrEqual(sizes[index - 1]);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(22);
    expect(sizes[0]).toBeGreaterThan(sizes.at(-1)!);
  });

  it("counts emoji as one character, not two UTF-16 units", () => {
    expect(recipientNameFontSize("🔥".repeat(10))).toBe(recipientNameFontSize("A".repeat(10)));
  });
});
