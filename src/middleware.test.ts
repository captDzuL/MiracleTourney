import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-intl/middleware", () => ({
  default: () => () => new Response("intl-ok", { status: 200 }),
}));

function postLoginRequest(ip: string, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/id/login", {
    method: "POST",
    headers: { "x-forwarded-for": ip, origin: "http://localhost", ...headers },
  });
}

describe("middleware security controls", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("rate-limits repeated login POST attempts from the same IP", async () => {
    const { middleware } = await import("./middleware");
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
    const { middleware } = await import("./middleware");

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await middleware(postLoginRequest("203.0.113.20"));
    }

    const response = await middleware(postLoginRequest("203.0.113.21"));

    expect(response.status).toBe(200);
  });

  it("rejects cross-origin unsafe requests before server actions run", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(postLoginRequest("203.0.113.30", {
      origin: "https://evil.example",
      "sec-fetch-site": "cross-site",
    }));

    expect(response.status).toBe(403);
    await expect(response.text()).resolves.toContain("Cross-site request blocked");
  });

  it("rejects same-site sibling origins before server actions run", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(postLoginRequest("203.0.113.32", {
      origin: "http://sub.localhost",
      "sec-fetch-site": "same-site",
    }));

    expect(response.status).toBe(403);
  });

  it("rejects unsafe requests with no Origin header", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(new NextRequest("http://localhost/id/login", {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.33", "sec-fetch-site": "same-site" },
    }));

    expect(response.status).toBe(403);
  });

  it("allows same-origin unsafe requests through the normal middleware flow", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(postLoginRequest("203.0.113.31", {
      origin: "http://localhost",
      "sec-fetch-site": "same-origin",
    }));

    expect(response.status).toBe(200);
  });

  it("allows same-origin requests when the framework URL uses an internal authority", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(new NextRequest("http://framework.internal:3000/id/login", {
      method: "POST",
      headers: {
        "x-forwarded-for": "203.0.113.34",
        host: "127.0.0.1:3100",
        "x-forwarded-host": "127.0.0.1:3100",
        "x-forwarded-proto": "http",
        origin: "http://127.0.0.1:3100",
        "sec-fetch-site": "same-origin",
      },
    }));

    expect(response.status).toBe(200);
  });

  it("keeps the loopback authority fallback disabled in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { middleware } = await import("./middleware");

    const response = await middleware(new NextRequest("http://framework.internal:3000/id/login", {
      method: "POST",
      headers: {
        "x-forwarded-for": "203.0.113.44",
        host: "127.0.0.1:3100",
        "x-forwarded-host": "127.0.0.1:3100",
        "x-forwarded-proto": "http",
        origin: "http://127.0.0.1:3100",
        "sec-fetch-site": "same-origin",
      },
    }));

    expect(response.status).toBe(403);
  });

  it("preserves normalized default ports on the strict framework authority path", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(new NextRequest("https://release.example/id/login", {
      method: "POST",
      headers: {
        "x-forwarded-for": "203.0.113.45",
        host: "release.example",
        origin: "https://release.example:443",
        "sec-fetch-site": "same-origin",
      },
    }));

    expect(response.status).toBe(200);
  });

  it("allows the non-production loopback fallback for IPv6", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(new NextRequest("http://framework.internal:3000/id/login", {
      method: "POST",
      headers: {
        "x-forwarded-for": "203.0.113.46",
        host: "[::1]:3100",
        "x-forwarded-host": "[::1]:3100",
        "x-forwarded-proto": "http",
        origin: "http://[::1]:3100",
        "sec-fetch-site": "same-origin",
      },
    }));

    expect(response.status).toBe(200);
  });

  it("rejects forwarded browser authority when Host remains the framework authority", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(new NextRequest("http://framework.internal:3000/id/login", {
      method: "POST",
      headers: {
        "x-forwarded-for": "203.0.113.35",
        host: "framework.internal:3000",
        "x-forwarded-host": "127.0.0.1:3100",
        "x-forwarded-proto": "http",
        origin: "http://127.0.0.1:3100",
        "sec-fetch-site": "same-origin",
      },
    }));

    expect(response.status).toBe(403);
  });

  it("rejects disagreeing Host and forwarded authorities even when Origin matches one", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(new NextRequest("http://framework.internal:3000/id/login", {
      method: "POST",
      headers: {
        "x-forwarded-for": "203.0.113.36",
        host: "miracle-league.fun",
        "x-forwarded-host": "evil.example",
        "x-forwarded-proto": "https",
        origin: "https://evil.example",
        "sec-fetch-site": "same-origin",
      },
    }));

    expect(response.status).toBe(403);
  });

  it("rejects forged forwarded authority when Host matches the framework authority", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(new NextRequest("http://framework.internal:3000/id/login", {
      method: "POST",
      headers: {
        "x-forwarded-for": "203.0.113.41",
        host: "framework.internal:3000",
        "x-forwarded-host": "evil.example",
        "x-forwarded-proto": "https",
        origin: "https://evil.example",
        "sec-fetch-site": "same-origin",
      },
    }));

    expect(response.status).toBe(403);
  });

  it("rejects matching forged Host, forwarded authority and Origin", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(new NextRequest("http://framework.internal:3000/id/login", {
      method: "POST",
      headers: {
        "x-forwarded-for": "203.0.113.42",
        host: "evil.example",
        "x-forwarded-host": "evil.example",
        "x-forwarded-proto": "https",
        origin: "https://evil.example",
        "sec-fetch-site": "same-origin",
      },
    }));

    expect(response.status).toBe(403);
  });

  it("rejects forwarded authority when Host is missing", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(new NextRequest("http://framework.internal:3000/id/login", {
      method: "POST",
      headers: {
        "x-forwarded-for": "203.0.113.43",
        "x-forwarded-host": "evil.example",
        "x-forwarded-proto": "https",
        origin: "https://evil.example",
        "sec-fetch-site": "same-origin",
      },
    }));

    expect(response.status).toBe(403);
  });

  it("rejects malformed forwarded authorities", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(new NextRequest("http://framework.internal:3000/id/login", {
      method: "POST",
      headers: {
        "x-forwarded-for": "203.0.113.37",
        host: "127.0.0.1:3100/path",
        "x-forwarded-host": "127.0.0.1:3100/path",
        "x-forwarded-proto": "http",
        origin: "http://127.0.0.1:3100",
        "sec-fetch-site": "same-origin",
      },
    }));

    expect(response.status).toBe(403);
  });

  it("rejects malformed Origin values", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(new NextRequest("http://framework.internal:3000/id/login", {
      method: "POST",
      headers: {
        "x-forwarded-for": "203.0.113.39",
        host: "127.0.0.1:3100",
        "x-forwarded-host": "127.0.0.1:3100",
        "x-forwarded-proto": "http",
        origin: "http:\\127.0.0.1:3100",
        "sec-fetch-site": "same-origin",
      },
    }));

    expect(response.status).toBe(403);
  });

  it("rejects ambiguous forwarded protocol metadata", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(new NextRequest("http://framework.internal:3000/id/login", {
      method: "POST",
      headers: {
        "x-forwarded-for": "203.0.113.40",
        host: "127.0.0.1:3100",
        "x-forwarded-host": "127.0.0.1:3100",
        "x-forwarded-proto": "http,https",
        origin: "http://127.0.0.1:3100",
        "sec-fetch-site": "same-origin",
      },
    }));

    expect(response.status).toBe(403);
  });

  it("rejects cross-site fetch metadata even when Origin matches the effective authority", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(new NextRequest("http://framework.internal:3000/id/login", {
      method: "POST",
      headers: {
        "x-forwarded-for": "203.0.113.38",
        host: "127.0.0.1:3100",
        "x-forwarded-host": "127.0.0.1:3100",
        "x-forwarded-proto": "http",
        origin: "http://127.0.0.1:3100",
        "sec-fetch-site": "cross-site",
      },
    }));

    expect(response.status).toBe(403);
  });
});
