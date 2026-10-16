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
const { findCaptainRegistrationRequestRef, findCaptainTeamRef } = vi.hoisted(() => ({
  findCaptainRegistrationRequestRef: vi.fn(),
  findCaptainTeamRef: vi.fn(),
}));
vi.mock("@/lib/registration/repository", () => ({
  findCaptainRegistrationRequestRef,
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
  findCaptainTeamRef,
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

import { UserFacingError } from "@/lib/security/public-error";
import { captainRegisterTeamAction, captainUploadPaymentProofAction } from "@/lib/actions/registration-actions";
import { captainAddPlayerAction, captainDeletePlayerAction, captainUploadTeamLogoAction, captainSetDisplayCaptainAction, captainUpdatePlayerAction } from "@/lib/actions/team-actions";

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function fd(pairs: Record<string, string | File>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(pairs)) f.set(k, v);
  return f;
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
// captain actions (existing + additions)
// ────────────────────────────────────────────────────────────

const CAPTAIN_CONTACT = "081234567890";

describe("captain actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRole.mockResolvedValue(captainSession());
    checkRateLimit.mockReturnValue(true);
    assertCaptainCanSubmitStats.mockResolvedValue(undefined);
  });

  it.each([
    ["is missing", undefined],
    ["is blank", "   "],
    ["is too short", "08123"],
    ["contains markup", "<b>0812345678</b>"],
  ])("rejects a registration when the captain WhatsApp %s", async (_label, captainContact) => {
    await expect(
      captainRegisterTeamAction(fd({ eventId: "event-b", name: "No Phone United", tag: "NPU", ...(captainContact === undefined ? {} : { captainContact }) })),
    ).rejects.toThrow("REDIRECT:/captain?tab=registration&eventId=event-b&error=Isi%20nomor%20WhatsApp%20kapten%2C%20minimal%206%20karakter.");
    expect(registerTeam).not.toHaveBeenCalled();
    expect(createTeamRegistrationRequest).not.toHaveBeenCalled();
  });

  it("requires a captain session before registering a team", async () => {
    requireRole.mockResolvedValue(null);

    await expect(captainRegisterTeamAction(fd({ eventId: "e1", name: "Team A", tag: "TA", captainContact: CAPTAIN_CONTACT }))).rejects.toThrow(
      "REDIRECT:/login",
    );
    expect(registerTeam).not.toHaveBeenCalled();
  });

  it("derives the registering captain from the authenticated session", async () => {
    await expect(
      captainRegisterTeamAction(fd({ eventId: "event-flashpeak-open", name: "Session United", tag: "SES", captainContact: CAPTAIN_CONTACT })),
    ).rejects.toThrow("REDIRECT:/captain?tab=registration&eventId=event-flashpeak-open&success=team-created");
    expect(registerTeam).toHaveBeenCalledWith({
      eventId: "event-flashpeak-open",
      captainId: "captain-1",
      name: "Session United",
      tag: "SES",
      captainContact: CAPTAIN_CONTACT,
    });
  });

  it("returns a generic denial for a cross-event registration without creating a payment request", async () => {
    registerTeam.mockRejectedValueOnce(new Error("Not authorized"));

    await expect(
      captainRegisterTeamAction(fd({ eventId: "event-b", name: "Foreign United", tag: "FUT", captainContact: CAPTAIN_CONTACT })),
    ).rejects.toThrow("REDIRECT:/captain?tab=registration&eventId=event-b&error=Not%20authorized");
    expect(createTeamRegistrationRequest).not.toHaveBeenCalled();
  });

  it("shows a business rejection from registration to the captain without logging it as a failure", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    registerTeam.mockRejectedValueOnce(new UserFacingError("Draft tim tidak ditemukan untuk akun ini."));

    await expect(
      captainRegisterTeamAction(fd({ eventId: "event-b", name: "Draft United", tag: "DRF", captainContact: CAPTAIN_CONTACT })),
    ).rejects.toThrow("REDIRECT:/captain?tab=registration&eventId=event-b&error=Draft%20tim%20tidak%20ditemukan%20untuk%20akun%20ini.");

    const operations = info.mock.calls.map(([line]) => JSON.parse(String(line)).operation);
    expect(operations).not.toContain("captain_register_team");
    info.mockRestore();
  });

  it("logs an unexpected registration failure without its message and keeps the captain-facing message generic", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    registerTeam.mockRejectedValueOnce(
      Object.assign(new Error("Invalid prisma.team.create() invocation: { captainContact: '0812-secret' }"), {
        name: "PrismaClientInitializationError",
        code: "P1001",
      }),
    );

    await expect(
      captainRegisterTeamAction(fd({ eventId: "event-b", name: "Draft United", tag: "DRF", captainContact: CAPTAIN_CONTACT })),
    ).rejects.toThrow("REDIRECT:/captain?tab=registration&eventId=event-b&error=Gagal%20mendaftarkan%20tim.");

    const lines = info.mock.calls.map(([line]) => String(line));
    const failure = lines.map((line) => JSON.parse(line)).find((event) => event.operation === "captain_register_team");
    expect(failure).toEqual(expect.objectContaining({ phase: "failed", status: 500, errorCode: "p1001" }));
    expect(failure.resourceId).toMatch(/^sha256:/);
    expect(lines.join("\n")).not.toContain("secret");
    info.mockRestore();
  });

  it("logs an unexpected failure while creating the payment request", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    registerTeam.mockRejectedValueOnce(new UserFacingError("Event ini membutuhkan verifikasi pembayaran sebelum tim aktif."));
    createTeamRegistrationRequest.mockRejectedValueOnce(new Error("deadlock detected"));

    await expect(
      captainRegisterTeamAction(fd({ eventId: "event-paid", name: "Paid United", tag: "PDU", captainContact: CAPTAIN_CONTACT })),
    ).rejects.toThrow("REDIRECT:/captain?tab=registration&eventId=event-paid&error=Gagal%20membuat%20pendaftaran%20pembayaran.");

    const failure = info.mock.calls.map(([line]) => JSON.parse(String(line))).find((event) => event.operation === "captain_register_team");
    expect(failure).toEqual(expect.objectContaining({ phase: "failed", errorCode: "error", stage: "creating_payment_request" }));
    info.mockRestore();
  });

  it("falls back to a payment request when the fee-required rejection is a UserFacingError", async () => {
    registerTeam.mockRejectedValueOnce(new UserFacingError("Event ini membutuhkan verifikasi pembayaran sebelum tim aktif."));
    createTeamRegistrationRequest.mockResolvedValueOnce({ id: "request-2", status: "pending_payment" });

    await expect(
      captainRegisterTeamAction(fd({ eventId: "event-paid", name: "Paid United", tag: "PDU", captainContact: CAPTAIN_CONTACT })),
    ).rejects.toThrow("REDIRECT:/captain?tab=registration&eventId=event-paid&success=payment-pending");
    expect(createTeamRegistrationRequest).toHaveBeenCalled();
  });

  it("creates a pending payment request when the event requires a fee", async () => {
    registerTeam.mockRejectedValue(new Error("Event ini membutuhkan verifikasi pembayaran sebelum tim aktif."));
    createTeamRegistrationRequest.mockResolvedValue({ id: "request-1", status: "pending_payment" });

    await expect(
      captainRegisterTeamAction(fd({ eventId: "event-paid", name: "Paid United", tag: "PDU", captainContact: CAPTAIN_CONTACT })),
    ).rejects.toThrow("REDIRECT:/captain?tab=registration&eventId=event-paid&success=payment-pending");

    expect(createTeamRegistrationRequest).toHaveBeenCalledWith({
      eventId: "event-paid",
      captainId: "captain-1",
      name: "Paid United",
      tag: "PDU",
      captainContact: CAPTAIN_CONTACT,
    });
    expect(revalidateTag).toHaveBeenCalledWith("teams");
    expect(revalidatePath).toHaveBeenCalledWith("/captain");
  });

  it("uploads a payment proof for the authenticated captain", async () => {
    updateTeamRegistrationProof.mockResolvedValue({ id: "request-1", status: "pending_review" });
    findCaptainRegistrationRequestRef.mockResolvedValue({ id: "request-1", eventId: "event-paid" });
    process.env.BLOB_READ_WRITE_TOKEN = "test-blob-token";
    blobPut.mockResolvedValue({ url: "https://blob.example.com/payment-proofs/request-1.png" });

    try {
      await expect(
        captainUploadPaymentProofAction(fd({ requestId: "request-1", eventId: "event-paid", paymentProof: validPngFile("proof.png") })),
      ).rejects.toThrow("REDIRECT:/captain?tab=registration&eventId=event-paid&success=payment-proof-uploaded");

      expect(updateTeamRegistrationProof).toHaveBeenCalledWith("captain-1", "request-1", "https://blob.example.com/payment-proofs/request-1.png");
      expect(revalidatePath).toHaveBeenCalledWith("/captain");
    } finally {
      delete process.env.BLOB_READ_WRITE_TOKEN;
    }
  });

  it("rate-limits payment proof before reading, storing, or updating the request", async () => {
    checkRateLimit.mockReturnValue(false);
    findCaptainRegistrationRequestRef.mockResolvedValue({ id: "request-1", eventId: "event-paid" });
    process.env.BLOB_READ_WRITE_TOKEN = "test-blob-token";
    const paymentProof = validPngFile("proof.png");
    try {
      await expect(
        captainUploadPaymentProofAction(fd({ requestId: "request-1", eventId: "event-paid", paymentProof })),
      ).rejects.toThrow("REDIRECT:/captain?tab=registration&eventId=event-paid&error=rate-limited");
      expect(blobPut).not.toHaveBeenCalled();
      expect(updateTeamRegistrationProof).not.toHaveBeenCalled();
    } finally {
      delete process.env.BLOB_READ_WRITE_TOKEN;
    }
  });

  it("denies a foreign payment request before external upload or repository write", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-blob-token";
    findCaptainRegistrationRequestRef.mockResolvedValue(null);
    blobPut.mockResolvedValue({ url: "https://blob.example.com/payment-proofs/foreign.png" });

    try {
      await expect(
        captainUploadPaymentProofAction(fd({ requestId: "foreign-request", eventId: "event-paid", paymentProof: validPngFile("proof.png") })),
      ).rejects.toThrow("REDIRECT:/captain?tab=registration&eventId=event-paid&error=Not%20authorized");
      expect(blobPut).not.toHaveBeenCalled();
      expect(updateTeamRegistrationProof).not.toHaveBeenCalled();
    } finally {
      delete process.env.BLOB_READ_WRITE_TOKEN;
    }
  });

  it.each([
    ["missing", null, "No%20Payment%20proof%20file%20uploaded."],
    ["oversized", new File(["x".repeat(2 * 1024 * 1024 + 1)], "proof.png", { type: "image/png" }), "Payment%20proof%20file%20is%20too%20large."],
    ["invalid signature", new File(["not-an-image"], "proof.png", { type: "image/png" }), "Payment%20proof%20file%20content%20does%20not%20match%20its%20image%20type."],
  ] as const)("preserves the payment proof validation message for %s files", async (_kind, paymentProof, encodedMessage) => {
    findCaptainRegistrationRequestRef.mockResolvedValue({ id: "request-1", eventId: "event-paid" });
    process.env.BLOB_READ_WRITE_TOKEN = "test-blob-token";

    try {
      const fields: Record<string, string | File> = { requestId: "request-1", eventId: "event-paid" };
      if (paymentProof) fields.paymentProof = paymentProof;
      await expect(captainUploadPaymentProofAction(fd(fields))).rejects.toThrow(
        `REDIRECT:/captain?tab=registration&eventId=event-paid&error=${encodedMessage}`,
      );
      expect(blobPut).not.toHaveBeenCalled();
      expect(updateTeamRegistrationProof).not.toHaveBeenCalled();
    } finally {
      delete process.env.BLOB_READ_WRITE_TOKEN;
    }
  });

  it("denies a foreign team logo before external upload or repository write", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-blob-token";
    findCaptainTeamRef.mockResolvedValue(null);
    blobPut.mockResolvedValue({ url: "https://blob.example.com/team-logos/foreign.png" });

    try {
      await expect(
        captainUploadTeamLogoAction(fd({ teamId: "foreign-team", teamLogo: validPngFile("logo.png") })),
      ).rejects.toThrow("REDIRECT:/captain?tab=roster&error=Not%20authorized");
      expect(blobPut).not.toHaveBeenCalled();
      expect(updateCaptainTeamLogo).not.toHaveBeenCalled();
    } finally {
      delete process.env.BLOB_READ_WRITE_TOKEN;
    }
  });

  it("rate-limits captain team logos after ownership and before file processing", async () => {
    checkRateLimit.mockReturnValue(false);
    findCaptainTeamRef.mockResolvedValue({ id: "team-1", eventId: "event-safe" });
    process.env.BLOB_READ_WRITE_TOKEN = "test-blob-token";
    try {
      await expect(
        captainUploadTeamLogoAction(fd({ teamId: "team-1", teamLogo: validPngFile("logo.png") })),
      ).rejects.toThrow("REDIRECT:/captain?tab=roster&error=rate-limited");
      expect(blobPut).not.toHaveBeenCalled();
      expect(updateCaptainTeamLogo).not.toHaveBeenCalled();
    } finally {
      delete process.env.BLOB_READ_WRITE_TOKEN;
    }
  });

  it("requires a captain session before adding a player", async () => {
    requireRole.mockResolvedValue(null);

    await expect(
      captainAddPlayerAction(fd({ teamId: "t1", eventId: "e1", displayName: "Player", nickname: "PL", position: "Guard" })),
    ).rejects.toThrow("REDIRECT:/login");
    expect(addPlayer).not.toHaveBeenCalled();
  });

  it("adds player and redirects on success", async () => {
    await expect(
      captainAddPlayerAction(
        fd({ teamId: "t1", eventId: "e1", displayName: "Ahmad Dhani", nickname: "Dhani", position: "Forward" }),
      ),
    ).rejects.toThrow("REDIRECT:/captain?success=player-added");
    expect(addPlayer).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: "Ahmad Dhani", nickname: "Dhani" }),
    );
  });
});

