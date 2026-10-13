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


describe("middleware role areas", () => {
  const SECRET = "middleware-test-secret-with-32-characters!!";

  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.stubEnv("JWT_SECRET", SECRET);
  });

  async function tokenFor(role: string) {
    const { SignJWT } = await import("jose");
    return new SignJWT({ sub: "user-1", role, sv: 0 })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(SECRET));
  }

  async function visit(path: string, role: string | null, rawToken?: string) {
    const { middleware } = await import("./middleware");
    const token = rawToken ?? (role ? await tokenFor(role) : null);
    const response = await middleware(new NextRequest(`http://localhost${path}`, {
      headers: token ? { cookie: `mfl_token=${token}` } : {},
    }));
    return { allowed: response.status === 200, location: response.headers.get("location") };
  }

  const cases: Array<[role: string, path: string, allowed: boolean]> = [
    ["player", "/id/player", true],
    ["player", "/id/player/registrations", true],
    ["player", "/id/captain", true],
    ["player", "/id/admin", false],
    ["captain", "/id/captain", true],
    ["captain", "/id/player", false],
    ["captain", "/id/admin", false],
    ["organizer", "/id/admin", true],
    ["organizer", "/id/player", false],
    ["organizer", "/id/captain", false],
    ["admin", "/id/admin", true],
    ["admin", "/id/player", false],
    ["platform_admin", "/id/admin", true],
    ["platform_admin", "/id/player", false],
    ["platform_admin", "/id/captain", false],
  ];

  it.each(cases)("%s opening %s is allowed: %s", async (role, path, allowed) => {
    const result = await visit(path, role);
    expect(result.allowed).toBe(allowed);
    if (!allowed) expect(result.location).toBe("http://localhost/id/login");
  });

  it.each(["/id/player", "/id/captain", "/id/admin"])("sends a visitor without a session from %s to login", async (path) => {
    const result = await visit(path, null);
    expect(result.allowed).toBe(false);
    expect(result.location).toBe("http://localhost/id/login");
  });

  it("treats a token signed with another secret as no session", async () => {
    const { SignJWT } = await import("jose");
    const forged = await new SignJWT({ sub: "user-1", role: "player", sv: 0 })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("some-other-secret-with-32-characters!!"));
    const result = await visit("/id/player", null, forged);
    expect(result.allowed).toBe(false);
  });

  it("leaves public pages open to everyone", async () => {
    expect((await visit("/id/events", null)).allowed).toBe(true);
    expect((await visit("/id/events", "player")).allowed).toBe(true);
  });
});
