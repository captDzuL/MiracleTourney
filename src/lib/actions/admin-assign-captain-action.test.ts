import { beforeEach, describe, expect, it, vi } from "vitest";

// adminAssignCaptainAction (lib/actions/identity-actions.ts): an organizer may only attach captains who already
// belong to one of the organizer's own events. The reach itself is enforced by findAssignableCaptain.

const { assertUserCanManageEvent, findAssignableCaptain, getTeamEventRef, headers, requireRole, revalidatePath, setTeamCaptain } = vi.hoisted(() => ({
  assertUserCanManageEvent: vi.fn(),
  findAssignableCaptain: vi.fn(),
  getTeamEventRef: vi.fn(),
  headers: vi.fn(),
  requireRole: vi.fn(),
  revalidatePath: vi.fn(),
  setTeamCaptain: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath, revalidateTag: vi.fn(), unstable_cache: <T>(fn: T) => fn }));
vi.mock("next/navigation", () => ({
  redirect: (url: string): never => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("next/headers", () => ({ headers, cookies: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireRole, signIn: vi.fn() }));
vi.mock("@/lib/observability/logger", () => ({ writeServerLog: vi.fn(), withServerActionLog: <T>(_name: string, fn: T) => fn }));
vi.mock("@/lib/platform/db", () => ({ prisma: {} }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/platform/password-reset", () => ({
  consumePasswordResetToken: vi.fn(),
  createPasswordResetToken: vi.fn(),
  equalizePasswordResetResponse: vi.fn(),
}));
vi.mock("@/lib/events/repository", () => ({ getEventsByIds: vi.fn() }));
vi.mock("@/lib/identity/repository", () => ({
  createCaptainAccount: vi.fn(),
  findAssignableCaptain,
  getUserByEmail: vi.fn(),
  getUserPasswordHashById: vi.fn(),
  setTeamCaptain,
  updateCaptainPassword: vi.fn(),
}));
vi.mock("@/lib/teams/repository", () => ({ getTeamEventRef }));
vi.mock("@/lib/platform/shared/authz", () => ({ assertUserCanManageEvent }));

import { adminAssignCaptainAction } from "@/lib/actions/identity-actions";

type Role = "captain" | "organizer" | "platform_admin" | "admin";

function signInAs(role: Role | null) {
  const user = role ? { id: `${role}-1`, role, email: `${role}@test.com`, name: role, mustChangePassword: false } : null;
  requireRole.mockImplementation(async (asked: string) => (user && user.role === asked ? user : null));
}

function form(pairs: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(pairs)) data.set(key, value);
  return data;
}

async function expectRedirect(action: Promise<unknown>, url: string) {
  await expect(action).rejects.toThrow(new Error(`REDIRECT:${url}`));
}

const errorUrl = (message: string) => `/admin?error=${encodeURIComponent(message)}`;

describe("adminAssignCaptainAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    headers.mockRejectedValue(new Error("outside of a request scope"));
    signInAs("organizer");
    getTeamEventRef.mockResolvedValue({ id: "team-1", eventId: "event-1" });
    assertUserCanManageEvent.mockResolvedValue(undefined);
    findAssignableCaptain.mockResolvedValue({ id: "captain-9", name: "Captain Nine" });
    setTeamCaptain.mockResolvedValue(undefined);
  });

  it("attaches the captain the user is allowed to reach, asking the reach check about the session user", async () => {
    await expectRedirect(adminAssignCaptainAction(form({ teamId: "team-1", captainUserId: "captain-9" })), "/admin?success=captain-assigned");

    expect(assertUserCanManageEvent).toHaveBeenCalledWith(expect.objectContaining({ role: "organizer" }), "event-1");
    expect(findAssignableCaptain).toHaveBeenCalledWith(expect.objectContaining({ role: "organizer", id: "organizer-1" }), "captain-9");
    expect(setTeamCaptain).toHaveBeenCalledWith("team-1", { id: "captain-9", name: "Captain Nine" });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("refuses a captain who is out of the organizer's reach and changes nothing", async () => {
    findAssignableCaptain.mockResolvedValue(null);

    await expectRedirect(
      adminAssignCaptainAction(form({ teamId: "team-1", captainUserId: "captain-of-another-organizer" })),
      errorUrl("Kapten tidak ditemukan."),
    );

    expect(setTeamCaptain).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("clears the captain without looking anyone up when no captain is chosen", async () => {
    await expectRedirect(adminAssignCaptainAction(form({ teamId: "team-1", captainUserId: "" })), "/admin?success=captain-assigned");

    expect(findAssignableCaptain).not.toHaveBeenCalled();
    expect(setTeamCaptain).toHaveBeenCalledWith("team-1", null);
  });

  it("stops when the team does not exist or belongs to no event", async () => {
    getTeamEventRef.mockResolvedValue({ id: "team-1", eventId: null });

    await expectRedirect(adminAssignCaptainAction(form({ teamId: "team-1", captainUserId: "captain-9" })), errorUrl("Tim tidak ditemukan."));

    expect(assertUserCanManageEvent).not.toHaveBeenCalled();
    expect(setTeamCaptain).not.toHaveBeenCalled();
  });

  it("stops before choosing a captain when the user does not manage the team's event", async () => {
    assertUserCanManageEvent.mockRejectedValue(new Error("Not authorized"));

    await expect(adminAssignCaptainAction(form({ teamId: "team-1", captainUserId: "captain-9" }))).rejects.toThrow("Not authorized");

    expect(findAssignableCaptain).not.toHaveBeenCalled();
    expect(setTeamCaptain).not.toHaveBeenCalled();
  });

  it.each(["platform_admin", "admin"] as const)("passes the %s user on to the reach check as well", async (role) => {
    signInAs(role);

    await expectRedirect(adminAssignCaptainAction(form({ teamId: "team-1", captainUserId: "captain-9" })), "/admin?success=captain-assigned");

    expect(findAssignableCaptain).toHaveBeenCalledWith(expect.objectContaining({ role }), "captain-9");
  });
});
