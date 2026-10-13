// Moved out of lib/actions.test.ts without changes (refactor Phase 4).

import { beforeEach, expect, it, vi } from "vitest";

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

import { adminApprovePaymentAction, adminRejectPaymentAction, adminUpdatePaymentSettingsAction } from "@/lib/actions/registration-actions";

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
const VALID_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAIAAAC0SDtlAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFUlEQVQYlWMQkFAgCTGMapAYDKEEANz3KIGzP4F1AAAAAElFTkSuQmCC";

function validPngFile(name = "background.png") {
  return new File([Buffer.from(VALID_PNG_BASE64, "base64")], name, { type: "image/png" });
}

// ───────────────────────────────────────────────────────
// Revalidation after a successful action (refactor PR 0.7)
// ───────────────────────────────────────────────────────
//
// Each row runs one action down its success path and checks exactly which cached pages it refreshes. These are the
// actions that had no test of their revalidation. src/lib/revalidation-map.test.ts guards the revalidate calls in the
// code of every action; these rows prove the calls run.


  it("updates global payment settings", async () => {
    requireRole.mockResolvedValueOnce(adminSession());
    updatePaymentSettings.mockResolvedValue({ id: "global", qrisImageUrl: "/payment/qris.png" });

    await expect(
      adminUpdatePaymentSettingsAction(fd({ qrisImageUrl: "/payment/qris.png", instructions: "Scan QRIS lalu upload bukti." })),
    ).rejects.toThrow("REDIRECT:/admin?phase=payments&success=payment-settings-updated");

    expect(updatePaymentSettings).toHaveBeenCalledWith({ qrisImageUrl: "/payment/qris.png", instructions: "Scan QRIS lalu upload bukti." });
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
  });

  it("uploads a QRIS image file and uses it instead of the text URL field", async () => {
    requireRole.mockResolvedValueOnce(adminSession());
    updatePaymentSettings.mockResolvedValue({ id: "global", qrisImageUrl: "/payment-qris/global-123.png" });
    process.env.BLOB_READ_WRITE_TOKEN = "test-blob-token";
    blobPut.mockResolvedValue({ url: "https://blob.example.com/payment-qris/global.png" });

    try {
      await expect(
        adminUpdatePaymentSettingsAction(fd({
          qrisImageUrl: "https://old-url-should-be-ignored.example/qris.png",
          instructions: "Scan QRIS lalu upload bukti.",
          qrisImage: validPngFile("qris.png"),
        })),
      ).rejects.toThrow("REDIRECT:/admin?phase=payments&success=payment-settings-updated");

      expect(updatePaymentSettings).toHaveBeenCalledWith({
        qrisImageUrl: "https://blob.example.com/payment-qris/global.png",
        instructions: "Scan QRIS lalu upload bukti.",
      });
    } finally {
      delete process.env.BLOB_READ_WRITE_TOKEN;
    }
  });

  it("approves paid registration requests from admin", async () => {
    // The old single file relied on a session left by an earlier test; this file signs in on purpose.
    requireRole.mockResolvedValue(organizerSession());
    approveTeamRegistrationRequest.mockResolvedValue({ id: "team-paid" });

    await expect(adminApprovePaymentAction(fd({ requestId: "request-1" }))).rejects.toThrow(
      "REDIRECT:/admin?phase=payments&success=payment-approved",
    );

    expect(approveTeamRegistrationRequest).toHaveBeenCalledWith(organizerSession(), "request-1");
    expect(revalidateTag).toHaveBeenCalledWith("teams");
  });

  it("rejects paid registration requests with a reason", async () => {
    // The old single file relied on a session left by an earlier test; this file signs in on purpose.
    requireRole.mockResolvedValue(organizerSession());
    rejectTeamRegistrationRequest.mockResolvedValue({ id: "request-1", status: "rejected" });

    await expect(adminRejectPaymentAction(fd({ requestId: "request-1", reason: "Bukti tidak sesuai." }))).rejects.toThrow(
      "REDIRECT:/admin?phase=payments&success=payment-rejected",
    );

    expect(rejectTeamRegistrationRequest).toHaveBeenCalledWith(organizerSession(), "request-1", "Bukti tidak sesuai.");
  });