import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("tenant ownership schema contract", () => {
  const schemaPath = fileURLToPath(
    new URL("../../../prisma/schema.prisma", import.meta.url),
  );
  const schema = readFileSync(schemaPath, "utf8");

  it("requires event organizer ownership and restrict delete behavior", () => {
    expect(schema).toMatch(/^\s*organizerUserId\s+String\s*$/m);
    expect(schema).toMatch(/^\s*organizer\s+User\s+@relation\("EventOrganizer",\s*fields:\s*\[organizerUserId\],\s*references:\s*\[id\],\s*onDelete:\s*Restrict\)\s*$/m);
    expect(schema).toMatch(/^\s*@@index\(\[organizerUserId\]\)\s*$/m);
    expect(schema).not.toMatch(/^\s*organizerUserId\s+String\?\s*$/m);
    expect(schema).not.toMatch(/^\s*organizer\s+User\?\s+@relation\("EventOrganizer",\s*fields:\s*\[organizerUserId\],\s*references:\s*\[id\],\s*onDelete:\s*SetNull\)\s*$/m);
  });
});

describe("tenant ownership migration guards", () => {
  const migrationPath = fileURLToPath(
    new URL("../../../prisma/migrations/20260908083000_enforce_event_organizer_ownership/migration.sql", import.meta.url),
  );
  const migration = readFileSync(migrationPath, "utf8");

  it("runs atomically and validates guards before DDL", () => {
    expect(migration).toContain("BEGIN;");
    expect(migration).toContain("COMMIT;");

    const nullGuardPos = migration.indexOf("Event.organizerUserId contains NULL. Apply explicit orphan mappings first");
    const setNotNullPos = migration.indexOf("ALTER COLUMN \"organizerUserId\" SET NOT NULL");
    expect(nullGuardPos).toBeGreaterThan(-1);
    expect(setNotNullPos).toBeGreaterThan(-1);
    expect(nullGuardPos).toBeLessThan(setNotNullPos);
  });

  it("fails fast when null owners still exist", () => {
    expect(migration).toContain("Event.organizerUserId contains NULL. Apply explicit orphan mappings first");
  });

  it("fails when any admin role remains before constraints", () => {
    expect(migration).toContain("no admin roles remain");
  });

  it("does not perform broad role inference downgrade", () => {
    expect(migration).not.toContain("SET \"role\" = 'organizer'");
    expect(migration).not.toContain("UPDATE \"User\"");
    expect(migration).not.toContain("WHERE \"role\" IN ('admin', 'platform_admin')");
  });

  it("enforces owner index, NOT NULL, and RESTRICT foreign key", () => {
    expect(migration).toContain("CREATE INDEX IF NOT EXISTS \"Event_organizerUserId_idx\"");
    expect(migration).toContain("ALTER COLUMN \"organizerUserId\" SET NOT NULL");
    expect(migration).toContain("ON DELETE RESTRICT ON UPDATE CASCADE");
  });
});