// ────────────────────────────────────────────────────────────
// captainUpdatePlayerAction
// ────────────────────────────────────────────────────────────

describe("captainUpdatePlayerAction", () => {
  const validData = {
    playerId: "player-1",
    displayName: "Updated Name",
    nickname: "Upd",
    position: "Midfielder",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    requireRole.mockResolvedValue(captainSession());
  });

  it("requires a captain session", async () => {
    requireRole.mockResolvedValue(null);
    await expect(captainUpdatePlayerAction(fd(validData))).rejects.toThrow("REDIRECT:/login");
  });

  it("updates player and redirects to /captain?success=player-updated", async () => {
    await expect(captainUpdatePlayerAction(fd(validData))).rejects.toThrow(
      "REDIRECT:/captain?success=player-updated",
    );
    expect(updatePlayer).toHaveBeenCalledWith(
      "player-1",
      "captain-1",
      expect.objectContaining({ displayName: "Updated Name" }),
    );
  });

  it("redirects with error when updatePlayer throws", async () => {
    updatePlayer.mockRejectedValue(new Error("Forbidden"));

    await expect(captainUpdatePlayerAction(fd(validData))).rejects.toThrow(
      "REDIRECT:/captain?error=",
    );
  });
});

// ────────────────────────────────────────────────────────────
// captainDeletePlayerAction
// ────────────────────────────────────────────────────────────

