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
    expect(response.headers.get("Cache-Control")).toBe("no-store, max-age=0");
    expect(response.headers.get("Vary")).toBe("Cookie");
  });

  it("maps auth-provider failures to a generic private error", async () => {
    requireRole.mockRejectedValue(new Error("database password stack"));

    const response = await GET(new Request("https://app.example/api/health/env", {
      headers: { "x-vercel-id": "req-health-auth-failure" },
    }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ code: "internal_error", requestId: "req-health-auth-failure" });
    expect(response.headers.get("Cache-Control")).toBe("no-store, max-age=0");
    expect(response.headers.get("Vary")).toBe("Cookie");
  });

  it("returns only a stable health status without exposing environment details", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: "ok" });
    expect(JSON.stringify(body)).not.toMatch(/JWT_SECRET|VERCEL_ENV|NODE_ENV|secret|length/i);
    expect(response.headers.get("Cache-Control")).toBe("no-store, max-age=0");
    expect(response.headers.get("Vary")).toBe("Cookie");
  });
});
