import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  eventFindFirst: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth/session", () => ({ signIn: mocks.signIn, signOut: mocks.signOut }));
vi.mock("@/lib/platform/db", () => ({ prisma: { event: { findFirst: mocks.eventFindFirst } } }));

import { captainEventLoginAction } from "./captain-event-login";

function form(overrides: Record<string, string> = {}) {
  const value = new FormData();
  value.set("locale", "id");
  value.set("eventId", "event-1");
  value.set("email", "captain@miracle.id");
  value.set("password", "secret123");
  for (const [key, item] of Object.entries(overrides)) value.set(key, item);
  return value;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.headers.mockResolvedValue(new Headers({ "x-forwarded-for": "127.0.0.1" }));
  mocks.checkRateLimit.mockReturnValue(true);
  mocks.eventFindFirst.mockResolvedValue({ id: "event-1" });
  mocks.signIn.mockResolvedValue({ ok: true, user: { id: "captain-1", role: "captain" } });
  mocks.redirect.mockImplementation((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  });
});

describe("captainEventLoginAction", () => {
  it("builds the registration destination on the server", async () => {
    await expect(captainEventLoginAction({ status: "idle" }, form({
      redirect: "https://evil.example",
    }))).rejects.toThrow("REDIRECT:/id/captain?tab=registration&eventId=event-1");
  });

  it("rejects invalid locale and event IDs before authentication", async () => {
    await expect(captainEventLoginAction({ status: "idle" }, form({ locale: "fr" }))).resolves.toEqual({ status: "error", code: "invalid" });
    await expect(captainEventLoginAction({ status: "idle" }, form({ eventId: "https://evil.example" }))).resolves.toEqual({ status: "error", code: "invalid" });
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("returns inline errors for invalid credentials, rate limit, and database errors", async () => {
    mocks.signIn.mockResolvedValueOnce({ ok: false, error: "Invalid" });
    await expect(captainEventLoginAction({ status: "idle" }, form())).resolves.toEqual({ status: "error", code: "invalid" });

    mocks.checkRateLimit.mockReturnValueOnce(false);
    await expect(captainEventLoginAction({ status: "idle" }, form())).resolves.toEqual({ status: "error", code: "rate_limited" });

    mocks.eventFindFirst.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(captainEventLoginAction({ status: "idle" }, form())).resolves.toEqual({ status: "error", code: "database" });
  });

  it("clears a non-captain session and keeps the event dialog open", async () => {
    mocks.signIn.mockResolvedValueOnce({ ok: true, user: { id: "org-1", role: "organizer" } });
    await expect(captainEventLoginAction({ status: "idle" }, form())).resolves.toEqual({ status: "error", code: "wrong_role" });
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});