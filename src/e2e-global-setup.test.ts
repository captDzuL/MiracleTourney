import { describe, expect, it, vi } from "vitest";

const { execSyncMock, PrismaClientMock } = vi.hoisted(() => ({
  execSyncMock: vi.fn(),
  PrismaClientMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({ execSync: execSyncMock }));
vi.mock("@prisma/client", () => ({ PrismaClient: PrismaClientMock }));

const { default: globalSetup } = await import("../tests/e2e/global-setup");

describe("E2E global setup safety", () => {
  it.each([undefined, "false"])(
    "blocks destructive setup before commands or Prisma when reset permission is %s",
    async (permission) => {
      vi.stubEnv("E2E_DATABASE_RESET_ALLOWED", permission);

      await expect(globalSetup()).rejects.toThrow(/E2E_DATABASE_RESET_ALLOWED=true/);
      expect(execSyncMock).not.toHaveBeenCalled();
      expect(PrismaClientMock).not.toHaveBeenCalled();

      vi.unstubAllEnvs();
    },
  );
});