// Moved out of lib/actions.test.ts without changes (refactor Phase 4).

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  addPlayer,
  approveEventVisualAsset,
  approveStatSubmission,
  approveTeamRegistrationRequest,
  assertCaptainCanSubmitStats,
  assertUserCanManageEvent,
  assertUserCanManageTeam,
  assertUserCanReviewStatSubmission,
  autoTransitionEventToOngoing,
  blobPut,
  createCaptainAccount,
  createOrUpdateCaptainDraftTeam,
  createEvent,
  createEventVisualAsset,
  createPasswordResetToken,
  consumePasswordResetToken,
  equalizePasswordResetResponse,
  createTeamRegistrationRequest,
  deletePlayer,
  getImportSnapshot,
  getEventsByIds,
  getOrganizerUserById,
  getPlayerStatFormContext,
  getPublishedEvents,
  getUserByEmail,
  getUserPasswordHashById,
  generateCertificate,
  generateCertificateIfFinal,
  importTeams,
  listEventVisualAssets,
  rejectEventVisualAsset,
  rejectStatSubmission,
  rejectTeamRegistrationRequest,
  registerTeam,
  revalidatePath,
  revalidateTag,
  requireRole,
  sendEmail,
  publishEvent,
  setEventStatus,
  setEventVisualFocalPoint,
  setMatchGames,
  setMatchResult,
  signIn,
  signOut,
  headers,
  after,
  checkRateLimit,
  updateCaptainPassword,
  updateEventBrandAssets,
  updatePaymentSettings,
  updateTeamRegistrationProof,
  updateEventStream,
  updateCaptainTeamLogo,
  updateTeamLogo,
  updatePlayer,
  updateEventCertificateAssets,
  updateEventPublicInfo,
  upsertRoundConfig,
  upsertStatSubmission,
  adminWriteMatchPlayerStats,
  setTeamCaptainDisplay,
  previewRegistrationImportForUser,
  commitRegistrationImportForUser,
  prisma,
} = vi.hoisted(() => ({
  addPlayer: vi.fn(),
  approveEventVisualAsset: vi.fn(),
  approveStatSubmission: vi.fn(),
  approveTeamRegistrationRequest: vi.fn(),
  assertCaptainCanSubmitStats: vi.fn(),
  assertUserCanManageEvent: vi.fn(),
  assertUserCanManageTeam: vi.fn(),
  assertUserCanReviewStatSubmission: vi.fn(),
  autoTransitionEventToOngoing: vi.fn(),
  blobPut: vi.fn(),
  createCaptainAccount: vi.fn(),
  createOrUpdateCaptainDraftTeam: vi.fn(),
  createEvent: vi.fn(),
  createEventVisualAsset: vi.fn(),
  createPasswordResetToken: vi.fn(),
  consumePasswordResetToken: vi.fn(),
  equalizePasswordResetResponse: vi.fn(async (operation: () => Promise<unknown>) => operation()),
  createTeamRegistrationRequest: vi.fn(),
  deletePlayer: vi.fn(),
  getImportSnapshot: vi.fn(),
  getEventsByIds: vi.fn(),
  getOrganizerUserById: vi.fn(),
  getPlayerStatFormContext: vi.fn(),
  getPublishedEvents: vi.fn(),
  getUserByEmail: vi.fn(),
  getUserPasswordHashById: vi.fn(),
  generateCertificate: vi.fn(),
  generateCertificateIfFinal: vi.fn(),
  importTeams: vi.fn(),
  listEventVisualAssets: vi.fn(),
  rejectEventVisualAsset: vi.fn(),
  rejectStatSubmission: vi.fn(),
  rejectTeamRegistrationRequest: vi.fn(),
  registerTeam: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  requireRole: vi.fn(),
  sendEmail: vi.fn(),
  publishEvent: vi.fn(),
  setEventStatus: vi.fn(),
  setEventVisualFocalPoint: vi.fn(),
  setMatchGames: vi.fn(),
  setMatchResult: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  headers: vi.fn(),
  after: vi.fn(),
  checkRateLimit: vi.fn().mockReturnValue(true),
  updateCaptainPassword: vi.fn(),
  updateEventBrandAssets: vi.fn(),
  updatePaymentSettings: vi.fn(),
  updateTeamRegistrationProof: vi.fn(),
  updateEventStream: vi.fn(),
  updateCaptainTeamLogo: vi.fn(),
  updateTeamLogo: vi.fn(),
  updatePlayer: vi.fn(),
  updateEventCertificateAssets: vi.fn(),
  updateEventPublicInfo: vi.fn(),
  upsertRoundConfig: vi.fn(),
  upsertStatSubmission: vi.fn(),
  adminWriteMatchPlayerStats: vi.fn(),
  setTeamCaptainDisplay: vi.fn(),
  previewRegistrationImportForUser: vi.fn(),
  commitRegistrationImportForUser: vi.fn(),
  prisma: {
    event: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    match: { findFirst: vi.fn() },
    team: { findFirst: vi.fn(), findUnique: vi.fn(), delete: vi.fn(), update: vi.fn() },
    teamRegistrationRequest: { findFirst: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("next/cache", () => ({ revalidatePath, revalidateTag }));
vi.mock("next/server", () => ({ after }));
vi.mock("next/navigation", () => ({
  redirect: (url: string): never => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("next/headers", () => ({ headers }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit }));
vi.mock("@/lib/auth/session", () => ({ requireRole, signIn, signOut }));
vi.mock("@/lib/actions/registration-v3-actions", () => ({ previewRegistrationImportForUser, commitRegistrationImportForUser }));
vi.mock("@/lib/imports/team-import", () => ({
  parseAndValidateTeamImport: vi.fn(),
}));
vi.mock("@vercel/blob", () => ({ put: blobPut }));
vi.mock("@/lib/bracket/repository", () => ({
  setMatchResult,
}));
vi.mock("@/lib/bracket/rounds-repository", () => ({
  setMatchGames,
  upsertRoundConfig,
}));
vi.mock("@/lib/events/repository", () => ({
  autoTransitionEventToOngoing,
  createEvent,
  getEventsByIds,
  getPublishedEvents,
  setEventStatus,
  updateEventPublicInfo,
  updateEventStream,
}));
vi.mock("@/lib/events/visual-repository", () => ({
  approveEventVisualAsset,
  createEventVisualAsset,
  listEventVisualAssets,
  rejectEventVisualAsset,
  setEventVisualFocalPoint,
  updateEventBrandAssets,
  updateEventCertificateAssets,
}));
const { findAssignableCaptain, getTeamEventRef, setTeamCaptain } = vi.hoisted(() => ({
  findAssignableCaptain: vi.fn(),
  getTeamEventRef: vi.fn(),
  setTeamCaptain: vi.fn(),
}));
vi.mock("@/lib/identity/repository", () => ({
  createCaptainAccount,
  findAssignableCaptain,
  setTeamCaptain,
  getOrganizerUserById,
  getUserByEmail,
  getUserPasswordHashById,
  updateCaptainPassword,
}));
vi.mock("@/lib/imports/repository", () => ({
  getImportSnapshot,
  importTeams,
}));
vi.mock("@/lib/platform/settings-repository", () => ({
  updatePaymentSettings,
}));
vi.mock("@/lib/platform/shared/authz", () => ({
  assertUserCanManageEvent,
  assertUserCanManageTeam,
  assertUserCanReviewStatSubmission,
}));
vi.mock("@/lib/player-stats/repository", () => ({
  assertCaptainCanSubmitStats,
  getPlayerStatFormContext,
}));
vi.mock("@/lib/player-stats/write-repository", () => ({
  approveStatSubmission,
  rejectStatSubmission,
  upsertStatSubmission,
  adminWriteMatchPlayerStats,
}));
vi.mock("@/lib/registration/repository", () => ({
  createOrUpdateCaptainDraftTeam,
  createTeamRegistrationRequest,
  registerTeam,
  updateTeamRegistrationProof,
}));
vi.mock("@/lib/registration/review-repository", () => ({
  approveTeamRegistrationRequest,
  rejectTeamRegistrationRequest,
}));
vi.mock("@/lib/teams/repository", () => ({
  getTeamEventRef,
  addPlayer,
  deletePlayer,
  updateCaptainTeamLogo,
  updateTeamLogo,
  updatePlayer,
  setTeamCaptainDisplay,
}));
vi.mock("@/lib/platform/db", () => ({ prisma }));
vi.mock("@/lib/certificate/generate", () => ({
  generateCertificate,
  generateCertificateIfFinal,
}));
vi.mock("@/lib/platform/password-reset", () => ({
  createPasswordResetToken,
  consumePasswordResetToken,
  equalizePasswordResetResponse,
}));
vi.mock("@/lib/events/publish-readiness", () => ({ publishEvent }));
vi.mock("@/lib/email/send", () => ({
  sendEmail,
}));
vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("$hashed$"),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

import { adminApproveStatAction, adminRejectStatAction, adminSetMatchGamesAction, adminSetRoundConfigAction, adminUpdateMatchResultAction, captainSubmitStatsAction } from "@/lib/actions/match-actions";

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function fd(pairs: Record<string, string | File>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(pairs)) f.set(k, v);
  return f;
}

function adminSession() {
  return { id: "admin-1", role: "platform_admin" as const, email: "admin@test.com", name: "Admin" };
}

function organizerSession() {
  return { id: "organizer-1", role: "organizer" as const, email: "org@test.com", name: "Organizer One" };
}

function captainSession() {
  return { id: "captain-1", role: "captain" as const, email: "cap@test.com", name: "Captain" };
}

// ────────────────────────────────────────────────────────────
// loginAction
// ────────────────────────────────────────────────────────────

beforeEach(() => {
  assertUserCanManageEvent.mockResolvedValue(undefined);
  assertUserCanReviewStatSubmission.mockResolvedValue(undefined);
  headers.mockResolvedValue(new Headers({ "x-forwarded-for": "127.0.0.1" }));
});

// ────────────────────────────────────────────────────────────
// Event visual revision actions (organizer upload + approval)
// ────────────────────────────────────────────────────────────

/** A real 16×9 PNG so `sharp` can decode it and report genuine dimensions. */

// ───────────────────────────────────────────────────────
// Revalidation after a successful action (refactor PR 0.7)
// ───────────────────────────────────────────────────────
//
// Each row runs one action down its success path and checks exactly which cached pages it refreshes. These are the
// actions that had no test of their revalidation. src/lib/revalidation-map.test.ts guards the revalidate calls in the
// code of every action; these rows prove the calls run.

// ────────────────────────────────────────────────────────────
// adminUpdateMatchResultAction
// ────────────────────────────────────────────────────────────

describe("organizer legacy match roundtrip", () => {
  beforeEach(() => { vi.clearAllMocks(); requireRole.mockResolvedValue(organizerSession()); });
  it("returns result success to the scoped organizer route and ignores supplied return URLs", async () => {
    setMatchResult.mockResolvedValue({ id: "m1", roundLabel: "Round 1" });
    await expect(adminUpdateMatchResultAction(fd({ eventId: "e1", matchEventId: "other", matchId: "m1", homeScore: "2", awayScore: "0", locale: "en", returnTo: "https://evil.example" }))).rejects.toThrow("REDIRECT:/en/organizer/events/e1/legacy-match-day?matchId=m1&success=match-result-updated");
    expect(setMatchResult).toHaveBeenCalledWith({ eventId: "e1", matchId: "m1", homeScore: 2, awayScore: 0 });
  });
  it("returns failed results to the same scoped match", async () => {
    setMatchResult.mockRejectedValueOnce(new Error("Score rejected"));
    await expect(adminUpdateMatchResultAction(fd({ eventId: "e1", matchEventId: "e1", matchId: "m1", homeScore: "2", awayScore: "0" }))).rejects.toThrow("REDIRECT:/organizer/events/e1/legacy-match-day?matchId=m1&error=Score%20rejected");
  });
  it("returns series configuration success to organizer operations", async () => {
    await expect(adminSetRoundConfigAction(fd({ eventId: "e1", roundLabel: "Round 1", bestOf: "3", locale: "en" }))).rejects.toThrow("REDIRECT:/en/organizer/events/e1/legacy-match-day?success=round-config-saved");
  });
  it("returns a rejected series configuration to organizer operations", async () => {
    upsertRoundConfig.mockRejectedValueOnce(new Error("Configuration locked"));
    await expect(adminSetRoundConfigAction(fd({ eventId: "e1", roundLabel: "Round 1", bestOf: "3" }))).rejects.toThrow("REDIRECT:/organizer/events/e1/legacy-match-day?error=Configuration%20locked");
  });
  it("returns series results and validation errors to organizer operations", async () => {
    await expect(adminSetMatchGamesAction(fd({ matchEventId: "e1", matchId: "m1", bestOf: "3", locale: "en", game1_home: "2", game1_away: "0", game2_home: "2", game2_away: "0" }))).rejects.toThrow("REDIRECT:/en/organizer/events/e1/legacy-match-day?matchId=m1&success=match-games-saved");
    await expect(adminSetMatchGamesAction(fd({ matchEventId: "e1", matchId: "m1", bestOf: "3" }))).rejects.toThrow("REDIRECT:/organizer/events/e1/legacy-match-day?matchId=m1&error=Masukkan+skor+minimal+1+game.");
  });
  it("rejects cross-event writes before reaching repository mutations", async () => {
    assertUserCanManageEvent.mockRejectedValue(new Error("Forbidden event"));
    for (const action of [adminUpdateMatchResultAction, adminSetRoundConfigAction, adminSetMatchGamesAction]) {
      await expect(action(fd({ eventId: "other", matchEventId: "other", matchId: "match-b", roundLabel: "Round 1", bestOf: "3", homeScore: "2", awayScore: "0" }))).rejects.toThrow("Forbidden event");
    }
    expect(setMatchResult).not.toHaveBeenCalled(); expect(upsertRoundConfig).not.toHaveBeenCalled(); expect(setMatchGames).not.toHaveBeenCalled();
  });
});

describe("adminUpdateMatchResultAction", () => {
  function resultFormData() {
    const formData = new FormData();
    formData.set("eventId", "event-kuroko-summer");
    formData.set("matchEventId", "event-kuroko-summer");
    formData.set("matchId", "match-kuroko-1");
    formData.set("homeScore", "21");
    formData.set("awayScore", "18");
    return formData;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    requireRole.mockResolvedValue(adminSession());
  });

  it("requires an admin session before changing match results", async () => {
    requireRole.mockResolvedValue(null);

    await expect(adminUpdateMatchResultAction(resultFormData())).rejects.toThrow("REDIRECT:/login");
    expect(setMatchResult).not.toHaveBeenCalled();
  });

  it("preserves the success redirect after saving a match result", async () => {
    setMatchResult.mockReturnValue({ id: "match-kuroko-1", roundLabel: "Quarterfinal", winnerTeamId: "team-away" });

    await expect(adminUpdateMatchResultAction(resultFormData())).rejects.toThrow(
      "REDIRECT:/admin?phase=run&matchEventId=event-kuroko-summer&success=match-result-updated",
    );
    expect(requireRole).toHaveBeenCalledWith("platform_admin");
    expect(autoTransitionEventToOngoing).toHaveBeenCalledWith("event-kuroko-summer");
    expect(generateCertificateIfFinal).not.toHaveBeenCalled();
    expect(revalidateTag).toHaveBeenCalledWith("events");
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("generates a certificate only after saving a final match result", async () => {
    setMatchResult.mockReturnValue({ id: "match-final", roundLabel: "Final", winnerTeamId: "team-home" });

    await expect(adminUpdateMatchResultAction(resultFormData())).rejects.toThrow(
      "REDIRECT:/admin?phase=run&matchEventId=event-kuroko-summer&success=match-result-updated",
    );

    expect(generateCertificateIfFinal).toHaveBeenCalledWith("match-final", "event-kuroko-summer");
  });

  it("preserves the not-found redirect when the match is missing", async () => {
    setMatchResult.mockReturnValue(null);

    await expect(adminUpdateMatchResultAction(resultFormData())).rejects.toThrow(
      "REDIRECT:/admin?matchEventId=event-kuroko-summer&error=Match%20not%20found.",
    );
  });
});
describe("captainSubmitStatsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRole.mockResolvedValue(captainSession());
    getPlayerStatFormContext.mockResolvedValue({
      match: { id: "match-1", eventId: "event-1", status: "Completed", homeTeamId: "team-1", awayTeamId: "team-2" },
      allowedStatKeys: ["goals", "assists"],
      scoreGameNumbers: null,
    });
  });

  it("requires a captain session", async () => {
    requireRole.mockResolvedValue(null);
    await expect(
      captainSubmitStatsAction(fd({ matchId: "m1", teamId: "t1", eventId: "e1" })),
    ).rejects.toThrow("REDIRECT:/login");
  });

  it("parses stat keys and calls upsertStatSubmission", async () => {
    const f = new FormData();
    f.set("matchId", "match-1");
    f.set("teamId", "team-1");
    f.set("eventId", "event-1");
    f.set("stat_player-1_goals", "3");
    f.set("stat_player-1_assists", "1");
    f.set("stat_player-2_goals", "2");

    await captainSubmitStatsAction(f);

    expect(assertCaptainCanSubmitStats).toHaveBeenCalledWith({
      captainId: "captain-1",
      eventId: "event-1",
      matchId: "match-1",
      teamId: "team-1",
    });
    expect(upsertStatSubmission).toHaveBeenCalledWith({
      matchId: "match-1",
      teamId: "team-1",
      eventId: "event-1",
      submittedBy: "captain-1",
      stats: {
        "player-1": { goals: 3, assists: 1 },
        "player-2": { goals: 2 },
      },
    });
  });

  it("persists canonical Flashpeak scores and stats in one captain submission payload", async () => {
    getPlayerStatFormContext.mockResolvedValue({
      match: { id: "match-1", eventId: "event-1", status: "Completed", homeTeamId: "team-1", awayTeamId: "team-2" },
      allowedStatKeys: ["goal", "assist", "passing", "defense"],
      scoreGameNumbers: [1, 2, 3],
    });
    const f = fd({ matchId: "match-1", teamId: "team-1", eventId: "event-1" });
    f.set("score_player-1_1", "7.6");
    f.set("score_player-1_2", "");
    f.set("score_player-1_3", "8.1");
    f.set("stat_player-1_goal", "3");
    f.set("stat_player-1_assist", "4");
    f.set("stat_player-1_passing", "28");
    f.set("stat_player-1_defense", "12");

    await captainSubmitStatsAction(f);

    expect(upsertStatSubmission).toHaveBeenCalledWith(expect.objectContaining({
      stats: {
        "player-1": {
          scores: [7.6, null, 8.1],
          goal: 3,
          assist: 4,
          passing: 28,
          defense: 12,
        },
      },
    }));
  });

  it("blocks manipulated team or match identifiers before persisting stats", async () => {
    assertCaptainCanSubmitStats.mockRejectedValue(new Error("Not authorized"));
    const f = new FormData();
    f.set("matchId", "match-owned-by-other-captain");
    f.set("teamId", "team-owned-by-other-captain");
    f.set("eventId", "event-1");
    f.set("stat_player-1_goals", "3");

    await expect(captainSubmitStatsAction(f)).rejects.toThrow("Not authorized");
    expect(upsertStatSubmission).not.toHaveBeenCalled();
  });

  it("rejects missing required match identifiers before persisting stats", async () => {
    const f = new FormData();
    f.set("matchId", "match-1");
    f.set("teamId", "team-1");
    f.set("stat_player-1_goals", "3");

    await expect(captainSubmitStatsAction(f)).rejects.toThrow();
    expect(upsertStatSubmission).not.toHaveBeenCalled();
  });

  it("rejects negative stat values before they can reach leaderboard review", async () => {
    const f = new FormData();
    f.set("matchId", "match-1");
    f.set("teamId", "team-1");
    f.set("eventId", "event-1");
    f.set("stat_player-1_goals", "-999");

    await expect(captainSubmitStatsAction(f)).rejects.toThrow();
    expect(upsertStatSubmission).not.toHaveBeenCalled();
  });

  it("rejects unreasonably large stat values before persisting", async () => {
    const f = new FormData();
    f.set("matchId", "match-1");
    f.set("teamId", "team-1");
    f.set("eventId", "event-1");
    f.set("stat_player-1_goals", "1000000000");

    await expect(captainSubmitStatsAction(f)).rejects.toThrow();
    expect(upsertStatSubmission).not.toHaveBeenCalled();
  });

  it("rejects malformed stat field names instead of creating attacker-controlled keys", async () => {
    const f = new FormData();
    f.set("matchId", "match-1");
    f.set("teamId", "team-1");
    f.set("eventId", "event-1");
    f.set("stat_../../player_goals", "3");
    f.set("stat_player-1_<script>", "4");

    await expect(captainSubmitStatsAction(f)).rejects.toThrow();
    expect(upsertStatSubmission).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────
// adminApproveStatAction
// ────────────────────────────────────────────────────────────

describe("adminApproveStatAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRole.mockResolvedValue(adminSession());
  });

  it("requires an admin session", async () => {
    requireRole.mockResolvedValue(null);
    await expect(adminApproveStatAction(fd({ submissionId: "sub-1" }))).rejects.toThrow(
      "REDIRECT:/login",
    );
  });

  it("approves submission and redirects to /admin?success=stat-approved", async () => {
    await expect(adminApproveStatAction(fd({ submissionId: "sub-1" }))).rejects.toThrow(
      "REDIRECT:/admin?success=stat-approved",
    );
    expect(approveStatSubmission).toHaveBeenCalledWith("sub-1", "admin-1");
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});

// ────────────────────────────────────────────────────────────
// adminRejectStatAction
// ────────────────────────────────────────────────────────────

describe("adminRejectStatAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRole.mockResolvedValue(adminSession());
  });

  it("requires an admin session", async () => {
    requireRole.mockResolvedValue(null);
    await expect(
      adminRejectStatAction(fd({ submissionId: "sub-1", rejectionNote: "Invalid stats" })),
    ).rejects.toThrow("REDIRECT:/login");
  });

  it("rejects submission with provided note", async () => {
    await expect(
      adminRejectStatAction(fd({ submissionId: "sub-1", rejectionNote: "Please recheck goals" })),
    ).rejects.toThrow("REDIRECT:/admin?success=stat-rejected");
    expect(rejectStatSubmission).toHaveBeenCalledWith("sub-1", "admin-1", "Please recheck goals");
  });

  it("uses default note when rejectionNote is empty", async () => {
    await expect(
      adminRejectStatAction(fd({ submissionId: "sub-1", rejectionNote: "" })),
    ).rejects.toThrow("REDIRECT:/admin?success=stat-rejected");
    expect(rejectStatSubmission).toHaveBeenCalledWith("sub-1", "admin-1", "Please review and resubmit.");
  });
});

// ────────────────────────────────────────────────────────────
// adminSetRoundConfigAction
// ────────────────────────────────────────────────────────────

describe("adminSetRoundConfigAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRole.mockResolvedValue(adminSession());
  });

  it("requires an admin session", async () => {
    requireRole.mockResolvedValue(null);
    await expect(
      adminSetRoundConfigAction(fd({ eventId: "e1", roundLabel: "Final", bestOf: "3" })),
    ).rejects.toThrow("REDIRECT:/login");
  });

  it("saves round config and redirects on success", async () => {
    await expect(
      adminSetRoundConfigAction(fd({ eventId: "event-1", roundLabel: "Semifinal", bestOf: "3" })),
    ).rejects.toThrow("REDIRECT:/admin?phase=run&matchEventId=event-1&success=round-config-saved");
    expect(upsertRoundConfig).toHaveBeenCalledWith("event-1", "Semifinal", 3);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("throws Zod error for bestOf value other than 1, 3, or 5", async () => {
    await expect(
      adminSetRoundConfigAction(fd({ eventId: "e1", roundLabel: "Final", bestOf: "2" })),
    ).rejects.toThrow();
    expect(upsertRoundConfig).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────
// adminSetMatchGamesAction
// ────────────────────────────────────────────────────────────

describe("adminSetMatchGamesAction", () => {
  function bo3FormData(overrides?: Record<string, string>) {
    return fd({
      matchId: "match-1",
      matchEventId: "event-1",
      bestOf: "3",
      game1_home: "21",
      game1_away: "15",
      game2_home: "10",
      game2_away: "21",
      game3_home: "21",
      game3_away: "18",
      ...overrides,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    requireRole.mockResolvedValue(adminSession());
  });

  it("requires an admin session", async () => {
    requireRole.mockResolvedValue(null);
    await expect(adminSetMatchGamesAction(bo3FormData())).rejects.toThrow("REDIRECT:/login");
  });

  it("saves game scores and redirects with success", async () => {
    await expect(adminSetMatchGamesAction(bo3FormData())).rejects.toThrow(
      "REDIRECT:/admin?phase=run&matchEventId=event-1&success=match-games-saved",
    );
    expect(setMatchGames).toHaveBeenCalledWith(
      "match-1",
      "event-1",
      [
        { gameNumber: 1, homeScore: 21, awayScore: 15 },
        { gameNumber: 2, homeScore: 10, awayScore: 21 },
        { gameNumber: 3, homeScore: 21, awayScore: 18 },
      ],
    );
    expect(autoTransitionEventToOngoing).toHaveBeenCalledWith("event-1");
    expect(revalidateTag).toHaveBeenCalledWith("teams");
    expect(revalidateTag).toHaveBeenCalledWith("events");
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("redirects with error when no games are entered", async () => {
    await expect(
      adminSetMatchGamesAction(fd({ matchId: "m1", matchEventId: "e1", bestOf: "3" })),
    ).rejects.toThrow("REDIRECT:/admin?matchEventId=e1&error=Masukkan+skor+minimal+1+game.");
    expect(setMatchGames).not.toHaveBeenCalled();
  });

  it("skips empty game rows (partial BO5)", async () => {
    const f = fd({
      matchId: "match-1",
      matchEventId: "event-1",
      bestOf: "5",
      game1_home: "21",
      game1_away: "15",
      game2_home: "10",
      game2_away: "21",
      // game3 omitted (no score yet)
    });
    await expect(adminSetMatchGamesAction(f)).rejects.toThrow("REDIRECT:");
    expect(setMatchGames).toHaveBeenCalledWith(
      "match-1",
      "event-1",
      [
        { gameNumber: 1, homeScore: 21, awayScore: 15 },
        { gameNumber: 2, homeScore: 10, awayScore: 21 },
      ],
    );
  });

  it("validates the hidden best-of hint but never lets it truncate submitted games", async () => {
    await expect(adminSetMatchGamesAction(bo3FormData({ bestOf: "1" }))).rejects.toThrow("REDIRECT:");
    expect(setMatchGames).toHaveBeenCalledWith("match-1", "event-1", [
      { gameNumber: 1, homeScore: 21, awayScore: 15 },
      { gameNumber: 2, homeScore: 10, awayScore: 21 },
      { gameNumber: 3, homeScore: 21, awayScore: 18 },
    ]);
  });

  it.each(["2", "0", "7", "not-a-number"])("rejects invalid client best-of hint %s before a write", async bestOf => {
    await expect(adminSetMatchGamesAction(bo3FormData({ bestOf }))).rejects.toThrow();
    expect(setMatchGames).not.toHaveBeenCalled();
  });

  it("redirects with error when setMatchGames throws", async () => {
    setMatchGames.mockRejectedValue(new Error("Series winner not yet determined"));

    await expect(adminSetMatchGamesAction(bo3FormData())).rejects.toThrow(
      "REDIRECT:/admin?matchEventId=event-1&error=",
    );
  });
});