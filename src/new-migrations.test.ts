import { describe, expect, it } from "vitest";

import { extractNewMigrations, isUsableBaseRef } from "../scripts/operations/new-migrations.mjs";

describe("extractNewMigrations", () => {
  it("returns the folder name of each added migration.sql", () => {
    const diff = [
      "prisma/migrations/20261011000000_add_roster_change_requests/migration.sql",
      "prisma/schema.prisma",
      "src/app/page.tsx",
      "prisma/migrations/20261011010000_add_player_roster_gaps/migration.sql",
    ].join("\n");

    expect(extractNewMigrations(diff)).toEqual([
      "20261011000000_add_roster_change_requests",
      "20261011010000_add_player_roster_gaps",
    ]);
  });

  it("ignores the lock file and other files inside migration folders", () => {
    expect(extractNewMigrations("prisma/migrations/migration_lock.toml\nprisma/migrations/2026_x/notes.md\n")).toEqual([]);
  });

  it("returns nothing for empty output", () => {
    expect(extractNewMigrations("")).toEqual([]);
  });
});

describe("isUsableBaseRef", () => {
  it("rejects an empty base and the all-zero SHA of a new branch", () => {
    expect(isUsableBaseRef("")).toBe(false);
    expect(isUsableBaseRef(undefined)).toBe(false);
    expect(isUsableBaseRef("0000000000000000000000000000000000000000")).toBe(false);
  });

  it("accepts a real ref", () => {
    expect(isUsableBaseRef("origin/main")).toBe(true);
    expect(isUsableBaseRef("2c717bc3e1f6a0d8f2b1c4d5e6f708192a3b4c5d")).toBe(true);
  });
});
