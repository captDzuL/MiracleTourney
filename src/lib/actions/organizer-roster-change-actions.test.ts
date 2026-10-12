import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAnyRole, checkRateLimit, decideRosterChange, setRosterChangeLimit, revalidatePath, revalidateTag, redirectToActiveLocale, FakeRosterChangeError } = vi.hoisted(() => {
  class FakeRosterChangeError extends Error {
    constructor(readonly code: string) { super(code); this.name = "RosterChangeError"; }
  }
  return {
    requireAnyRole: vi.fn(),
    checkRateLimit: vi.fn(),
    decideRosterChange: vi.fn(),
    setRosterChangeLimit: vi.fn(),
    revalidatePath: vi.fn(),
    revalidateTag: vi.fn(),
    redirectToActiveLocale: vi.fn(async (path: string) => { throw new Error(`REDIRECT:${path}`); }),
    FakeRosterChangeError,
  };
});

vi.mock("@/lib/auth/session", () => ({ requireAnyRole }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit }));
vi.mock("@/lib/platform/roster-change-decisions", () => ({ decideRosterChange, setRosterChangeLimit }));
vi.mock("@/lib/platform/roster-change-rules", () => ({ RosterChangeError: FakeRosterChangeError, MAX_ROSTER_CHANGE_LIMIT: 5 }));
vi.mock("next/cache", () => ({ revalidatePath, revalidateTag }));
vi.mock("@/i18n/redirect", () => ({ redirectToActiveLocale }));

import { organizerDecideRosterChangeAction, organizerSetRosterChangeLimitAction } from "./organizer-roster-change-actions";

const organizer = { id: "organizer-1", role: "organizer", email: "o@test.com", name: "Organizer", mustChangePassword: false };
const settingsPath = "/organizer/events/event-1/settings";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}
const decideForm = { eventId: "event-1", requestId: "request-1", decision: "approve", note: "  Silakan  " };

beforeEach(() => {
  vi.clearAllMocks();
  requireAnyRole.mockResolvedValue(organizer);
  checkRateLimit.mockResolvedValue(true);
  decideRosterChange.mockResolvedValue({ eventId: "event-1" });
  setRosterChangeLimit.mockResolvedValue(undefined);
  redirectToActiveLocale.mockImplementation(async (path: string) => { throw new Error(`REDIRECT:${path}`); });
});

