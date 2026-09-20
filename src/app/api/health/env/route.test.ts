import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { requireRole } = vi.hoisted(() => ({ requireRole: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireRole }));

import { GET } from "./route";

describe("environment health API", () => {
  beforeEach(() => {
    requireRole.mockResolvedValue({ id: "platform-1", role: "platform_admin" });
  });

  afterEach(() => vi.clearAllMocks());

  it("denies non-platform actors without exposing environment details", async () => {
    requireRole.mockResolvedValue(null);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({ code: "forbidden", requestId: expect.any(String) });
    expect(JSON.stringify(body)).not.toContain("JWT_SECRET");
  });

  it("returns only a stable health status without exposing environment details", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: "ok" });
    expect(JSON.stringify(body)).not.toMatch(/JWT_SECRET|VERCEL_ENV|NODE_ENV|secret|length/i);
    expect(response.headers.get("Cache-Control")).toBe("no-store, max-age=0");
  });
});
