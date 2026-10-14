/**
 * Who may do what in the captain's name. A captain does everything. A player whom a solo draw made
 * captain of a team runs that team (roster, logo, stats, password) and nothing else: no registering
 * teams, no reusable draft, no proof of payment for a team. Everybody else gets nothing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  teamCount: vi.fn(),
  teamFindFirst: vi.fn(),
  addPlayer: vi.fn(),
  updatePlayer: vi.fn(),
  deletePlayer: vi.fn(),
  setTeamCaptainDisplay: vi.fn(),
  assertCaptainCanSubmitStats: vi.fn(),
  getPlayerStatFormContext: vi.fn(),
  upsertStatSubmission: vi.fn(),
  getUserPasswordHashById: vi.fn(),
  updateCaptainPassword: vi.fn(),
  reissueSession: vi.fn().mockResolvedValue(true),
  registerTeam: vi.fn(),
  createCaptainWithTeam: vi.fn(),
  saveDraftTeam: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireRole: mocks.requireRole, signIn: vi.fn(), signOut: vi.fn(), reissueSession: mocks.reissueSession }));
vi.mock("@/lib/platform/db", () => ({ prisma: { team: { count: mocks.teamCount, findFirst: mocks.teamFindFirst, findMany: vi.fn().mockResolvedValue([]) } } }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/i18n/redirect", () => ({
  redirectToActiveLocale: (path: string): never => {
    throw new Error(`REDIRECT:${path}`);
  },
  getLocalizedRedirectPath: (path: string) => path,
}));
vi.mock("next/cache", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/cache")>()), revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: (path: string): never => { throw new Error(`REDIRECT:${path}`); } }));
vi.mock("next/server", () => ({ after: (run: () => unknown) => run() }));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn().mockResolvedValue("$new$"), compare: vi.fn().mockResolvedValue(true) } }));
vi.mock("@/lib/platform/repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/platform/repository")>()),
  addPlayer: mocks.addPlayer,
  updatePlayer: mocks.updatePlayer,
  deletePlayer: mocks.deletePlayer,
  setTeamCaptainDisplay: mocks.setTeamCaptainDisplay,
  assertCaptainCanSubmitStats: mocks.assertCaptainCanSubmitStats,
  getPlayerStatFormContext: mocks.getPlayerStatFormContext,
  upsertStatSubmission: mocks.upsertStatSubmission,
  getUserPasswordHashById: mocks.getUserPasswordHashById,
  updateCaptainPassword: mocks.updateCaptainPassword,
  registerTeam: mocks.registerTeam,
  createCaptainWithTeam: mocks.createCaptainWithTeam,
  saveCaptainDraftTeam: mocks.saveDraftTeam,
}));

import {
  captainAddPlayerAction,
  captainDeletePlayerAction,
  captainRegisterTeamAction,
  captainSaveDraftTeamAction,
  captainSetDisplayCaptainAction,
  captainSubmitStatsAction,
  captainUpdatePlayerAction,
  captainUploadPaymentProofAction,
  captainUploadTeamLogoAction,
  changePasswordAction,
} from "@/lib/actions";

const captain = { id: "captain-1", email: "c@test.local", name: "Captain", role: "captain" };
const owner = { id: "player-1", email: "p@test.local", name: "Bima", role: "player" };
const plainPlayer = { id: "player-2", email: "q@test.local", name: "Sari", role: "player" };
const organizer = { id: "org-1", email: "o@test.local", name: "Org", role: "organizer" };

type Account = { id: string; role: string } | null;

/** Signs in as `account`, as the real `requireRole` answers: only for the role that was asked for. */
function signIn(account: Account, ownsTeam = false) {
  mocks.requireRole.mockImplementation(async (role: string) => (account && account.role === role ? account : null));
  mocks.teamCount.mockResolvedValue(ownsTeam ? 1 : 0);
}

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

const ids = { teamId: "team-a", playerId: "player-row", matchId: "match-1", eventId: "event-1", requestId: "request-1" };

/** Every captain action, called with a form that would succeed for the right person. */
const OWNER_ACTIONS: ReadonlyArray<[string, () => Promise<unknown>, () => ReturnType<typeof vi.fn>]> = [
  ["add a player", () => captainAddPlayerAction(form({ teamId: ids.teamId, displayName: "UID-1", nickname: "Ace" })), () => mocks.addPlayer],
  ["edit a player", () => captainUpdatePlayerAction(form({ playerId: ids.playerId, displayName: "UID-1", nickname: "Ace" })), () => mocks.updatePlayer],
  ["delete a player", () => captainDeletePlayerAction(form({ playerId: ids.playerId })), () => mocks.deletePlayer],
  ["set the display captain", () => captainSetDisplayCaptainAction(form({ teamId: ids.teamId, playerId: ids.playerId })), () => mocks.setTeamCaptainDisplay],
  ["upload the team logo", () => captainUploadTeamLogoAction(form({ teamId: ids.teamId })), () => mocks.teamFindFirst],
  ["submit match stats", () => captainSubmitStatsAction(form({ matchId: ids.matchId, teamId: ids.teamId, eventId: ids.eventId })), () => mocks.assertCaptainCanSubmitStats],
];

const CAPTAIN_ONLY_ACTIONS: ReadonlyArray<[string, () => Promise<unknown>]> = [
  ["register a team", () => captainRegisterTeamAction(form({ eventId: ids.eventId, name: "Team A", tag: "TA" }))],
  ["save a draft team", () => captainSaveDraftTeamAction(form({ name: "Team A", tag: "TA" }))],
  ["upload a team's payment proof", () => captainUploadPaymentProofAction(form({ requestId: ids.requestId, eventId: ids.eventId }))],
];

