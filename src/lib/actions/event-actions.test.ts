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

import { parseAndValidateTeamImport } from "@/lib/imports/team-import";
import { adminCreateEventAction, adminUploadCharacterArtAction, adminUpdateEventStatusAction, adminUpdateEventPublicInfoAction, adminUpdateStreamAction } from "@/lib/actions/event-actions";
import { adminImportTeamsCsvAction } from "@/lib/actions/import-actions";

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

// ────────────────────────────────────────────────────────────
// adminCreateEventAction
// ────────────────────────────────────────────────────────────

describe("adminCreateEventAction", () => {
  const validData = {
    name: "New Event 2026",
    slug: "new-event-2026",
    gameModeId: "mode-1",
    format: "Single Elimination",
    participantCap: "8",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    requireRole.mockResolvedValue(adminSession());
  });

  it("requires an admin session", async () => {
    requireRole.mockResolvedValue(null);
    await expect(adminCreateEventAction(fd(validData))).rejects.toThrow("REDIRECT:/login");
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("creates event and redirects to /admin?success=event-created", async () => {
    await expect(adminCreateEventAction(fd(validData))).rejects.toThrow(
      "REDIRECT:/admin?success=event-created",
    );
    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({ name: "New Event 2026", participantCap: 8 }),
    );
    expect(revalidateTag).toHaveBeenCalledWith("events");
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("lets a platform admin assign a new event to an organizer", async () => {
    getOrganizerUserById.mockResolvedValue({
      id: "organizer-target",
      email: "target@test.com",
      name: "Target Organizer",
      role: "organizer",
    });

    await expect(adminCreateEventAction(fd({ ...validData, organizerUserId: "organizer-target" }))).rejects.toThrow(
      "REDIRECT:/admin?success=event-created",
    );

    expect(getOrganizerUserById).toHaveBeenCalledWith("organizer-target");
    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        organizerUserId: "organizer-target",
        organizerName: "Target Organizer",
        organizerVerified: false,
      }),
    );
  });

  it("rejects platform admin assignment to an unknown organizer", async () => {
    getOrganizerUserById.mockResolvedValue(null);

    await expect(adminCreateEventAction(fd({ ...validData, organizerUserId: "missing-organizer" }))).rejects.toThrow(
      "REDIRECT:/admin?error=Organizer%20not%20found.",
    );

    expect(createEvent).not.toHaveBeenCalled();
  });

  it("assigns event ownership from the authenticated organizer session", async () => {
    requireRole.mockResolvedValue(organizerSession());

    await expect(adminCreateEventAction(fd(validData))).rejects.toThrow(
      "REDIRECT:/admin?success=event-created",
    );

    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        organizerUserId: "organizer-1",
        organizerName: "Organizer One",
        organizerVerified: false,
      }),
    );
  });

  it("ignores organizer assignment spoofing from a non-platform organizer", async () => {
    requireRole.mockResolvedValue(organizerSession());

    await expect(adminCreateEventAction(fd({ ...validData, organizerUserId: "organizer-target" }))).rejects.toThrow(
      "REDIRECT:/admin?success=event-created",
    );

    expect(getOrganizerUserById).not.toHaveBeenCalled();
    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        organizerUserId: "organizer-1",
        organizerName: "Organizer One",
      }),
    );
  });

  it("throws Zod error for invalid format value", async () => {
    await expect(
      adminCreateEventAction(fd({ ...validData, format: "Round Robin" })),
    ).rejects.toThrow();
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("throws Zod error for unsupported participantCap", async () => {
    await expect(
      adminCreateEventAction(fd({ ...validData, participantCap: "7" })),
    ).rejects.toThrow();
    expect(createEvent).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────
// adminUpdateEventStatusAction
// ────────────────────────────────────────────────────────────

describe("adminUpdateEventStatusAction", () => {
  let previousOrganizerWorkspaceFlag: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    previousOrganizerWorkspaceFlag = process.env.FEATURE_FLAG_ORGANIZER_WORKSPACE_V3;
    process.env.FEATURE_FLAG_ORGANIZER_WORKSPACE_V3 = "false";
    requireRole.mockResolvedValue(adminSession());
  });

  afterEach(() => {
    if (previousOrganizerWorkspaceFlag === undefined) delete process.env.FEATURE_FLAG_ORGANIZER_WORKSPACE_V3;
    else process.env.FEATURE_FLAG_ORGANIZER_WORKSPACE_V3 = previousOrganizerWorkspaceFlag;
  });

  it("requires an admin session", async () => {
    requireRole.mockResolvedValue(null);
    await expect(
      adminUpdateEventStatusAction(fd({ eventId: "e1", status: "Published" })),
    ).rejects.toThrow("REDIRECT:/login");
  });

  it("updates status and redirects with success", async () => {
    setEventStatus.mockResolvedValue({ slug: "miracle-league" });

    await expect(
      adminUpdateEventStatusAction(fd({ eventId: "e1", status: "Ongoing" })),
    ).rejects.toThrow("REDIRECT:/admin?success=event-status-updated&event=miracle-league");
    expect(setEventStatus).toHaveBeenCalledWith("e1", "Ongoing");
    expect(revalidateTag).toHaveBeenCalledWith("events");
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("checks organizer ownership before updating event status", async () => {
    requireRole.mockResolvedValue(organizerSession());
    setEventStatus.mockResolvedValue({ slug: "miracle-league" });

    await expect(
      adminUpdateEventStatusAction(fd({ eventId: "e1", status: "Ongoing" })),
    ).rejects.toThrow("REDIRECT:/admin?success=event-status-updated&event=miracle-league");

    expect(assertUserCanManageEvent).toHaveBeenCalledWith(organizerSession(), "e1");
    expect(setEventStatus).toHaveBeenCalledWith("e1", "Ongoing");
  });

  it("blocks direct status updates for events outside the organizer scope", async () => {
    requireRole.mockResolvedValue(organizerSession());
    assertUserCanManageEvent.mockRejectedValue(new Error("Not authorized"));

    await expect(
      adminUpdateEventStatusAction(fd({ eventId: "e1", status: "Ongoing" })),
    ).rejects.toThrow("Not authorized");

    expect(setEventStatus).not.toHaveBeenCalled();
  });

  it("redirects with error when event not found", async () => {
    setEventStatus.mockResolvedValue(null);

    await expect(
      adminUpdateEventStatusAction(fd({ eventId: "e-missing", status: "Published" })),
    ).rejects.toThrow();
  });
  it.each(["conflict", "not_draft"] as const)("does not report legacy publication success for %s", async (status) => {
    process.env.FEATURE_FLAG_ORGANIZER_WORKSPACE_V3 = "true";
    publishEvent.mockResolvedValue(status === "not_draft" ? { status, slug: "miracle-league" } : { status });

    try {
      await expect(
        adminUpdateEventStatusAction(fd({ eventId: "e1", status: "Published" })),
      ).rejects.toThrow("REDIRECT:/admin?error=event-publish-conflict");
    } finally {
      delete process.env.FEATURE_FLAG_ORGANIZER_WORKSPACE_V3;
    }
  });
  it("uses the shared readiness guard for legacy publish while organizer V3 is enabled", async () => {
    process.env.FEATURE_FLAG_ORGANIZER_WORKSPACE_V3 = "true";
    publishEvent.mockResolvedValue({ status: "blocked", readiness: { incomplete: [{ code: "description" }] } });

    try {
      await expect(
        adminUpdateEventStatusAction(fd({ eventId: "e1", status: "Published" })),
      ).rejects.toThrow("REDIRECT:/admin?error=event-not-ready");
      expect(publishEvent).toHaveBeenCalledWith("e1", { id: "admin-1", role: "platform_admin" });
      expect(setEventStatus).not.toHaveBeenCalled();
    } finally {
      delete process.env.FEATURE_FLAG_ORGANIZER_WORKSPACE_V3;
    }
  });
});

// ────────────────────────────────────────────────────────────
// adminUpdateStreamAction
// ────────────────────────────────────────────────────────────

describe("adminUpdateStreamAction", () => {
  const validData = {
    eventId: "event-1",
    url: "https://youtube.com/live/abc123",
    label: "Day 1 Stream",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    requireRole.mockResolvedValue(adminSession());
  });

  it("requires an admin session", async () => {
    requireRole.mockResolvedValue(null);
    await expect(adminUpdateStreamAction(fd(validData))).rejects.toThrow("REDIRECT:/login");
  });

  it("updates stream and redirects to /admin?success=stream-updated", async () => {
    await expect(adminUpdateStreamAction(fd(validData))).rejects.toThrow(
      "REDIRECT:/admin?success=stream-updated",
    );
    expect(updateEventStream).toHaveBeenCalledWith(
      "event-1",
      "https://youtube.com/live/abc123",
      "Day 1 Stream",
    );
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("throws Zod error for invalid URL", async () => {
    await expect(
      adminUpdateStreamAction(fd({ ...validData, url: "not-a-url" })),
    ).rejects.toThrow();
    expect(updateEventStream).not.toHaveBeenCalled();
  });

  it("rejects non-http stream URLs to avoid scriptable links", async () => {
    await expect(
      adminUpdateStreamAction(fd({ ...validData, url: "javascript:alert(1)" })),
    ).rejects.toThrow();
    expect(updateEventStream).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────
// captainSubmitStatsAction
// ────────────────────────────────────────────────────────────

describe("adminUpdateEventPublicInfoAction", () => {
  const validData = {
    eventId: "event-1",
    description: "A public listing description for this tournament.",
    registrationWindow: "August 20 - August 28, 2026",
    startsAt: "August 30, 2026",
    venue: "Online",
    prizePoolLabel: "Rp1.000.000",
    registrationFeeRequired: "on",
    registrationFeeAmount: "25000",
    registrationFeeLabel: "Rp25.000 / team",
    registrationUrl: "",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    requireRole.mockResolvedValue(organizerSession());
    updateEventPublicInfo.mockResolvedValue({ slug: "owned-event" });
  });

  it("requires an organizer/admin session", async () => {
    requireRole.mockResolvedValue(null);

    await expect(adminUpdateEventPublicInfoAction(fd(validData))).rejects.toThrow("REDIRECT:/login");
    expect(updateEventPublicInfo).not.toHaveBeenCalled();
  });

  it("normalizes empty optional labels and updates public event info", async () => {
    await expect(adminUpdateEventPublicInfoAction(fd(validData))).rejects.toThrow(
      "REDIRECT:/admin?success=event-public-info-updated&event=owned-event",
    );

    expect(updateEventPublicInfo).toHaveBeenCalledWith(
      organizerSession(),
      "event-1",
      {
        description: "A public listing description for this tournament.",
        registrationWindow: "August 20 - August 28, 2026",
        startsAt: "August 30, 2026",
        venue: "Online",
        prizePoolLabel: "Rp1.000.000",
        registrationFeeRequired: true,
        registrationFeeAmount: 25000,
        registrationFeeLabel: "Rp25.000 / team",
        registrationUrl: null,
      },
    );
    expect(revalidateTag).toHaveBeenCalledWith("events");
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("rejects non-http registration URLs", async () => {
    await expect(
      adminUpdateEventPublicInfoAction(fd({ ...validData, registrationUrl: "javascript:alert(1)" })),
    ).rejects.toThrow();

    expect(updateEventPublicInfo).not.toHaveBeenCalled();
  });

  it("rate-limits CSV import before reading or parsing the file", async () => {
    checkRateLimit.mockReturnValue(false);
    const file = new File(["team,data"], "teams.csv", { type: "text/csv" });
    const text = vi.fn().mockResolvedValue("team,data");
    Object.defineProperty(file, "text", { value: text });
    await expect(adminImportTeamsCsvAction(fd({ csv: file }))).rejects.toThrow("REDIRECT:/admin?error=rate-limited");
    expect(text).not.toHaveBeenCalled();
    expect(parseAndValidateTeamImport).not.toHaveBeenCalled();
    expect(importTeams).not.toHaveBeenCalled();
  });

  it("rejects traversal event ids before updating public information", async () => {
    await expect(adminUpdateEventPublicInfoAction(fd({ ...validData, eventId: "../secrets" }))).rejects.toThrow();
    expect(updateEventPublicInfo).not.toHaveBeenCalled();
  });
});

describe("adminUploadCharacterArtAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRole.mockResolvedValue(adminSession());
    checkRateLimit.mockReturnValue(true);
  });

  it("requires an admin session", async () => {
    requireRole.mockResolvedValue(null);

    await expect(
      adminUploadCharacterArtAction(fd({
        eventId: "event-safe",
        characterArt: new File(["fake"], "art.png", { type: "image/png" }),
      })),
    ).rejects.toThrow("REDIRECT:/login");
    expect(updateEventCertificateAssets).not.toHaveBeenCalled();
  });

  it("rejects non-image uploads before persisting certificate assets", async () => {
    await expect(
      adminUploadCharacterArtAction(fd({
        eventId: "event-safe",
        characterArt: new File(["not an image"], "payload.txt", { type: "text/plain" }),
      })),
    ).rejects.toThrow("REDIRECT:/admin?error=");
    expect(updateEventCertificateAssets).not.toHaveBeenCalled();
  });

  it("rejects spoofed image uploads whose bytes do not match the declared MIME type", async () => {
    await expect(
      adminUploadCharacterArtAction(fd({
        eventId: "event-safe",
        characterArt: new File(["<script>alert(1)</script>"], "art.png", { type: "image/png" }),
      })),
    ).rejects.toThrow("REDIRECT:/admin?error=");
    expect(updateEventCertificateAssets).not.toHaveBeenCalled();
  });

  it("rejects unsafe event IDs before building a local file path", async () => {
    await expect(
      adminUploadCharacterArtAction(fd({
        eventId: "../outside",
        characterArt: new File(["fake"], "art.png", { type: "image/png" }),
      })),
    ).rejects.toThrow(/Invalid string/);
    expect(updateEventCertificateAssets).not.toHaveBeenCalled();
  });

  it("rate-limits character art before reading or storing the file", async () => {
    checkRateLimit.mockReturnValue(false);
    process.env.BLOB_READ_WRITE_TOKEN = "test-blob-token";
    try {
      await expect(
        adminUploadCharacterArtAction(fd({ eventId: "event-safe", characterArt: validPngFile("art.png") })),
      ).rejects.toThrow("REDIRECT:/admin?error=rate-limited");
      expect(blobPut).not.toHaveBeenCalled();
      expect(updateEventCertificateAssets).not.toHaveBeenCalled();
    } finally {
      delete process.env.BLOB_READ_WRITE_TOKEN;
    }
  });
});