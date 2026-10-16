import { ZodError } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Characterization tests for adminSaveMatchPlayerStatsAction (lib/actions/match-actions.ts).
// They pin what the action does today, including its quirks; they are not a specification.

const {
  adminWriteMatchPlayerStats,
  assertUserCanManageEvent,
  getPlayerStatFormContext,
  headers,
  requireRole,
  revalidatePath,
  revalidateTag,
} = vi.hoisted(() => ({
  adminWriteMatchPlayerStats: vi.fn(),
  assertUserCanManageEvent: vi.fn(),
  getPlayerStatFormContext: vi.fn(),
  headers: vi.fn(),
  requireRole: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath, revalidateTag, unstable_cache: <T>(fn: T) => fn }));
vi.mock("next/navigation", () => ({
  redirect: (url: string): never => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
// No request scope: redirectToActiveLocale falls back to redirecting to the path as written (no locale prefix).
vi.mock("next/headers", () => ({ headers, cookies: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireRole }));
// The workspace check logs a platform admin access; keep the test output clean.
vi.mock("@/lib/observability/logger", () => ({ writeServerLog: vi.fn() }));
vi.mock("@/lib/bracket/repository", () => ({ setMatchResult: vi.fn() }));
vi.mock("@/lib/bracket/rounds-repository", () => ({ setMatchGames: vi.fn(), upsertRoundConfig: vi.fn() }));
vi.mock("@/lib/events/repository", () => ({ autoTransitionEventToOngoing: vi.fn() }));
vi.mock("@/lib/platform/shared/authz", () => ({
  assertUserCanManageEvent,
  assertUserCanReviewStatSubmission: vi.fn(),
}));
vi.mock("@/lib/player-stats/repository", () => ({
  assertCaptainCanSubmitStats: vi.fn(),
  getPlayerStatFormContext,
}));
vi.mock("@/lib/player-stats/write-repository", () => ({
  adminWriteMatchPlayerStats,
  approveStatSubmission: vi.fn(),
  rejectStatSubmission: vi.fn(),
  upsertStatSubmission: vi.fn(),
}));

import { adminSaveMatchPlayerStatsAction } from "@/lib/actions/match-actions";
import { writeServerLog } from "@/lib/observability/logger";

type TestUser = { id: string; role: "captain" | "organizer" | "platform_admin" | "admin"; email: string; name: string };

const errorUrl = (message: string) => `/admin?phase=run&activeEventId=event-1&matchId=match-1&error=${encodeURIComponent(message)}`;
const SUCCESS_URL = "/admin?phase=run&activeEventId=event-1&matchId=match-1&success=player-stats-saved";

function fd(pairs: Record<string, string | File>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(pairs)) form.set(key, value);
  return form;
}

function validForm(extra: Record<string, string | File> = {}): FormData {
  return fd({ matchId: "match-1", teamId: "team-1", eventId: "event-1", ...extra });
}

function platformAdmin(): TestUser {
  return { id: "admin-1", role: "platform_admin", email: "admin@test.com", name: "Admin" };
}

function organizer(): TestUser {
  return { id: "organizer-1", role: "organizer", email: "org@test.com", name: "Organizer One" };
}

/** Mirrors the real requireRole: the session user is returned only when its role matches the asked role. */
function signInAs(user: TestUser | null) {
  requireRole.mockImplementation(async (role: string) => (user && user.role === role ? user : null));
}

function completedMatchContext(overrides: Record<string, unknown> = {}) {
  return {
    match: { id: "match-1", eventId: "event-1", status: "Completed", homeTeamId: "team-1", awayTeamId: "team-2" },
    allowedStatKeys: ["goal", "assist"],
    scoreGameNumbers: null,
    ...overrides,
  };
}

async function expectRedirect(action: Promise<unknown>, url: string) {
  await expect(action).rejects.toThrow(new Error(`REDIRECT:${url}`));
}

async function rejection(action: Promise<unknown>): Promise<unknown> {
  try {
    await action;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the action to reject, but it resolved.");
}

/** Server log entries this action wrote itself (the redirect helper may log too when there is no request scope). */
function saveFailureLogs() {
  return vi.mocked(writeServerLog).mock.calls.map(([entry]) => entry).filter((entry) => entry.operation === "admin_save_match_player_stats");
}

function expectNothingWritten() {
  expect(adminWriteMatchPlayerStats).not.toHaveBeenCalled();
  expect(revalidateTag).not.toHaveBeenCalled();
  expect(revalidatePath).not.toHaveBeenCalled();
}

describe("adminSaveMatchPlayerStatsAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    headers.mockRejectedValue(new Error("outside of a request scope"));
    signInAs(platformAdmin());
    assertUserCanManageEvent.mockResolvedValue(undefined);
    getPlayerStatFormContext.mockResolvedValue(completedMatchContext());
    adminWriteMatchPlayerStats.mockResolvedValue(undefined);
  });

  describe("session", () => {
    it("redirects to /login when nobody is signed in", async () => {
      signInAs(null);

      await expectRedirect(adminSaveMatchPlayerStatsAction(validForm()), "/login");

      expect(assertUserCanManageEvent).not.toHaveBeenCalled();
      expect(getPlayerStatFormContext).not.toHaveBeenCalled();
      expectNothingWritten();
    });

    it("redirects to /login when the signed-in user is a captain", async () => {
      signInAs({ id: "captain-1", role: "captain", email: "cap@test.com", name: "Captain" });

      await expectRedirect(adminSaveMatchPlayerStatsAction(validForm()), "/login");

      expect(assertUserCanManageEvent).not.toHaveBeenCalled();
      expectNothingWritten();
    });

    it("asks for platform_admin first, then organizer, then admin", async () => {
      signInAs(null);

      await expectRedirect(adminSaveMatchPlayerStatsAction(validForm()), "/login");

      expect(requireRole.mock.calls.map(([role]) => role)).toEqual(["platform_admin", "organizer", "admin"]);
    });

    it("lets an organizer through and records the organizer as the writer", async () => {
      signInAs(organizer());

      await expectRedirect(adminSaveMatchPlayerStatsAction(validForm({ stat_p1_goal: "2", stat_p1_assist: "1" })), SUCCESS_URL);

      expect(assertUserCanManageEvent).toHaveBeenCalledWith(organizer(), "event-1");
      expect(adminWriteMatchPlayerStats).toHaveBeenCalledWith(expect.objectContaining({ adminId: "organizer-1" }));
    });

    it("lets a legacy admin through and records the admin as the writer", async () => {
      const legacyAdmin: TestUser = { id: "legacy-1", role: "admin", email: "old@test.com", name: "Old Admin" };
      signInAs(legacyAdmin);

      await expectRedirect(adminSaveMatchPlayerStatsAction(validForm({ stat_p1_goal: "2", stat_p1_assist: "1" })), SUCCESS_URL);

      expect(adminWriteMatchPlayerStats).toHaveBeenCalledWith(expect.objectContaining({ adminId: "legacy-1" }));
    });
  });

  describe("id validation", () => {
    it.each(["matchId", "teamId", "eventId"] as const)("throws a validation error when %s is missing", async (field) => {
      const form = validForm();
      form.delete(field);

      const error = await rejection(adminSaveMatchPlayerStatsAction(form));

      expect(error).toBeInstanceOf(ZodError);
      expect(new Set((error as ZodError).issues.map((issue) => issue.path.join(".")))).toEqual(new Set([field]));
      expect(assertUserCanManageEvent).not.toHaveBeenCalled();
      expect(getPlayerStatFormContext).not.toHaveBeenCalled();
      expectNothingWritten();
    });

    it.each(["matchId", "teamId", "eventId"] as const)("throws a validation error when %s is blank", async (field) => {
      const error = await rejection(adminSaveMatchPlayerStatsAction(validForm({ [field]: "   " })));

      expect(error).toBeInstanceOf(ZodError);
      expect(new Set((error as ZodError).issues.map((issue) => issue.path.join(".")))).toEqual(new Set([field]));
      expectNothingWritten();
    });

    it.each([
      ["a slash", "match/1"],
      ["a dot", "match.1"],
      ["a space inside", "match 1"],
      ["an SQL quote", "match-1'; DROP TABLE"],
      ["a query delimiter", "match-1?x=1"],
      ["an emoji", "match-⚽"],
    ])("throws a validation error when an id has %s", async (_label, badId) => {
      const error = await rejection(adminSaveMatchPlayerStatsAction(validForm({ matchId: badId })));

      expect(error).toBeInstanceOf(ZodError);
      expectNothingWritten();
      expect(getPlayerStatFormContext).not.toHaveBeenCalled();
    });

    it("throws a validation error when an id is longer than 128 characters", async () => {
      const error = await rejection(adminSaveMatchPlayerStatsAction(validForm({ teamId: "t".repeat(129) })));

      expect(error).toBeInstanceOf(ZodError);
      expectNothingWritten();
    });

    it("accepts an id of exactly 128 characters", async () => {
      const longTeamId = "t".repeat(128);
      getPlayerStatFormContext.mockResolvedValue(
        completedMatchContext({ match: { id: "match-1", eventId: "event-1", status: "Completed", homeTeamId: longTeamId, awayTeamId: "team-2" } }),
      );

      await expectRedirect(adminSaveMatchPlayerStatsAction(validForm({ teamId: longTeamId })), SUCCESS_URL);

      expect(adminWriteMatchPlayerStats).toHaveBeenCalledWith(expect.objectContaining({ teamId: longTeamId }));
    });

    it("trims whitespace around the ids before using them", async () => {
      await expectRedirect(
        adminSaveMatchPlayerStatsAction(fd({ matchId: " match-1 ", teamId: " team-1 ", eventId: " event-1 " })),
        SUCCESS_URL,
      );

      expect(assertUserCanManageEvent).toHaveBeenCalledWith(platformAdmin(), "event-1");
      expect(getPlayerStatFormContext).toHaveBeenCalledWith("match-1", "event-1");
      expect(adminWriteMatchPlayerStats).toHaveBeenCalledWith(
        expect.objectContaining({ matchId: "match-1", teamId: "team-1", eventId: "event-1" }),
      );
    });
  });

  describe("authorization and match checks", () => {
    it("lets an event authorization failure propagate and does not read or write anything", async () => {
      assertUserCanManageEvent.mockRejectedValue(new Error("Not authorized"));

      await expect(adminSaveMatchPlayerStatsAction(validForm({ stat_p1_goal: "1", stat_p1_assist: "1" }))).rejects.toThrow(
        new Error("Not authorized"),
      );

      expect(assertUserCanManageEvent).toHaveBeenCalledWith(platformAdmin(), "event-1");
      expect(getPlayerStatFormContext).not.toHaveBeenCalled();
      expectNothingWritten();
    });

    it("loads the stat form context for the match and event from the form", async () => {
      await expectRedirect(adminSaveMatchPlayerStatsAction(validForm({ stat_p1_goal: "1", stat_p1_assist: "1" })), SUCCESS_URL);

      expect(getPlayerStatFormContext).toHaveBeenCalledTimes(1);
      expect(getPlayerStatFormContext).toHaveBeenCalledWith("match-1", "event-1");
    });

    it("sends the admin back with a generic message when the context lookup fails (for example a match that is not Completed)", async () => {
      getPlayerStatFormContext.mockRejectedValue(new Error("Completed match not found."));

      await expectRedirect(adminSaveMatchPlayerStatsAction(validForm()), errorUrl("Gagal menyimpan statistik pemain."));

      expectNothingWritten();
    });

    it("sends the admin back with the team message when the team is neither the home nor the away team of the match", async () => {
      await expectRedirect(adminSaveMatchPlayerStatsAction(validForm({ teamId: "team-9" })), errorUrl("Team is not part of this match"));

      expectNothingWritten();
    });

    it("accepts the away team as well as the home team", async () => {
      await expectRedirect(
        adminSaveMatchPlayerStatsAction(validForm({ teamId: "team-2", stat_p2_goal: "0", stat_p2_assist: "3" })),
        SUCCESS_URL,
      );

      expect(adminWriteMatchPlayerStats).toHaveBeenCalledWith(expect.objectContaining({ teamId: "team-2" }));
    });

    it("sends the admin back with the event message when the match belongs to another event than the form says", async () => {
      getPlayerStatFormContext.mockResolvedValue(
        completedMatchContext({ match: { id: "match-1", eventId: "event-OTHER", status: "Completed", homeTeamId: "team-1", awayTeamId: "team-2" } }),
      );

      await expectRedirect(adminSaveMatchPlayerStatsAction(validForm()), errorUrl("Match does not belong to this event"));

      expectNothingWritten();
    });

    it("reports the event problem first when both the event and the team do not match", async () => {
      getPlayerStatFormContext.mockResolvedValue(
        completedMatchContext({ match: { id: "match-1", eventId: "event-OTHER", status: "Completed", homeTeamId: "team-1", awayTeamId: "team-2" } }),
      );

      await expectRedirect(
        adminSaveMatchPlayerStatsAction(validForm({ teamId: "team-9" })),
        errorUrl("Match does not belong to this event"),
      );
    });

    it("does not check the match status itself; it relies on the context lookup", async () => {
      getPlayerStatFormContext.mockResolvedValue(
        completedMatchContext({ match: { id: "match-1", eventId: "event-1", status: "Scheduled", homeTeamId: "team-1", awayTeamId: "team-2" } }),
      );

      await expectRedirect(adminSaveMatchPlayerStatsAction(validForm({ stat_p1_goal: "1", stat_p1_assist: "1" })), SUCCESS_URL);

      expect(adminWriteMatchPlayerStats).toHaveBeenCalledTimes(1);
    });
  });

  describe("stat form parsing", () => {
    it("sends the admin back with the input message and writes nothing when a stat key is not allowed for the game mode", async () => {
      await expectRedirect(adminSaveMatchPlayerStatsAction(validForm({ stat_p1_kills: "3" })), errorUrl("Isian statistik tidak valid. Periksa nilai yang dimasukkan dan coba lagi."));

      expectNothingWritten();
      expect(saveFailureLogs()).toEqual([]);
    });

    it.each([
      ["a negative number", "-1"],
      ["a decimal", "1.5"],
      ["text", "abc"],
      ["a number above 9999", "10000"],
    ])("sends the admin back with the input message and writes nothing when a stat value is %s", async (_label, value) => {
      await expectRedirect(
        adminSaveMatchPlayerStatsAction(validForm({ stat_p1_goal: value, stat_p1_assist: "1" })),
        errorUrl("Isian statistik tidak valid. Periksa nilai yang dimasukkan dan coba lagi."),
      );

      expectNothingWritten();
    });

    it("treats an empty stat value as 0", async () => {
      await expectRedirect(adminSaveMatchPlayerStatsAction(validForm({ stat_p1_goal: "", stat_p1_assist: "2" })), SUCCESS_URL);

      expect(adminWriteMatchPlayerStats).toHaveBeenCalledWith(
        expect.objectContaining({ stats: { p1: { goal: 0, assist: 2 } } }),
      );
    });

    it("sends the admin back with the input message when a stat value is a file instead of text", async () => {
      await expectRedirect(
        adminSaveMatchPlayerStatsAction(validForm({ stat_p1_goal: new File(["1"], "goal.txt"), stat_p1_assist: "1" })),
        errorUrl("Isian statistik tidak valid. Periksa nilai yang dimasukkan dan coba lagi."),
      );

      expectNothingWritten();
    });

    it("sends the admin back with the input message when a score field arrives for a match without score slots", async () => {
      await expectRedirect(adminSaveMatchPlayerStatsAction(validForm({ score_p1_1: "7" })), errorUrl("Isian statistik tidak valid. Periksa nilai yang dimasukkan dan coba lagi."));

      expectNothingWritten();
    });

    it("sends the admin back with the input message when a score slot is missing for a player", async () => {
      getPlayerStatFormContext.mockResolvedValue(completedMatchContext({ scoreGameNumbers: [1, 2] }));

      await expectRedirect(
        adminSaveMatchPlayerStatsAction(validForm({ stat_p1_goal: "1", stat_p1_assist: "1", score_p1_1: "7" })),
        errorUrl("Isian statistik tidak valid. Periksa nilai yang dimasukkan dan coba lagi."),
      );

      expectNothingWritten();
    });

    it("sends the admin back with the input message when a score is above 10", async () => {
      getPlayerStatFormContext.mockResolvedValue(completedMatchContext({ scoreGameNumbers: [1] }));

      await expectRedirect(
        adminSaveMatchPlayerStatsAction(validForm({ stat_p1_goal: "1", stat_p1_assist: "1", score_p1_1: "10.5" })),
        errorUrl("Isian statistik tidak valid. Periksa nilai yang dimasukkan dan coba lagi."),
      );

      expectNothingWritten();
    });

    it("ignores form fields that are not stat_ or score_ fields", async () => {
      await expectRedirect(
        adminSaveMatchPlayerStatsAction(validForm({ stat_p1_goal: "1", stat_p1_assist: "1", note: "hello", locale: "id" })),
        SUCCESS_URL,
      );

      expect(adminWriteMatchPlayerStats).toHaveBeenCalledWith(
        expect.objectContaining({ stats: { p1: { goal: 1, assist: 1 } } }),
      );
    });
  });

  describe("success", () => {
    it("writes the parsed stats for every player with the session user as the writer", async () => {
      const form = validForm({
        stat_p1_goal: "2",
        stat_p1_assist: "1",
        stat_p2_goal: "0",
        stat_p2_assist: "4",
      });

      await expectRedirect(adminSaveMatchPlayerStatsAction(form), SUCCESS_URL);

      expect(adminWriteMatchPlayerStats).toHaveBeenCalledTimes(1);
      expect(adminWriteMatchPlayerStats).toHaveBeenCalledWith({
        matchId: "match-1",
        teamId: "team-1",
        eventId: "event-1",
        adminId: "admin-1",
        stats: {
          p1: { goal: 2, assist: 1 },
          p2: { goal: 0, assist: 4 },
        },
      });
    });

    it("includes the parsed score array for each player when the match has score slots", async () => {
      getPlayerStatFormContext.mockResolvedValue(completedMatchContext({ scoreGameNumbers: [1, 2] }));
      const form = validForm({
        stat_p1_goal: "2",
        stat_p1_assist: "1",
        score_p1_1: "7.5",
        score_p1_2: "",
      });

      await expectRedirect(adminSaveMatchPlayerStatsAction(form), SUCCESS_URL);

      expect(adminWriteMatchPlayerStats).toHaveBeenCalledWith({
        matchId: "match-1",
        teamId: "team-1",
        eventId: "event-1",
        adminId: "admin-1",
        stats: { p1: { scores: [7.5, null], goal: 2, assist: 1 } },
      });
    });

    it("passes the ids of the player stats as they appear in the field names, including underscores", async () => {
      await expectRedirect(
        adminSaveMatchPlayerStatsAction(validForm({ stat_player_one_goal: "5", stat_player_one_assist: "6" })),
        SUCCESS_URL,
      );

      expect(adminWriteMatchPlayerStats).toHaveBeenCalledWith(
        expect.objectContaining({ stats: { player_one: { goal: 5, assist: 6 } } }),
      );
    });

    it("revalidates the stats tag and the whole site layout exactly once each", async () => {
      await expectRedirect(adminSaveMatchPlayerStatsAction(validForm({ stat_p1_goal: "1", stat_p1_assist: "1" })), SUCCESS_URL);

      expect(revalidateTag).toHaveBeenCalledTimes(1);
      expect(revalidateTag).toHaveBeenCalledWith("stats");
      expect(revalidatePath).toHaveBeenCalledTimes(1);
      expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    });

    it("writes the stats before it revalidates", async () => {
      adminWriteMatchPlayerStats.mockImplementation(async () => {
        expect(revalidateTag).not.toHaveBeenCalled();
        expect(revalidatePath).not.toHaveBeenCalled();
      });

      await expectRedirect(adminSaveMatchPlayerStatsAction(validForm({ stat_p1_goal: "1", stat_p1_assist: "1" })), SUCCESS_URL);

      expect(adminWriteMatchPlayerStats).toHaveBeenCalledTimes(1);
      expect(revalidateTag).toHaveBeenCalledTimes(1);
    });

    it("redirects to the run phase of the admin page for this event and match with a success flag", async () => {
      getPlayerStatFormContext.mockResolvedValue(
        completedMatchContext({ match: { id: "m_9", eventId: "e-7", status: "Completed", homeTeamId: "t_1", awayTeamId: "t_2" } }),
      );

      await expectRedirect(
        adminSaveMatchPlayerStatsAction(fd({ matchId: "m_9", teamId: "t_1", eventId: "e-7", stat_p1_goal: "1", stat_p1_assist: "1" })),
        "/admin?phase=run&activeEventId=e-7&matchId=m_9&success=player-stats-saved",
      );
    });

    it("sends an organizer to /admin as well, not to an organizer page", async () => {
      signInAs(organizer());

      await expectRedirect(adminSaveMatchPlayerStatsAction(validForm({ stat_p1_goal: "1", stat_p1_assist: "1" })), SUCCESS_URL);
    });

    it("ignores a locale field in the form and redirects without a locale prefix", async () => {
      await expectRedirect(
        adminSaveMatchPlayerStatsAction(validForm({ locale: "en", stat_p1_goal: "1", stat_p1_assist: "1" })),
        SUCCESS_URL,
      );
    });

    it("calls the write with an empty stats map when the form has no stat fields", async () => {
      await expectRedirect(adminSaveMatchPlayerStatsAction(validForm()), SUCCESS_URL);

      expect(adminWriteMatchPlayerStats).toHaveBeenCalledWith({
        matchId: "match-1",
        teamId: "team-1",
        eventId: "event-1",
        adminId: "admin-1",
        stats: {},
      });
    });
  });

  describe("repository errors", () => {
    it("sends the admin back with a generic message when the write fails, and does not leak the database error", async () => {
      adminWriteMatchPlayerStats.mockRejectedValue(new Error("Invalid `prisma.playerStat.upsert()` invocation: connection reset"));

      await expectRedirect(
        adminSaveMatchPlayerStatsAction(validForm({ stat_p1_goal: "1", stat_p1_assist: "1" })),
        errorUrl("Gagal menyimpan statistik pemain."),
      );
    });

    it("writes a server log for an unexpected write failure, without the database message", async () => {
      adminWriteMatchPlayerStats.mockRejectedValue(new Error("db down"));

      await expectRedirect(adminSaveMatchPlayerStatsAction(validForm({ stat_p1_goal: "1", stat_p1_assist: "1" })), errorUrl("Gagal menyimpan statistik pemain."));

      expect(saveFailureLogs()).toHaveLength(1);
      const entry = saveFailureLogs()[0];
      expect(entry).toMatchObject({ phase: "failed", operation: "admin_save_match_player_stats", route: "/admin", status: 500, errorCode: "Error", resourceId: "event-1" });
      expect(JSON.stringify(entry)).not.toContain("db down");
    });

    it("does not revalidate anything when the write fails", async () => {
      adminWriteMatchPlayerStats.mockRejectedValue(new Error("db down"));

      await expectRedirect(adminSaveMatchPlayerStatsAction(validForm({ stat_p1_goal: "1", stat_p1_assist: "1" })), errorUrl("Gagal menyimpan statistik pemain."));

      expect(revalidateTag).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("shows a message that is safe to read as written, and does not log it", async () => {
      adminWriteMatchPlayerStats.mockRejectedValue(new Error("Not authorized"));

      await expectRedirect(adminSaveMatchPlayerStatsAction(validForm({ stat_p1_goal: "1", stat_p1_assist: "1" })), errorUrl("Not authorized"));

      expect(saveFailureLogs()).toEqual([]);
    });
  });
});