async function outcome(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return "done";
  } catch (error) {
    const message = (error as Error).message;
    return message.startsWith("REDIRECT:") ? message : `error:${message}`;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkRateLimit.mockResolvedValue(true);
  mocks.teamFindFirst.mockResolvedValue(null);
  mocks.assertCaptainCanSubmitStats.mockResolvedValue(undefined);
  mocks.getPlayerStatFormContext.mockResolvedValue({ allowedStatKeys: [], scoreGameNumbers: null });
  mocks.upsertStatSubmission.mockResolvedValue(undefined);
  mocks.getUserPasswordHashById.mockResolvedValue("$old$");
  for (const name of ["addPlayer", "updatePlayer", "deletePlayer", "setTeamCaptainDisplay", "updateCaptainPassword"] as const) {
    mocks[name].mockResolvedValue(undefined);
  }
});

describe.each(OWNER_ACTIONS)("%s", (_name, run, guarded) => {
  it("works for a captain, as the captain", async () => {
    signIn(captain);
    await outcome(run);
    expect(guarded()).toHaveBeenCalled();
    expect(JSON.stringify(guarded().mock.calls)).toContain("captain-1");
  });

  it("works for a player who captains a team, as that player, and only after checking they own a team", async () => {
    signIn(owner, true);
    await outcome(run);
    expect(guarded()).toHaveBeenCalled();
    expect(JSON.stringify(guarded().mock.calls)).toContain("player-1");
    expect(mocks.teamCount).toHaveBeenCalledWith({ where: { captainId: "player-1" } });
  });

  it("is refused for a player who captains no team", async () => {
    signIn(plainPlayer, false);
    await expect(outcome(run)).resolves.toBe("REDIRECT:/login");
    expect(guarded()).not.toHaveBeenCalled();
  });

  it.each([["an organizer", organizer], ["nobody signed in", null]])("is refused for %s", async (_who, account) => {
    signIn(account, true);
    await expect(outcome(run)).resolves.toBe("REDIRECT:/login");
    expect(guarded()).not.toHaveBeenCalled();
  });
});

describe.each(CAPTAIN_ONLY_ACTIONS)("%s", (_name, run) => {
  it.each([
    ["a player who captains a team", owner, true],
    ["a player who captains nothing", plainPlayer, false],
    ["an organizer", organizer, false],
    ["nobody signed in", null, false],
  ] as const)("is refused for %s", async (_who, account, ownsTeam) => {
    signIn(account, ownsTeam);
    await expect(outcome(run)).resolves.toBe("REDIRECT:/login");
    expect(mocks.registerTeam).not.toHaveBeenCalled();
    expect(mocks.createCaptainWithTeam).not.toHaveBeenCalled();
    expect(mocks.saveDraftTeam).not.toHaveBeenCalled();
    expect(mocks.teamCount).not.toHaveBeenCalled();
  });

  it("is not refused at the gate for a captain", async () => {
    signIn(captain);
    expect(await outcome(run)).not.toBe("REDIRECT:/login");
  });
});

describe("changing the password", () => {
  const change = (newPassword = "a-new-password", confirmPassword = newPassword) =>
    changePasswordAction(form({ currentPassword: "old-password", newPassword, confirmPassword }));

  it("takes a captain back to the captain pages", async () => {
    signIn(captain);
    await expect(outcome(() => change())).resolves.toBe("REDIRECT:/captain?success=password-changed");
    expect(mocks.updateCaptainPassword).toHaveBeenCalledWith("captain-1", "$new$");
    // The device that changed it keeps a session; the others are ended by the new session version.
    expect(mocks.reissueSession).toHaveBeenCalledWith("captain-1");
    await expect(outcome(() => change("a-new-password", "different"))).resolves.toContain("REDIRECT:/captain/settings?error=");
  });

  it("sends the device to sign in again when the new session cannot be made, instead of an error page", async () => {
    signIn(captain);
    mocks.reissueSession.mockResolvedValueOnce(false);
    await expect(outcome(() => change())).resolves.toBe("REDIRECT:/login");
    mocks.reissueSession.mockRejectedValueOnce(new Error("db down"));
    await expect(outcome(() => change())).resolves.toBe("REDIRECT:/login");
    expect(mocks.updateCaptainPassword).toHaveBeenCalledTimes(2);
  });

  it("takes any player to the player pages, whether or not they captain a team", async () => {
    for (const ownsTeam of [true, false]) {
      signIn(owner, ownsTeam);
      await expect(outcome(() => change())).resolves.toBe("REDIRECT:/player?success=password-changed");
      await expect(outcome(() => change("a-new-password", "different"))).resolves.toContain("REDIRECT:/player/settings?error=");
    }
    expect(mocks.updateCaptainPassword).toHaveBeenCalledWith("player-1", "$new$");
  });

  it.each([["an organizer", organizer], ["nobody signed in", null]])("is refused for %s", async (_who, account) => {
    signIn(account);
    await expect(outcome(() => change())).resolves.toBe("REDIRECT:/login");
    expect(mocks.updateCaptainPassword).not.toHaveBeenCalled();
  });

  it("stops guessing of the current password, for a captain and for a player", async () => {
    mocks.checkRateLimit.mockResolvedValue(false);
    for (const account of [captain, owner]) {
      signIn(account, true);
      const result = await outcome(() => change());
      expect(result).toContain("Terlalu%20banyak%20percobaan");
    }
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("change-password:player-1", 5, 15 * 60 * 1000);
    expect(mocks.updateCaptainPassword).not.toHaveBeenCalled();
  });
});
