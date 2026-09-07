import { describe, expect, it, vi } from "vitest";

type PreflightModule = {
  checkE2eDatabaseConnection(options?: {
    env?: Record<string, string | undefined>;
    PrismaClient?: new () => { $connect: () => Promise<void>; $disconnect: () => Promise<void> };
  }): Promise<{
    ok: boolean;
    host: string;
    message: string;
  }>;
  requireE2eDatabaseResetPermission(env?: Record<string, string | undefined>): void;
};

const preflightModulePath = "../scripts/e2e-db-preflight.mjs";
const { checkE2eDatabaseConnection, requireE2eDatabaseResetPermission } = await import(preflightModulePath) as PreflightModule;

describe("E2E database safety", () => {
  it("blocks the known production Neon branch before Prisma connects", async () => {
    const PrismaClient = vi.fn();

    const result = await checkE2eDatabaseConnection({
      env: {
        DATABASE_URL: "postgresql://test-user:test-password@ep-sparkling-night-azr6wxwd.c-3.ap-southeast-1.aws.neon.tech/testdb",
      },
      PrismaClient,
    });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/production Neon branch/);
    expect(PrismaClient).not.toHaveBeenCalled();
  });

  it("blocks malformed database URLs before Prisma connects", async () => {
    const PrismaClient = vi.fn();

    const result = await checkE2eDatabaseConnection({
      env: { DATABASE_URL: "not-a-database-url" },
      PrismaClient,
    });

    expect(result).toEqual({
      ok: false,
      host: "(invalid database URL)",
      message: "DATABASE_URL and DIRECT_URL must be valid absolute URLs before running DB-backed E2E tests.",
    });
    expect(PrismaClient).not.toHaveBeenCalled();
  });

  it("blocks missing database URLs before Prisma connects", async () => {
    const PrismaClient = vi.fn();

    const result = await checkE2eDatabaseConnection({
      env: {},
      PrismaClient,
    });

    expect(result).toEqual({
      ok: false,
      host: "(not configured)",
      message: "DATABASE_URL or DIRECT_URL must be set before running DB-backed E2E tests.",
    });
    expect(PrismaClient).not.toHaveBeenCalled();
  });

  it("blocks resets when the reset sentinel is missing", () => {
    expect(() => requireE2eDatabaseResetPermission({})).toThrow(/E2E_DATABASE_RESET_ALLOWED=true/);
  });

  it("blocks resets when the reset sentinel is false", () => {
    expect(() => requireE2eDatabaseResetPermission({ E2E_DATABASE_RESET_ALLOWED: "false" })).toThrow(/E2E_DATABASE_RESET_ALLOWED=true/);
  });
});