describe("captainDeletePlayerAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRole.mockResolvedValue(captainSession());
  });

  it("requires a captain session", async () => {
    requireRole.mockResolvedValue(null);
    await expect(captainDeletePlayerAction(fd({ playerId: "p1" }))).rejects.toThrow("REDIRECT:/login");
  });

  it("deletes player and redirects to /captain?success=player-deleted", async () => {
    await expect(captainDeletePlayerAction(fd({ playerId: "p1" }))).rejects.toThrow(
      "REDIRECT:/captain?success=player-deleted",
    );
    expect(deletePlayer).toHaveBeenCalledWith("p1", "captain-1");
  });

  it("redirects with error when deletePlayer throws", async () => {
    deletePlayer.mockRejectedValue(new Error("Not your player"));

    await expect(captainDeletePlayerAction(fd({ playerId: "p1" }))).rejects.toThrow(
      "REDIRECT:/captain?error=",
    );
  });
});

// ────────────────────────────────────────────────────────────
// captainSetDisplayCaptainAction
// ────────────────────────────────────────────────────────────

describe("captainSetDisplayCaptainAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRole.mockResolvedValue(captainSession());
    setTeamCaptainDisplay.mockResolvedValue(undefined);
  });

  it("requires a captain session", async () => {
    requireRole.mockResolvedValue(null);
    await expect(
      captainSetDisplayCaptainAction(fd({ teamId: "t1", playerId: "p1" })),
    ).rejects.toThrow("REDIRECT:/login");
  });

  it("calls setTeamCaptainDisplay with playerId and redirects to success", async () => {
    await expect(
      captainSetDisplayCaptainAction(fd({ teamId: "t1", playerId: "p1" })),
    ).rejects.toThrow("REDIRECT:/captain?success=captain-display-updated");
    expect(setTeamCaptainDisplay).toHaveBeenCalledWith("t1", "captain-1", "p1");
  });

  it("does not accept displayName from client — action only passes playerId", async () => {
    await captainSetDisplayCaptainAction(fd({ teamId: "t1", playerId: "p1", displayName: "INJECTED" })).catch(() => {});
    expect(setTeamCaptainDisplay).toHaveBeenCalledWith("t1", "captain-1", "p1");
    expect(setTeamCaptainDisplay).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), "INJECTED");
  });

  it("redirects with error when player does not belong to the team", async () => {
    setTeamCaptainDisplay.mockRejectedValue(new Error("Not authorized to update this team."));
    await expect(
      captainSetDisplayCaptainAction(fd({ teamId: "t1", playerId: "other-team-player" })),
    ).rejects.toThrow("REDIRECT:/captain?error=");
  });

  it("redirects with error when team does not belong to the captain", async () => {
    setTeamCaptainDisplay.mockRejectedValue(new Error("Not authorized to update this team."));
    await expect(
      captainSetDisplayCaptainAction(fd({ teamId: "other-team", playerId: "p1" })),
    ).rejects.toThrow("REDIRECT:/captain?error=");
  });
});