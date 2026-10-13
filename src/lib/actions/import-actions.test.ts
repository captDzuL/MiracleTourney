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
  getEventsByIds,
  getOrganizerUserById,
  getPlayerStatFormContext,
  getPublishedEvents,
  getUserByEmail,
  getUserPasswordHashById,
  generateCertificate,
  generateCertificateIfFinal,
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
  getEventsByIds: vi.fn(),
  getOrganizerUserById: vi.fn(),
  getPlayerStatFormContext: vi.fn(),
  getPublishedEvents: vi.fn(),
  getUserByEmail: vi.fn(),
  getUserPasswordHashById: vi.fn(),
  generateCertificate: vi.fn(),
  generateCertificateIfFinal: vi.fn(),
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

import { adminPreviewRegistrationImportAction, adminCommitRegistrationImportAction } from "@/lib/actions/import-actions";

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

describe("legacy registration import adapters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRole.mockResolvedValue(adminSession());
  });

  it("preserves the established missing-file error and import phase", async () => {
    previewRegistrationImportForUser.mockResolvedValue({ status: "blocked", code: "invalid_input", message: "shared error" });
    await expect(adminPreviewRegistrationImportAction(fd({ eventId: "event-1" }))).rejects.toThrow(
      "REDIRECT:/admin?phase=import&activeEventId=event-1&error=Pilih%20file%20XLSX%20atau%20CSV%20terlebih%20dahulu.",
    );
  });

  it("preserves the established size and extension errors before the shared core", async () => {
    previewRegistrationImportForUser.mockResolvedValue({ status: "blocked", code: "invalid_input", message: "shared error" });
    const large = new File(["x".repeat(5 * 1024 * 1024 + 1)], "large.csv", { type: "text/csv" });
    await expect(adminPreviewRegistrationImportAction(fd({ eventId: "event-1", registrationFile: large }))).rejects.toThrow(
      "REDIRECT:/admin?phase=import&activeEventId=event-1&error=File%20registrasi%20maksimal%205%20MiB.",
    );

    const unsupported = new File(["data"], "registrations.txt", { type: "text/plain" });
    await expect(adminPreviewRegistrationImportAction(fd({ eventId: "event-1", registrationFile: unsupported }))).rejects.toThrow(
      "REDIRECT:/admin?phase=import&activeEventId=event-1&error=File%20harus%20berformat%20.xlsx%20atau%20.csv.",
    );
  });

  it("keeps parser failures from the shared core on the legacy import phase", async () => {
    previewRegistrationImportForUser.mockResolvedValue({ status: "blocked", code: "invalid_input", message: "Parser failed" });
    await expect(adminPreviewRegistrationImportAction(fd({
      eventId: "event-1", registrationFile: new File(["data"], "registrations.csv", { type: "text/csv" }),
    }))).rejects.toThrow("REDIRECT:/admin?phase=import&activeEventId=event-1&error=Parser%20failed");
  });

  it("preserves parser and mapping compatibility metadata from the shared core", async () => {
    previewRegistrationImportForUser.mockResolvedValueOnce({
      status: "blocked",
      code: "operation_failed",
      message: "Preview import registrasi gagal.",
      legacy: { phase: "import", message: "File rusak.", behavior: "redirect" },
    });
    await expect(adminPreviewRegistrationImportAction(fd({
      eventId: "event-1", registrationFile: new File(["data"], "registrations.csv", { type: "text/csv" }),
    }))).rejects.toThrow("REDIRECT:/admin?phase=import&activeEventId=event-1&error=File%20rusak.");

    previewRegistrationImportForUser.mockResolvedValueOnce({
      status: "blocked",
      code: "invalid_input",
      message: "Input registrasi tidak valid.",
      legacy: {
        phase: "registration",
        message: "Mapping wajib belum ditemukan: nama tim, captain IGN, captain UID.",
        behavior: "redirect",
      },
    });
    await expect(adminPreviewRegistrationImportAction(fd({
      eventId: "event-1", registrationFile: new File(["data"], "registrations.csv", { type: "text/csv" }),
    }))).rejects.toThrow(
      "REDIRECT:/admin?phase=registration&activeEventId=event-1&error=Mapping%20wajib%20belum%20ditemukan%3A%20nama%20tim%2C%20captain%20IGN%2C%20captain%20UID.",
    );
  });

  it("preserves the legacy event-not-found redirect without an active event id", async () => {
    previewRegistrationImportForUser.mockResolvedValue({
      status: "blocked",
      code: "not_found",
      message: "The registration data was not found.",
      legacy: { phase: "import", message: "Event tidak ditemukan.", behavior: "redirect", includeActiveEventId: false },
    });
    await expect(adminPreviewRegistrationImportAction(fd({
      eventId: "event-1", registrationFile: new File(["data"], "registrations.csv", { type: "text/csv" }),
    }))).rejects.toThrow("REDIRECT:/admin?phase=import&error=Event%20tidak%20ditemukan.");
  });

  it("preserves a legacy preview repository failure as an error", async () => {
    previewRegistrationImportForUser.mockResolvedValue({
      status: "blocked",
      code: "operation_failed",
      message: "Preview import registrasi gagal.",
      legacy: { phase: "registration", message: "Database unavailable.", behavior: "throw" },
    });
    await expect(adminPreviewRegistrationImportAction(fd({
      eventId: "event-1", registrationFile: new File(["data"], "registrations.csv", { type: "text/csv" }),
    }))).rejects.toThrow("Database unavailable.");
  });

  it("preserves the established empty-selection and expiry commit feedback", async () => {
    commitRegistrationImportForUser.mockResolvedValue({ status: "blocked", code: "invalid_input", message: "shared error" });
    await expect(adminCommitRegistrationImportAction(fd({ eventId: "event-1", batchId: "batch-1" }))).rejects.toThrow(
      "REDIRECT:/admin?phase=registration&activeEventId=event-1&registrationBatchId=batch-1&error=Pilih%20minimal%20satu%20baris%20Baru%20atau%20Berubah%20untuk%20diimport.",
    );

    commitRegistrationImportForUser.mockResolvedValue({
      status: "blocked",
      code: "operation_failed",
      message: "Import registrasi gagal.",
      legacy: { phase: "registration", message: "Batch import registrasi sudah kedaluwarsa.", behavior: "redirect" },
    });
    await expect(adminCommitRegistrationImportAction(fd({ eventId: "event-1", batchId: "batch-1", itemId: "item-1" }))).rejects.toThrow(
      "REDIRECT:/admin?phase=registration&activeEventId=event-1&registrationBatchId=batch-1&error=Batch%20import%20registrasi%20sudah%20kedaluwarsa.",
    );
  });

  it("preserves a legacy commit repository failure and registration phase", async () => {
    commitRegistrationImportForUser.mockResolvedValue({
      status: "blocked",
      code: "operation_failed",
      message: "Import registrasi gagal.",
      legacy: { phase: "registration", message: "Import transaction failed.", behavior: "redirect" },
    });
    await expect(adminCommitRegistrationImportAction(fd({ eventId: "event-1", batchId: "batch-1", itemId: "item-1" }))).rejects.toThrow(
      "REDIRECT:/admin?phase=registration&activeEventId=event-1&registrationBatchId=batch-1&error=Import%20transaction%20failed.",
    );
  });

  it("keeps the established legacy success redirects while delegating business work", async () => {
    previewRegistrationImportForUser.mockResolvedValue({ status: "preview_ready", batchId: "batch-1", redirectTo: "/en/organizer/events/event-1/registration?view=import" });
    await expect(adminPreviewRegistrationImportAction(fd({
      eventId: "event-1", registrationFile: new File(["data"], "registrations.csv", { type: "text/csv" }),
    }))).rejects.toThrow("REDIRECT:/admin?phase=registration&activeEventId=event-1&registrationBatchId=batch-1&success=registration-preview-ready");

    commitRegistrationImportForUser.mockResolvedValue({ status: "imported", importedCount: 2, redirectTo: "/id/organizer/events/event-1/registration?view=import" });
    await expect(adminCommitRegistrationImportAction(fd({ eventId: "event-1", batchId: "batch-1", itemId: "item-1" }))).rejects.toThrow(
      "REDIRECT:/admin?phase=registration&activeEventId=event-1&success=registration-imported&count=2",
    );
    expect(previewRegistrationImportForUser).toHaveBeenCalledOnce();
    expect(commitRegistrationImportForUser).toHaveBeenCalledOnce();
    expect(previewRegistrationImportForUser).toHaveBeenCalledWith(
      expect.anything(), expect.any(FormData), { legacyCompatibility: true },
    );
    expect(commitRegistrationImportForUser).toHaveBeenCalledWith(
      expect.anything(), expect.any(FormData), { legacyCompatibility: true },
    );
  });
});