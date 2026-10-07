import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const source = read("src/lib/feature-flags.ts");
const matrix = read("docs/operations/v3-feature-flag-matrix.md");

const defaults = new Map(
  [...source.slice(source.indexOf("const DEFAULTS")).matchAll(/^\s+([a-z0-9_]+): (true|false),$/gm)].map((m) => [m[1], m[2]]),
);
const rows = new Map(
  [...matrix.matchAll(/^\| `([a-z0-9_]+)` \| `(FEATURE_FLAG_[A-Z0-9_]+)` \| (true|false) \|/gm)].map((m) => [m[1], { env: m[2], fallback: m[3] }]),
);

describe("V3 feature-flag matrix document", () => {
  it("covers every flag in code and no flag that does not exist", () => {
    expect(defaults.size).toBe(16);
    expect([...rows.keys()].sort()).toEqual([...defaults.keys()].sort());
  });

  it("states the code default and the exact environment variable of each flag", () => {
    for (const [flag, value] of defaults) {
      expect(rows.get(flag)?.fallback, flag).toBe(value);
      expect(rows.get(flag)?.env, flag).toBe(`FEATURE_FLAG_${flag.toUpperCase()}`);
    }
  });

  it("keeps every default false so a missing variable can never enable a flag", () => {
    expect([...defaults.values()].every((value) => value === "false")).toBe(true);
  });
});
