import { describe, expect, it, vi } from "vitest";

type PreflightModule = {
  checkE2eDatabaseConnection(options?: {
    env?: Record<string, string | undefined>;
    PrismaClient?: new () => { $connect: () => Promise<void>; $disconnect: () => Promise<void> };
    timeoutMs?: number;
  }): Promise<{
    ok: boolean;
    host: string;
    message: string;
  }>;
};

const preflightModulePath = "../scripts/e2e-db-preflight.mjs";
const { checkE2eDatabaseConnection } = await import(preflightModulePath) as PreflightModule;

function prismaClientMock(connectImpl: () => Promise<void>) {
  const disconnect = vi.fn().mockResolvedValue(undefined);
  const PrismaClient = vi.fn(() => ({
    $connect: connectImpl,
    $disconnect: disconnect,
  }));

  return { PrismaClient, disconnect };
}

describe("E2E database preflight", () => {
  it("blocks when DATABASE_URL points to the production Neon host", async () => {
    const result = await checkE2eDatabaseConnection({
      env: {
        DATABASE_URL: "postgresql://user:secret@ep-prod-host.neon.tech:5432/app",
        NEON_PROD_HOST: "ep-prod-host.neon.tech",
      },
      PrismaClient: vi.fn(),
    });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/production Neon branch/);
  });

  it("fails fast when no database URL is configured", async () => {
    const result = await checkE2eDatabaseConnection({
      env: {},
      PrismaClient: vi.fn(),
    });

    expect(result).toEqual({
      ok: false,
      host: "(not configured)",
      message: "DATABASE_URL or DIRECT_URL must be set before running DB-backed E2E tests.",
    });
  });

  it("passes when Prisma can connect and disconnects cleanly", async () => {
    const { PrismaClient, disconnect } = prismaClientMock(vi.fn().mockResolvedValue(undefined));

    const result = await checkE2eDatabaseConnection({
      env: { DIRECT_URL: "postgresql://user:secret@example.test:5432/app" },
      PrismaClient,
    });

    expect(result.ok).toBe(true);
    expect(result.host).toBe("example.test:5432");
    expect(disconnect).toHaveBeenCalled();
  });

  it("fails without leaking credentials when Prisma cannot reach the host", async () => {
    const { PrismaClient, disconnect } = prismaClientMock(
      vi.fn().mockRejectedValue(new Error("Can't reach database server at `example.test:5432`")),
    );

    const result = await checkE2eDatabaseConnection({
      env: { DATABASE_URL: "postgresql://user:super-secret@example.test:5432/app" },
      PrismaClient,
    });

    expect(result).toEqual({
      ok: false,
      host: "example.test:5432",
      message: "Database host is not reachable from this machine.",
    });
    expect(JSON.stringify(result)).not.toContain("super-secret");
    expect(disconnect).toHaveBeenCalled();
  });
});
