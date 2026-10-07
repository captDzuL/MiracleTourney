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
};

const preflightModulePath = "../scripts/e2e-db-preflight.mjs";
const { checkE2eDatabaseConnection } = await import(preflightModulePath) as PreflightModule;

describe("E2E database URL priority", () => {
  it("blocks a production DATABASE_URL even when DIRECT_URL is a test host", async () => {
    const PrismaClient = vi.fn();

    const result = await checkE2eDatabaseConnection({
      env: {
        DIRECT_URL: "postgresql://test-user:test-password@ep-test-direct.example.test/testdb",
        DATABASE_URL: "postgresql://test-user:test-password@ep-sparkling-night-azr6wxwd.c-3.ap-southeast-1.aws.neon.tech/testdb",
      },
      PrismaClient,
    });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/production Neon branch/);
    expect(PrismaClient).not.toHaveBeenCalled();
  });
});
