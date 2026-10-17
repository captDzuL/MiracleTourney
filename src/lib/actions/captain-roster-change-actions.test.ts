import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireRole, checkRateLimit, requestRosterChange, cancelRosterChangeRequest, revalidatePath, redirectToActiveLocale, FakeRosterChangeError, teamCount } = vi.hoisted(() => {
  class FakeRosterChangeError extends Error {
    constructor(readonly code: string) { super(code); this.name = "RosterChangeError"; }
  }
  return {
    requireRole: vi.fn(),
    checkRateLimit: vi.fn(),
    requestRosterChange: vi.fn(),
    cancelRosterChangeRequest: vi.fn(),
    revalidatePath: vi.fn(),
    redirectToActiveLocale: vi.fn(async (path: string) => { throw new Error(`REDIRECT:${path}`); }),
    FakeRosterChangeError,
    teamCount: vi.fn(),
  };
});

vi.mock("@/lib/auth/session", () => ({ requireRole }));
vi.mock("@/lib/platform/db", () => ({ prisma: { team: { count: teamCount } } }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit }));
vi.mock("@/lib/platform/roster-change-requests", () => ({
  requestRosterChange, cancelRosterChangeRequest, RosterChangeError: FakeRosterChangeError,
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/i18n/redirect", () => ({ redirectToActiveLocale }));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => `t:${key}`,
}));

import { captainCancelRosterChangeAction, captainRequestRosterChangeAction } from "./captain-roster-change-actions";

const captain = { id: "captain-1", role: "captain", email: "c@test.com", name: "Captain" };

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}
const swapForm = { teamId: "team-1", kind: "swap", outPlayerId: "p-b", displayName: " UID-new ", nickname: " NewGuy ", position: "Defender" };

beforeEach(() => {
  vi.clearAllMocks();
  requireRole.mockResolvedValue(captain);
  checkRateLimit.mockResolvedValue(true);
  requestRosterChange.mockResolvedValue({ requestId: "request-1", remaining: 1 });
  redirectToActiveLocale.mockImplementation(async (path: string) => { throw new Error(`REDIRECT:${path}`); });
});

describe("a player who captains a solo team", () => {
  const player = { id: "player-1", role: "player", email: "p@test.com", name: "Bima" };
  const signedInAs = (user: { id: string; role: string } | null, ownsTeam: boolean) => {
    requireRole.mockImplementation(async (role: string) => (user && user.role === role ? user : null));
    teamCount.mockResolvedValue(ownsTeam ? 1 : 0);
  };

  it("files and cancels requests for their own team", async () => {
    signedInAs(player, true);
    await expect(captainRequestRosterChangeAction(form(swapForm))).rejects.toThrow("success=roster-change-requested");
    expect(requestRosterChange).toHaveBeenCalledWith(expect.objectContaining({ captainId: "player-1", teamId: "team-1" }));
    await expect(captainCancelRosterChangeAction(form({ requestId: "request-1" }))).rejects.toThrow("REDIRECT:");
    expect(cancelRosterChangeRequest).toHaveBeenCalledWith(expect.objectContaining({ captainId: "player-1" }));
  });

  it("is sent to sign in when they captain no team, or are somebody else", async () => {
    for (const [user, ownsTeam] of [[player, false], [{ id: "o1", role: "organizer" }, true], [null, true]] as const) {
      signedInAs(user, ownsTeam);
      await expect(captainRequestRosterChangeAction(form(swapForm))).rejects.toThrow("REDIRECT:/login");
      await expect(captainCancelRosterChangeAction(form({ requestId: "request-1" }))).rejects.toThrow("REDIRECT:/login");
    }
    expect(requestRosterChange).not.toHaveBeenCalled();
    expect(cancelRosterChangeRequest).not.toHaveBeenCalled();
  });
});

