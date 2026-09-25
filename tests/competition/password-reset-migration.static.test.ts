import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const migration = readFileSync(
  resolve(root, "prisma/migrations/20260921000000_add_user_session_version/migration.sql"),
  "utf8",
);

function migrationGuard(source: string) {
  const start = source.indexOf("DO $$");
  const endMarker = /END\s*\$\$;/m.exec(source.slice(start));
  if (start < 0 || !endMarker || endMarker.index === undefined) throw new Error("Expected a complete PostgreSQL DO guard");
  const end = start + endMarker.index + endMarker[0].length;
  return { start, end, source: source.slice(start, end) };
}

describe("password reset token migration contract", () => {
  it("fails closed on duplicate user reset rows before creating the unique index", () => {
    const { start: guardStart, end: guardEnd, source: guard } = migrationGuard(migration);
    const uniqueIndex = migration.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_userId_key"');

    expect(guard).toContain("IF EXISTS");
    expect(guard).toMatch(/FROM\s+"PasswordResetToken"/);
    expect(guard).toMatch(/GROUP BY\s+"userId"/);
    expect(guard).toMatch(/HAVING\s+COUNT\(\*\)\s*>\s*1/);
    expect(guard).toContain("RAISE EXCEPTION");
    expect(guard).toMatch(/duplicate.*PasswordResetToken.*userId|PasswordResetToken.*userId.*duplicate/i);
    expect(guard).toMatch(/END\s*\$\$;/);
    expect(guardStart).toBeGreaterThanOrEqual(0);
    expect(uniqueIndex).toBeGreaterThan(guardEnd);
  });

  it("does not delete, deduplicate, update, or insert legacy reset rows", () => {
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(migration).not.toMatch(/\bUPDATE\s+"PasswordResetToken"\b/i);
    expect(migration).not.toMatch(/\bINSERT\s+INTO\s+"PasswordResetToken"\b/i);
    expect(migration).not.toMatch(/\bTRUNCATE\b|\bMERGE\b/i);
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "tokenFormat" TEXT NOT NULL DEFAULT \'legacy_raw\'');
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_userId_key"');
  });
});
