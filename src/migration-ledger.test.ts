import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertMigrationsApplied,
  findUnappliedMigrations,
  listLocalMigrations,
} from "../scripts/migration-ledger.mjs";

const databaseUrl = "postgresql://user:pass@ep-sparkling-night-azr6wxwd.c-3.ap-southeast-1.aws.neon.tech/neondb";
const directUrl = "postgresql://user:pass@ep-sparkling-night-azr6wxwd-direct.c-3.ap-southeast-1.aws.neon.tech/neondb";

const local = ["20261004000000_event_bracket_appearance", "20261011000000_add_roster_change_requests", "20261011010000_add_player_roster_gaps"];

describe("findUnappliedMigrations", () => {
  it("returns local migrations that are not applied, in local order", () => {
    expect(findUnappliedMigrations(local, ["20261004000000_event_bracket_appearance"])).toEqual([
      "20261011000000_add_roster_change_requests",
      "20261011010000_add_player_roster_gaps",
    ]);
  });

  it("returns nothing when every local migration is applied", () => {
    expect(findUnappliedMigrations(local, [...local, "20990101000000_only_in_database"])).toEqual([]);
  });
});

describe("listLocalMigrations", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("lists migration folders sorted and ignores migration_lock.toml", () => {
    const dir = mkdtempSync(join(tmpdir(), "migrations-"));
    dirs.push(dir);
    mkdirSync(join(dir, "20260812160000_multi_organizer"));
    mkdirSync(join(dir, "20260812150000_baseline"));
    writeFileSync(join(dir, "migration_lock.toml"), 'provider = "postgresql"');

    expect(listLocalMigrations(dir)).toEqual(["20260812150000_baseline", "20260812160000_multi_organizer"]);
  });
});

describe("assertMigrationsApplied", () => {
  const listLocal = () => local;

  it("blocks the build and names each missing migration and the fix", async () => {
    const fetchApplied = vi.fn(async () => ["20261004000000_event_bracket_appearance"]);

    const result = assertMigrationsApplied({ DIRECT_URL: directUrl }, { listLocal, fetchApplied });

    await expect(result).rejects.toThrow(/20261011000000_add_roster_change_requests/);
    await expect(result).rejects.toThrow(/20261011010000_add_player_roster_gaps/);
    await expect(result).rejects.toThrow(/prisma migrate deploy/);
    await expect(result).rejects.toThrow(/prisma migrate resolve --applied/);
    await expect(result).rejects.toThrow(/SKIP_MIGRATION_CHECK/);
  });

  it("passes when every migration is applied", async () => {
    const fetchApplied = vi.fn(async () => [...local]);
    await expect(assertMigrationsApplied({ DIRECT_URL: directUrl }, { listLocal, fetchApplied })).resolves.toBeUndefined();
  });

  it("prefers DIRECT_URL over DATABASE_URL", async () => {
    const fetchApplied = vi.fn(async () => [...local]);
    await assertMigrationsApplied({ DIRECT_URL: directUrl, DATABASE_URL: databaseUrl }, { listLocal, fetchApplied });
    expect(fetchApplied).toHaveBeenCalledExactlyOnceWith(directUrl);
  });

  it("falls back to DATABASE_URL when DIRECT_URL is missing", async () => {
    const fetchApplied = vi.fn(async () => [...local]);
    await assertMigrationsApplied({ DATABASE_URL: databaseUrl }, { listLocal, fetchApplied });
    expect(fetchApplied).toHaveBeenCalledExactlyOnceWith(databaseUrl);
  });

  it("is skipped when SKIP_MIGRATION_CHECK=1", async () => {
    const fetchApplied = vi.fn(async () => []);
    const warn = vi.fn();
    await assertMigrationsApplied({ DIRECT_URL: directUrl, SKIP_MIGRATION_CHECK: "1" }, { listLocal, fetchApplied, warn });
    expect(fetchApplied).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/SKIP_MIGRATION_CHECK/));
  });

  it("warns and continues when there is no database URL to check", async () => {
    const fetchApplied = vi.fn(async () => []);
    const warn = vi.fn();
    await assertMigrationsApplied({}, { listLocal, fetchApplied, warn });
    expect(fetchApplied).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/DIRECT_URL or DATABASE_URL/));
  });

  it("warns and continues when the database cannot be read", async () => {
    const fetchApplied = vi.fn(async () => {
      throw new Error("Can't reach database server");
    });
    const warn = vi.fn();
    await expect(assertMigrationsApplied({ DIRECT_URL: directUrl }, { listLocal, fetchApplied, warn })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Can't reach database server/));
  });
});
