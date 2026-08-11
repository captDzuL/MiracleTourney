import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-intl/middleware", () => ({
  default: () => () => new Response("intl-ok", { status: 200 }),
}));

function postLoginRequest(ip: string, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/id/login", {
    method: "POST",
    headers: { "x-forwarded-for": ip, ...headers },
  });
}

describe("middleware security controls", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("rate-limits repeated login POST attempts from the same IP", async () => {
    const { middleware } = await import("../middleware");
    const ip = "203.0.113.10";

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await middleware(postLoginRequest(ip));
      expect(response.status).toBe(200);
    }

    const blocked = await middleware(postLoginRequest(ip));

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("60");
    await expect(blocked.text()).resolves.toContain("Too many login attempts");
  });

  it("keeps login rate limits scoped by client IP", async () => {
    const { middleware } = await import("../middleware");

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await middleware(postLoginRequest("203.0.113.20"));
    }

    const response = await middleware(postLoginRequest("203.0.113.21"));

    expect(response.status).toBe(200);
  });

  it("rejects cross-origin unsafe requests before server actions run", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(postLoginRequest("203.0.113.30", {
      origin: "https://evil.example",
      "sec-fetch-site": "cross-site",
    }));

    expect(response.status).toBe(403);
    await expect(response.text()).resolves.toContain("Cross-site request blocked");
  });

  it("allows same-origin unsafe requests through the normal middleware flow", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(postLoginRequest("203.0.113.31", {
      origin: "http://localhost",
      "sec-fetch-site": "same-origin",
    }));

    expect(response.status).toBe(200);
  });
});
