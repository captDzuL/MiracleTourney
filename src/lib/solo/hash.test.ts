import { describe, expect, it } from "vitest";

import { buildPool } from "./fixtures";
import { hashDrawInput } from "./hash";

describe("hashDrawInput", () => {
  const pool = buildPool({ keepers: 2, emergency: 1, field: 8 });

  it("is a sha-256 hex string", () => {
    expect(hashDrawInput(pool)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not depend on input order", () => {
    expect(hashDrawInput([...pool].reverse())).toBe(hashDrawInput(pool));
  });

  it("changes when a player is added or removed", () => {
    expect(hashDrawInput(pool.slice(1))).not.toBe(hashDrawInput(pool));
    expect(hashDrawInput([...pool, ...buildPool({ keepers: 0, emergency: 0, field: 1 }).map((c) => ({ ...c, registrationId: "r-new" }))])).not.toBe(hashDrawInput(pool));
  });

  it.each([
    ["position", { primaryPosition: "Goalkeeper" }],
    ["backup position", { secondaryPosition: "Goalkeeper" }],
    ["captain wish", { willingCaptain: true }],
    ["in-game name", { ign: "someone-else" }],
    ["game id", { uid: "uid-changed" }],
    ["registration time", { registeredAt: 1 }],
  ])("changes when the %s changes", (_label, change) => {
    const changed = pool.map((candidate, index) => (index === 5 ? { ...candidate, ...change } : candidate));
    expect(hashDrawInput(changed)).not.toBe(hashDrawInput(pool));
  });

  it("ignores letter case and spaces that do not change meaning in positions", () => {
    const changed = pool.map((candidate) => ({ ...candidate, primaryPosition: ` ${candidate.primaryPosition.toUpperCase()} ` }));
    expect(hashDrawInput(changed)).toBe(hashDrawInput(pool));
  });

  it("hashes an empty pool", () => {
    expect(hashDrawInput([])).toMatch(/^[0-9a-f]{64}$/);
  });
});
