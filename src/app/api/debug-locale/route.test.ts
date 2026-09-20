import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }) }));
vi.mock("@/lib/auth/session", () => ({ requireRole: mocks.requireRole }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

import { GET } from "./route";

describe("debug locale API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "development");
    mocks.requireRole.mockResolvedValue(null);
  });

  it("returns the uniform forbidden contract for non-platform actors", async () => {
    const response = await GET(new Request("https://app.example/api/debug-locale", { headers: { "x-vercel-id": "req-debug-forbidden" } }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: "forbidden", requestId: "req-debug-forbidden" });
  });
});
