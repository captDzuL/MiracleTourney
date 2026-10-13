// Moved out of lib/actions.test.ts without changes (refactor Phase 4).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { adminActivateEventVisualAction, adminApproveEventVisualAction, adminRejectEventVisualAction, adminSetEventVisualFocalPointAction, adminUploadEventLogoAction, organizerUploadEventLogoAction, organizerUploadEventVisualAction, adminUploadEventVisualAction } from "@/lib/actions/event-visual-actions";

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function fd(pairs: Record<string, string | File>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(pairs)) f.set(k, v);
  return f;
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

function visualAsset(overrides: Record<string, unknown> = {}) {
  return {
    id: "asset-new",
    eventId: "event-safe",
    source: "organizer_upload",
    status: "approved",
    url: "https://blob.example.com/event-visuals/event-safe.png",
    focalX: 0.5,
    focalY: 0.5,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

// ───────────────────────────────────────────────────────
// Revalidation after a successful action (refactor PR 0.7)
// ───────────────────────────────────────────────────────
//
// Each row runs one action down its success path and checks exactly which cached pages it refreshes. These are the
// actions that had no test of their revalidation. src/lib/revalidation-map.test.ts guards the revalidate calls in the
// code of every action; these rows prove the calls run.

describe("event visual revision actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BLOB_READ_WRITE_TOKEN = "test-blob-token";
    requireRole.mockResolvedValue(organizerSession());
    checkRateLimit.mockReturnValue(true);
    blobPut.mockResolvedValue({ url: "https://blob.example.com/event-visuals/event-safe.png" });
    createEventVisualAsset.mockResolvedValue(visualAsset());
    approveEventVisualAsset.mockResolvedValue(visualAsset());
    rejectEventVisualAsset.mockResolvedValue(visualAsset({ id: "asset-old", status: "rejected" }));
    setEventVisualFocalPoint.mockResolvedValue(visualAsset({ focalX: 1, focalY: 0 }));
  });

  afterEach(() => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  it("requires an organizer or admin session before creating a revision", async () => {
    requireRole.mockResolvedValue(null);

    await expect(
      adminUploadEventVisualAction(fd({
        eventId: "event-safe",
        rightsAttestation: "confirmed",
        eventVisual: validPngFile(),
      })),
    ).rejects.toThrow("REDIRECT:/login");
    expect(assertUserCanManageEvent).not.toHaveBeenCalled();
    expect(createEventVisualAsset).not.toHaveBeenCalled();
    expect(blobPut).not.toHaveBeenCalled();
  });

  it("refuses uploads for events the organizer does not own", async () => {
    assertUserCanManageEvent.mockRejectedValue(new Error("Not authorized"));

    await expect(
      adminUploadEventVisualAction(fd({
        eventId: "event-of-another-organizer",
        rightsAttestation: "confirmed",
        eventVisual: validPngFile(),
      })),
    ).rejects.toThrow("REDIRECT:/admin?error=");
    expect(createEventVisualAsset).not.toHaveBeenCalled();
    expect(blobPut).not.toHaveBeenCalled();
  });

  it("refuses an admin event logo upload before external storage for a foreign event", async () => {
    requireRole.mockResolvedValue(organizerSession());
    assertUserCanManageEvent.mockRejectedValue(new Error("Not authorized"));

    await expect(
      adminUploadEventLogoAction(fd({ eventId: "event-of-another-organizer", eventLogo: validPngFile("logo.png") })),
    ).rejects.toThrow("Not authorized");
    expect(blobPut).not.toHaveBeenCalled();
    expect(updateEventBrandAssets).not.toHaveBeenCalled();
  });

  it.each([
    ["admin", adminUploadEventLogoAction, "eventLogo"],
    ["organizer", organizerUploadEventLogoAction, "eventLogo"],
  ] as const)("rate-limits %s event logos before blob storage or repository writes", async (_label, action, field) => {
    checkRateLimit.mockReturnValue(false);
    await expect(action(fd({ eventId: "event-safe", locale: "en", [field]: validPngFile("logo.png") }))).rejects.toThrow(/rate-limited/);
    expect(blobPut).not.toHaveBeenCalled();
    expect(updateEventBrandAssets).not.toHaveBeenCalled();
  });

  it("refuses uploads without a confirmed rights attestation", async () => {
    await expect(
      adminUploadEventVisualAction(fd({
        eventId: "event-safe",
        eventVisual: validPngFile(),
      })),
    ).rejects.toThrow("REDIRECT:/admin?error=");
    expect(createEventVisualAsset).not.toHaveBeenCalled();
    expect(blobPut).not.toHaveBeenCalled();
  });

  it.each([
    ["admin", adminUploadEventVisualAction],
    ["organizer", organizerUploadEventVisualAction],
  ] as const)("rate-limits %s event visuals before file parsing or revision writes", async (_label, action) => {
    checkRateLimit.mockReturnValue(false);
    await expect(action(fd({ eventId: "event-safe", locale: "en", rightsAttestation: "confirmed", eventVisual: validPngFile() }))).rejects.toThrow(/rate-limited/);
    expect(blobPut).not.toHaveBeenCalled();
    expect(createEventVisualAsset).not.toHaveBeenCalled();
    expect(approveEventVisualAsset).not.toHaveBeenCalled();
  });

  it("rejects spoofed image bytes before anything reaches blob storage", async () => {
    await expect(
      adminUploadEventVisualAction(fd({
        eventId: "event-safe",
        rightsAttestation: "confirmed",
        eventVisual: new File(["<script>alert(1)</script>"], "background.png", { type: "image/png" }),
      })),
    ).rejects.toThrow("REDIRECT:/admin?error=");
    expect(blobPut).not.toHaveBeenCalled();
    expect(createEventVisualAsset).not.toHaveBeenCalled();
  });

  it("rejects uploads larger than 5 MiB", async () => {
    const oversized = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "background.png", { type: "image/png" });

    await expect(
      adminUploadEventVisualAction(fd({
        eventId: "event-safe",
        rightsAttestation: "confirmed",
        eventVisual: oversized,
      })),
    ).rejects.toThrow("REDIRECT:/admin?error=");
    expect(blobPut).not.toHaveBeenCalled();
    expect(createEventVisualAsset).not.toHaveBeenCalled();
  });

  it("creates an approved organizer revision with decoded image metadata", async () => {
    await expect(
      adminUploadEventVisualAction(fd({
        eventId: "event-safe",
        rightsAttestation: "confirmed",
        eventVisual: validPngFile(),
      })),
    ).rejects.toThrow("REDIRECT:/admin?success=event-visual-uploaded");

    expect(createEventVisualAsset).toHaveBeenCalledWith(
      expect.objectContaining({ role: "organizer" }),
      expect.objectContaining({
        eventId: "event-safe",
        source: "organizer_upload",
        status: "approved",
        rightsAttestedAt: expect.any(Date),
      }),
    );
    expect(createEventVisualAsset).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        url: "https://blob.example.com/event-visuals/event-safe.png",
        mimeType: "image/png",
        width: 16,
        height: 9,
      }),
    );
    expect(approveEventVisualAsset).toHaveBeenCalledWith(
      expect.objectContaining({ role: "organizer" }),
      "event-safe",
      "asset-new",
      { dualWriteLegacyImage: true },
    );
    expect(revalidateTag).toHaveBeenCalledWith("events");
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it.each(["id", "en"] as const)("returns master uploads to the public editor section in %s and preserves rollback", async locale => {
    try {
      for (const master of [true, false]) {
        vi.stubEnv("FEATURE_FLAG_ORGANIZER_MASTER_SHELL_V3", String(master));
        for (const [action, field, success] of [[organizerUploadEventLogoAction, "eventLogo", "event-logo-uploaded"], [organizerUploadEventVisualAction, "eventVisual", "event-visual-uploaded"]] as const) {
          await expect(action(fd({ eventId: "event-safe", locale, rightsAttestation: "confirmed", [field]: validPngFile() }))).rejects.toThrow(
            `REDIRECT:/${locale}/organizer/events/event-safe/${master ? "edit" : "overview"}?success=${success}#section-${master ? "public" : "visuals"}`,
          );
          expect(assertUserCanManageEvent).toHaveBeenCalledWith(expect.objectContaining({ role: "organizer" }), "event-safe");
        }
      }
    } finally { vi.unstubAllEnvs(); }
  });

  it("keeps master upload errors on the editor and does not bypass ownership", async () => {
    vi.stubEnv("FEATURE_FLAG_ORGANIZER_MASTER_SHELL_V3", "true");
    try {
      await expect(organizerUploadEventLogoAction(fd({ eventId: "event-safe", locale: "en" }))).rejects.toThrow(/REDIRECT:\/en\/organizer\/events\/event-safe\/edit\?error=.*#section-public/);
      assertUserCanManageEvent.mockRejectedValue(new Error("Not authorized"));
      await expect(organizerUploadEventVisualAction(fd({ eventId: "event-safe", locale: "en", rightsAttestation: "confirmed", eventVisual: validPngFile() }))).rejects.toThrow("Not%20authorized");
      expect(blobPut).not.toHaveBeenCalled();
      expect(updateEventBrandAssets).not.toHaveBeenCalled();
      expect(createEventVisualAsset).not.toHaveBeenCalled();
    } finally { vi.unstubAllEnvs(); }
  });

  it("returns a workspace poster upload to the locale-aware visual section", async () => {
    await expect(
      organizerUploadEventVisualAction(fd({
        eventId: "event-safe",
        locale: "id",
        rightsAttestation: "confirmed",
        eventVisual: validPngFile(),
      })),
    ).rejects.toThrow("REDIRECT:/id/organizer/events/event-safe/overview?success=event-visual-uploaded#section-visuals");

    expect(createEventVisualAsset).toHaveBeenCalledWith(
      expect.objectContaining({ role: "organizer" }),
      expect.objectContaining({ eventId: "event-safe", status: "approved" }),
    );
  });

  it("returns a workspace logo upload failure to the same visual section", async () => {
    await expect(
      organizerUploadEventLogoAction(fd({
        eventId: "event-safe",
        locale: "en",
      })),
    ).rejects.toThrow("REDIRECT:/en/organizer/events/event-safe/overview?error=");

    expect(updateEventBrandAssets).not.toHaveBeenCalled();
  });

  it("approves an AI revision and activates it through the repository boundary", async () => {
    approveEventVisualAsset.mockResolvedValue(visualAsset({ id: "asset-ai", source: "ai_generated" }));

    await expect(
      adminApproveEventVisualAction(fd({ eventId: "event-safe", assetId: "asset-ai" })),
    ).rejects.toThrow("REDIRECT:/admin?success=event-visual-approved");

    expect(assertUserCanManageEvent).toHaveBeenCalledWith(
      expect.objectContaining({ role: "organizer" }),
      "event-safe",
    );
    expect(approveEventVisualAsset).toHaveBeenCalledWith(
      expect.objectContaining({ role: "organizer" }),
      "event-safe",
      "asset-ai",
      { dualWriteLegacyImage: true },
    );
    expect(revalidateTag).toHaveBeenCalledWith("events");
  });

  it("surfaces the repository guard when rejecting the active revision", async () => {
    rejectEventVisualAsset.mockRejectedValue(new Error("Cannot reject the active visual revision"));

    await expect(
      adminRejectEventVisualAction(fd({ eventId: "event-safe", assetId: "asset-active" })),
    ).rejects.toThrow(`REDIRECT:/admin?error=${encodeURIComponent("Cannot reject the active visual revision")}`);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("activates an older approved revision for rollback", async () => {
    approveEventVisualAsset.mockResolvedValue(visualAsset({ id: "asset-old" }));

    await expect(
      adminActivateEventVisualAction(fd({ eventId: "event-safe", assetId: "asset-old" })),
    ).rejects.toThrow("REDIRECT:/admin?success=event-visual-activated");

    expect(approveEventVisualAsset).toHaveBeenCalledWith(
      expect.objectContaining({ role: "organizer" }),
      "event-safe",
      "asset-old",
      { dualWriteLegacyImage: true },
    );
  });

  it("forwards focal values outside 0..1 to the repository clamp", async () => {
    await expect(
      adminSetEventVisualFocalPointAction(fd({
        eventId: "event-safe",
        assetId: "asset-new",
        focalX: "1.4",
        focalY: "-0.2",
      })),
    ).rejects.toThrow("REDIRECT:/admin?success=event-visual-focal-updated");

    expect(setEventVisualFocalPoint).toHaveBeenCalledWith(
      expect.objectContaining({ role: "organizer" }),
      "event-safe",
      "asset-new",
      { x: 1.4, y: -0.2 },
    );
  });
});