describe("organizerDecideRosterChangeAction", () => {
  it("approves for the signed-in organizer and returns to the settings page", async () => {
    await expect(organizerDecideRosterChangeAction(form(decideForm))).rejects.toThrow(`REDIRECT:${settingsPath}?rcResult=approved`);
    expect(requireAnyRole).toHaveBeenCalledWith(["organizer", "platform_admin", "admin"]);
    expect(decideRosterChange).toHaveBeenCalledWith({ actor: organizer, requestId: "request-1", decision: "approve", note: "Silakan" });
  });

  it("makes the new roster visible right away", async () => {
    await expect(organizerDecideRosterChangeAction(form(decideForm))).rejects.toThrow("rcResult=approved");
    expect(revalidateTag).toHaveBeenCalledWith("teams");
    expect(revalidateTag).toHaveBeenCalledWith("stats");
    expect(revalidatePath).toHaveBeenCalledWith("/captain");
  });

  it("rejects without refreshing public rosters", async () => {
    await expect(organizerDecideRosterChangeAction(form({ ...decideForm, decision: "reject", note: "Belum terdaftar" }))).rejects.toThrow(`${settingsPath}?rcResult=rejected`);
    expect(decideRosterChange).toHaveBeenCalledWith(expect.objectContaining({ decision: "reject", note: "Belum terdaftar" }));
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("sends a refusal back as a known code, never as free text", async () => {
    decideRosterChange.mockRejectedValue(new FakeRosterChangeError("window_closed"));
    await expect(organizerDecideRosterChangeAction(form(decideForm))).rejects.toThrow(`${settingsPath}?rcError=window_closed`);
  });

  it("reports a person without access as forbidden, without details", async () => {
    decideRosterChange.mockRejectedValue(new Error("Not authorized"));
    await expect(organizerDecideRosterChangeAction(form(decideForm))).rejects.toThrow(`${settingsPath}?rcError=forbidden`);
  });

  it("hides the details of an unexpected failure", async () => {
    decideRosterChange.mockRejectedValue(new Error("connection string postgres://user:secret@host"));
    await expect(organizerDecideRosterChangeAction(form(decideForm))).rejects.toThrow(`${settingsPath}?rcError=unknown`);
  });

  it.each([
    ["an unknown decision", { ...decideForm, decision: "delete" }],
    ["a malformed request id", { ...decideForm, requestId: "../x" }],
    ["a malformed event id", { ...decideForm, eventId: "a b" }],
    ["an oversized note", { ...decideForm, note: "x".repeat(201) }],
  ])("rejects %s before touching the database", async (_name, fields) => {
    await expect(organizerDecideRosterChangeAction(form(fields))).rejects.toThrow("REDIRECT:");
    expect(decideRosterChange).not.toHaveBeenCalled();
  });

  it("slows down a flood of decisions", async () => {
    checkRateLimit.mockResolvedValue(false);
    await expect(organizerDecideRosterChangeAction(form(decideForm))).rejects.toThrow(`${settingsPath}?rcError=rate_limited`);
    expect(decideRosterChange).not.toHaveBeenCalled();
    expect(checkRateLimit).toHaveBeenCalledWith("roster-decision:organizer-1", expect.any(Number), expect.any(Number));
  });

  it("sends a signed-out visitor to login", async () => {
    requireAnyRole.mockResolvedValue(null);
    await expect(organizerDecideRosterChangeAction(form(decideForm))).rejects.toThrow("REDIRECT:/login");
    expect(decideRosterChange).not.toHaveBeenCalled();
  });

  it("makes an organizer change the temporary password first", async () => {
    requireAnyRole.mockResolvedValue({ ...organizer, mustChangePassword: true });
    await expect(organizerDecideRosterChangeAction(form(decideForm))).rejects.toThrow("REDIRECT:/organizer/change-password");
    expect(decideRosterChange).not.toHaveBeenCalled();
  });
});

describe("organizerSetRosterChangeLimitAction", () => {
  it("saves the limit and confirms", async () => {
    await expect(organizerSetRosterChangeLimitAction(form({ eventId: "event-1", limit: "2" }))).rejects.toThrow(`${settingsPath}?rcResult=limit_saved`);
    expect(setRosterChangeLimit).toHaveBeenCalledWith({ actor: organizer, eventId: "event-1", limit: 2 });
  });

  it.each(["abc", "", "-1", "1.5", "99"])("rejects the limit %j without calling the domain for non-numbers", async (limit) => {
    await expect(organizerSetRosterChangeLimitAction(form({ eventId: "event-1", limit }))).rejects.toThrow("rcError=invalid_limit");
  });

  it("limits how often the limit can be changed, with its own budget per user", async () => {
    checkRateLimit.mockResolvedValue(false);
    await expect(organizerSetRosterChangeLimitAction(form({ eventId: "event-1", limit: "2" }))).rejects.toThrow("rcError=rate_limited");
    expect(setRosterChangeLimit).not.toHaveBeenCalled();
    expect(checkRateLimit).toHaveBeenCalledWith("roster-limit:organizer-1", expect.any(Number), expect.any(Number));
  });

  it("explains why a limit was refused", async () => {
    setRosterChangeLimit.mockRejectedValue(new FakeRosterChangeError("limit_below_used"));
    await expect(organizerSetRosterChangeLimitAction(form({ eventId: "event-1", limit: "1" }))).rejects.toThrow("rcError=limit_below_used");
  });

  it("needs a valid event id and a session", async () => {
    await expect(organizerSetRosterChangeLimitAction(form({ eventId: "a b", limit: "2" }))).rejects.toThrow("REDIRECT:");
    expect(setRosterChangeLimit).not.toHaveBeenCalled();
    requireAnyRole.mockResolvedValue(null);
    await expect(organizerSetRosterChangeLimitAction(form({ eventId: "event-1", limit: "2" }))).rejects.toThrow("REDIRECT:/login");
  });
});