describe("captainRequestRosterChangeAction", () => {
  it("files a swap for the signed-in captain and returns to the roster tab", async () => {
    await expect(captainRequestRosterChangeAction(form(swapForm))).rejects.toThrow("REDIRECT:/captain?tab=roster&success=roster-change-requested");
    expect(requireRole).toHaveBeenCalledWith("captain");
    expect(requestRosterChange).toHaveBeenCalledWith({
      captainId: "captain-1", teamId: "team-1",
      change: { kind: "swap", outPlayerId: "p-b", incoming: { displayName: "UID-new", nickname: "NewGuy", position: "Defender" } },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/captain");
  });

  it("files an add without a leaving player and a remove without a joining player", async () => {
    await expect(captainRequestRosterChangeAction(form({ teamId: "team-1", kind: "add", displayName: "UID-new", nickname: "NewGuy" }))).rejects.toThrow("success=roster-change-requested");
    expect(requestRosterChange).toHaveBeenLastCalledWith({
      captainId: "captain-1", teamId: "team-1",
      change: { kind: "add", incoming: { displayName: "UID-new", nickname: "NewGuy", position: "" } },
    });
    await expect(captainRequestRosterChangeAction(form({ teamId: "team-1", kind: "remove", outPlayerId: "p-b" }))).rejects.toThrow("success=roster-change-requested");
    expect(requestRosterChange).toHaveBeenLastCalledWith({
      captainId: "captain-1", teamId: "team-1", change: { kind: "remove", outPlayerId: "p-b" },
    });
  });

  it("explains a refused request in the captain's language instead of leaking the code", async () => {
    requestRosterChange.mockRejectedValue(new FakeRosterChangeError("no_allowance"));
    await expect(captainRequestRosterChangeAction(form(swapForm))).rejects.toThrow(
      `REDIRECT:/captain?tab=roster&error=${encodeURIComponent("t:rosterChange.error.no_allowance")}`,
    );
  });

  it("shows a generic message for an unexpected failure and hides its details", async () => {
    requestRosterChange.mockRejectedValue(new Error("connection string postgres://user:secret@host"));
    const result = captainRequestRosterChangeAction(form(swapForm));
    await expect(result).rejects.toThrow(`error=${encodeURIComponent("t:rosterChange.error.unknown")}`);
    await expect(captainRequestRosterChangeAction(form(swapForm))).rejects.not.toThrow("secret");
  });

  it.each([
    ["an unknown kind", { ...swapForm, kind: "teleport" }],
    ["a swap without a leaving player", { ...swapForm, outPlayerId: "" }],
    ["a swap without a joining UID", { ...swapForm, displayName: "" }],
    ["a one-letter IGN", { ...swapForm, nickname: "N" }],
    ["an oversized IGN", { ...swapForm, nickname: "N".repeat(41) }],
    ["a malformed team id", { ...swapForm, teamId: "../etc/passwd" }],
  ])("rejects %s before touching the database", async (_name, fields) => {
    await expect(captainRequestRosterChangeAction(form(fields))).rejects.toThrow("REDIRECT:/captain?tab=roster&error=");
    expect(requestRosterChange).not.toHaveBeenCalled();
  });

  it("slows down a captain who keeps submitting, with a translated message", async () => {
    checkRateLimit.mockResolvedValue(false);
    await expect(captainRequestRosterChangeAction(form(swapForm))).rejects.toThrow(
      `error=${encodeURIComponent("t:rosterChange.error.rate_limited")}`,
    );
    expect(requestRosterChange).not.toHaveBeenCalled();
  });

  it("limits per captain, so rotating the team id cannot buy a fresh allowance", async () => {
    await expect(captainRequestRosterChangeAction(form(swapForm))).rejects.toThrow("success=");
    await expect(captainRequestRosterChangeAction(form({ ...swapForm, teamId: "another-team" }))).rejects.toThrow("success=");
    expect(checkRateLimit.mock.calls.map(([key]) => key)).toEqual(["roster-change:captain-1", "roster-change:captain-1"]);
  });

  it("sends a signed-out visitor to login without calling the domain", async () => {
    requireRole.mockResolvedValue(null);
    redirectToActiveLocale.mockImplementation(async (path: string) => { throw new Error(`REDIRECT:${path}`); });
    await expect(captainRequestRosterChangeAction(form(swapForm))).rejects.toThrow("REDIRECT:/login");
    expect(requestRosterChange).not.toHaveBeenCalled();
  });
});

describe("captainCancelRosterChangeAction", () => {
  it("cancels the captain's own request", async () => {
    await expect(captainCancelRosterChangeAction(form({ requestId: "request-1" }))).rejects.toThrow("REDIRECT:/captain?tab=roster&success=roster-change-cancelled");
    expect(cancelRosterChangeRequest).toHaveBeenCalledWith({ captainId: "captain-1", requestId: "request-1" });
    expect(revalidatePath).toHaveBeenCalledWith("/captain");
  });

  it("reports a request that was already decided", async () => {
    cancelRosterChangeRequest.mockRejectedValue(new FakeRosterChangeError("request_not_pending"));
    await expect(captainCancelRosterChangeAction(form({ requestId: "request-1" }))).rejects.toThrow(
      `error=${encodeURIComponent("t:rosterChange.error.request_not_pending")}`,
    );
  });

  it("also limits cancelling, so file-and-cancel loops cannot fill the table", async () => {
    checkRateLimit.mockResolvedValue(false);
    await expect(captainCancelRosterChangeAction(form({ requestId: "request-1" }))).rejects.toThrow(
      `error=${encodeURIComponent("t:rosterChange.error.rate_limited")}`,
    );
    expect(cancelRosterChangeRequest).not.toHaveBeenCalled();
    expect(checkRateLimit).toHaveBeenCalledWith("roster-change:captain-1", expect.any(Number), expect.any(Number));
  });

  it("rejects a malformed request id", async () => {
    await expect(captainCancelRosterChangeAction(form({ requestId: "a b" }))).rejects.toThrow("REDIRECT:/captain?tab=roster&error=");
    expect(cancelRosterChangeRequest).not.toHaveBeenCalled();
  });
});
