import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  getPendingStatSubmissionCount: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("@/lib/platform/repository", () => ({ getPendingStatSubmissionCount: mocks.getPendingStatSubmissionCount }));

import { GET } from "./route";

describe("/api/me scope and cache boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPendingStatSubmissionCount.mockResolvedValue(3);
  });

  it("returns only the anonymous shape with private no-store headers", async () => {
    mocks.getSessionUser.mockResolvedValue(null);

    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("vary")).toBe("Cookie");
    await expect(response.json()).resolves.toEqual({ user: null });
    expect(mocks.getPendingStatSubmissionCount).not.toHaveBeenCalled();
  });

  it("returns a safe organizer projection and asks the scoped repository for its count", async () => {
    const user = { id: "organizer-1", name: "Organizer", email: "private@example.test", role: "organizer" };
    mocks.getSessionUser.mockResolvedValue(user);

    const response = await GET();
    await expect(response.json()).resolves.toEqual({ user: { name: "Organizer", role: "organizer", pendingCount: 3 } });
    expect(mocks.getPendingStatSubmissionCount).toHaveBeenCalledWith(user);
    expect(JSON.stringify(await (await GET()).json())).not.toContain("private@example.test");
  });

  it("keeps captain sessions from reading organizer pending-submission metadata", async () => {
    const user = { id: "captain-1", name: "Captain", email: "private@example.test", role: "captain" };
    mocks.getSessionUser.mockResolvedValue(user);

    const response = await GET();
    await expect(response.json()).resolves.toEqual({ user: { name: "Captain", role: "captain", pendingCount: 0 } });
    expect(mocks.getPendingStatSubmissionCount).not.toHaveBeenCalled();
  });

  it("maps session metadata failures to the uniform public error contract", async () => {
    const user = { id: "organizer-1", name: "Organizer", email: "private@example.test", role: "organizer" };
    mocks.getSessionUser.mockResolvedValue(user);
    mocks.getPendingStatSubmissionCount.mockRejectedValue(new Error("Prisma P2028 private stack"));

    const response = await GET(new Request("https://app.example/api/me", { headers: { "x-vercel-id": "req-me-failure" } }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ code: "internal_error", requestId: "req-me-failure" });
  });
});
