import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  getLocale: vi.fn(),
  headers: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }),
}));
vi.mock("@/lib/auth/session", () => ({ requireRole: mocks.requireRole }));
vi.mock("next-intl/server", () => ({ getLocale: mocks.getLocale }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
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
    expect(response.headers.get("Cache-Control")).toBe("no-store, max-age=0");
    expect(response.headers.get("Vary")).toBe("Cookie");
  });

  it("maps auth-provider failures to a generic private error", async () => {
    mocks.requireRole.mockRejectedValue(new Error("session token stack"));

    const response = await GET(new Request("https://app.example/api/debug-locale", {
      headers: { "x-vercel-id": "req-debug-auth-failure" },
    }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ code: "internal_error", requestId: "req-debug-auth-failure" });
    expect(response.headers.get("Cache-Control")).toBe("no-store, max-age=0");
    expect(response.headers.get("Vary")).toBe("Cookie");
    expect(mocks.getLocale).not.toHaveBeenCalled();
  });

  it("marks successful diagnostics as private and non-cacheable", async () => {
    mocks.requireRole.mockResolvedValue({ id: "platform-1", role: "platform_admin" });
    mocks.getLocale.mockResolvedValue("id");
    mocks.headers.mockResolvedValue(new Headers({ "x-next-intl-locale": "id" }));

    const response = await GET(new Request("https://app.example/api/debug-locale", {
      headers: { "x-vercel-id": "req-debug-success" },
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store, max-age=0");
    expect(response.headers.get("Vary")).toBe("Cookie");
  });

  it("maps locale-provider failures to the same generic private error", async () => {
    mocks.requireRole.mockResolvedValue({ id: "platform-1", role: "platform_admin" });
    mocks.getLocale.mockRejectedValue(new Error("locale provider stack"));

    const response = await GET(new Request("https://app.example/api/debug-locale", {
      headers: { "x-vercel-id": "req-debug-locale-failure" },
    }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ code: "internal_error", requestId: "req-debug-locale-failure" });
    expect(response.headers.get("Cache-Control")).toBe("no-store, max-age=0");
    expect(response.headers.get("Vary")).toBe("Cookie");
  });
});
