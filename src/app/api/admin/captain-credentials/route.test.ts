import { beforeEach, describe, expect, it, vi } from "vitest";

const { assertUserCanManageEvent, getCaptainCredentialsForEvent, requireRole } = vi.hoisted(() => ({
  assertUserCanManageEvent: vi.fn(),
  getCaptainCredentialsForEvent: vi.fn(),
  requireRole: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireRole }));
vi.mock("@/lib/platform/repository", () => ({ assertUserCanManageEvent, getCaptainCredentialsForEvent }));

import { GET } from "./route";

describe("captain credentials export API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertUserCanManageEvent.mockResolvedValue(undefined);
  });

  it("requires an admin session", async () => {
    requireRole.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/admin/captain-credentials?eventId=event-safe"));

    expect(response.status).toBe(401);
    expect(getCaptainCredentialsForEvent).not.toHaveBeenCalled();
  });

  it("rejects unsafe event IDs before querying credentials", async () => {
    requireRole.mockResolvedValue({ id: "admin-1", role: "admin" });

    const response = await GET(new Request("http://localhost/api/admin/captain-credentials?eventId=../secrets"));

    expect(response.status).toBe(400);
    expect(getCaptainCredentialsForEvent).not.toHaveBeenCalled();
  });

  it("rejects SQL-injection-style event IDs before querying credentials", async () => {
    requireRole.mockResolvedValue({ id: "admin-1", role: "admin" });

    const response = await GET(
      new Request("http://localhost/api/admin/captain-credentials?eventId=event-safe%27%20OR%201%3D1--"),
    );

    expect(response.status).toBe(400);
    expect(getCaptainCredentialsForEvent).not.toHaveBeenCalled();
  });

  it("neutralizes spreadsheet formulas in exported CSV cells", async () => {
    requireRole.mockResolvedValue({ id: "admin-1", role: "admin" });
    getCaptainCredentialsForEvent.mockResolvedValue([
      {
        teamName: "=HYPERLINK(\"https://evil.test\")",
        teamTag: "+SUM",
        captainName: "@attacker",
        captainContact: "-10+20",
        email: "captain@example.com",
        tempPassword: "safe-pass",
      },
    ]);

    const response = await GET(new Request("http://localhost/api/admin/captain-credentials?eventId=event-safe_123"));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("'=HYPERLINK");
    expect(body).toContain("'+SUM");
    expect(body).toContain("'@attacker");
    expect(body).toContain("'-10+20");
  });

  it("marks credential exports as non-cacheable and non-indexable", async () => {
    requireRole.mockResolvedValue({ id: "admin-1", role: "admin" });
    getCaptainCredentialsForEvent.mockResolvedValue([]);

    const response = await GET(new Request("http://localhost/api/admin/captain-credentials?eventId=event-safe_123"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store, max-age=0");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");
  });
});
