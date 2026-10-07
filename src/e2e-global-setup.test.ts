import { describe, expect, it, vi } from "vitest";

const { execSyncMock, PrismaClientMock, newContextMock, getMock, disposeMock } = vi.hoisted(() => ({
  execSyncMock: vi.fn(),
  PrismaClientMock: vi.fn(),
  newContextMock: vi.fn(), getMock: vi.fn(), disposeMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({ execSync: execSyncMock }));
vi.mock("@prisma/client", () => ({ PrismaClient: PrismaClientMock }));
vi.mock("@playwright/test", () => ({ request: { newContext: newContextMock } }));

const { default: globalSetup } = await import("../tests/e2e/global-setup");

describe("E2E global setup safety", () => {
  it("prewarms route modules using only disposable unauthenticated reads", async () => {
    vi.stubEnv("E2E_DATABASE_RESET_ALLOWED", "true");
    getMock.mockResolvedValue({ status: () => 404, body: async () => Buffer.from("") });
    newContextMock.mockResolvedValue({ get: getMock, dispose: disposeMock });
    await globalSetup({ projects: [{ use: { baseURL: "http://127.0.0.1:3100" } }] } as never);
    expect(newContextMock).toHaveBeenCalledWith({ baseURL: "http://127.0.0.1:3100" });
    expect(getMock).toHaveBeenCalledWith("/en/organizer/events/__e2e_prewarm__/schedule", { maxRedirects: 0 });
    expect(getMock).toHaveBeenCalledWith("/api/organizer/events/__e2e_prewarm__/competition", { maxRedirects: 0 });
    expect(disposeMock).toHaveBeenCalledOnce();
    expect(execSyncMock).not.toHaveBeenCalled(); expect(PrismaClientMock).not.toHaveBeenCalled();
    vi.unstubAllEnvs(); vi.clearAllMocks();
  });
  it("fails setup on a server error and disposes its context", async () => {
    vi.stubEnv("E2E_DATABASE_RESET_ALLOWED", "true");
    getMock.mockResolvedValue({ status: () => 500, body: async () => Buffer.from("") });
    newContextMock.mockResolvedValue({ get: getMock, dispose: disposeMock });
    await expect(globalSetup({ projects: [{ use: { baseURL: "http://127.0.0.1:3100" } }] } as never)).rejects.toThrow(/prewarm.*500/i);
    expect(disposeMock).toHaveBeenCalledOnce();
    vi.unstubAllEnvs(); vi.clearAllMocks();
  });
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
