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

import bcrypt from "bcryptjs";
import { captainSignUpAction, changePasswordAction, loginAction, requestPasswordResetAction, resetPasswordAction } from "@/lib/actions/identity-actions";
import { logoutAction } from "@/lib/session-actions";

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

// ───────────────────────────────────────────────────────
// Revalidation after a successful action (refactor PR 0.7)
// ───────────────────────────────────────────────────────
//
// Each row runs one action down its success path and checks exactly which cached pages it refreshes. These are the
// actions that had no test of their revalidation. src/lib/revalidation-map.test.ts guards the revalidate calls in the
// code of every action; these rows prove the calls run.

describe("loginAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimit.mockReturnValue(true);
  });

  it("redirects admin to /admin on valid credentials", async () => {
    signIn.mockResolvedValue({ ok: true, user: { role: "admin" } });

    await expect(loginAction(fd({ email: "admin@test.com", password: "secret123" }))).rejects.toThrow(
      "REDIRECT:/admin",
    );
    expect(signIn).toHaveBeenCalledWith("admin@test.com", "secret123");
  });

  it("redirects organizer to /organizer on valid credentials", async () => {
    signIn.mockResolvedValue({ ok: true, user: { role: "organizer" } });

    await expect(loginAction(fd({ email: "organizer@test.com", password: "secret123" }))).rejects.toThrow(
      "REDIRECT:/organizer",
    );
  });
  it("requires a newly provisioned organizer to change the temporary password first", async () => {
    signIn.mockResolvedValue({ ok: true, user: { role: "organizer", mustChangePassword: true } });

    await expect(loginAction(fd({ email: "organizer@test.com", password: "Temporary123!" }))).rejects.toThrow(
      "REDIRECT:/organizer/change-password",
    );
  });
  it("redirects captain to /captain on valid credentials", async () => {
    signIn.mockResolvedValue({ ok: true, user: { role: "captain" } });

    await expect(loginAction(fd({ email: "cap@test.com", password: "secret123" }))).rejects.toThrow(
      "REDIRECT:/captain",
    );
  });

  it("preserves adaptive event context and requested locale for captain login", async () => {
    signIn.mockResolvedValue({ ok: true, user: { role: "captain" } });

    await expect(loginAction(fd({
      email: "cap@test.com",
      password: "secret123",
      eventId: "event-abc",
      locale: "en",
    }))).rejects.toThrow("REDIRECT:/en/captain?tab=registration&eventId=event-abc");
  });

  it("redirects to /login?error=invalid when credentials are wrong", async () => {
    signIn.mockResolvedValue({ ok: false, error: "Invalid email or password." });

    await expect(loginAction(fd({ email: "bad@test.com", password: "wrong" }))).rejects.toThrow(
      "REDIRECT:/login?error=invalid",
    );
  });

  it("fails closed with the generic login response when the shared limiter denies", async () => {
    checkRateLimit.mockReturnValue(false);

    await expect(loginAction(fd({ email: "admin@test.com", password: "secret123" }))).rejects.toThrow(
      "REDIRECT:/login?error=invalid",
    );
    expect(signIn).not.toHaveBeenCalled();
  });

  it("preserves adaptive event context after invalid credentials", async () => {
    signIn.mockResolvedValue({ ok: false, error: "Invalid email or password." });

    await expect(loginAction(fd({
      email: "bad@test.com",
      password: "wrong",
      eventId: "event-abc",
      locale: "id",
    }))).rejects.toThrow("REDIRECT:/id/login?eventId=event-abc&error=invalid");
  });

  it("redirects to a database error when sign-in cannot reach the database", async () => {
    signIn.mockRejectedValue(new Error("Can't reach database server at `db.example.com:5432`"));

    await expect(loginAction(fd({ email: "admin@test.com", password: "secret123" }))).rejects.toThrow(
      "REDIRECT:/login?error=database",
    );
  });

  it("preserves native returnTo after a transient database login error", async () => {
    signIn.mockRejectedValue(new Error("Can't reach database server at `db.example.com:5432`"));

    await expect(loginAction(fd({
      email: "cap@test.com",
      password: "secret123",
      returnTo: "/id/events/nusantara-cup/register",
      locale: "en",
    }))).rejects.toThrow(
      "REDIRECT:/en/login?returnTo=%2Fid%2Fevents%2Fnusantara-cup%2Fregister&error=database",
    );
  });

  it("throws Zod error for invalid email format", async () => {
    await expect(loginAction(fd({ email: "not-an-email", password: "pass" }))).rejects.toThrow();
    expect(signIn).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────
// logoutAction
// ────────────────────────────────────────────────────────────

describe("logoutAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls signOut and redirects to home", async () => {
    await expect(logoutAction()).rejects.toThrow("REDIRECT:/");
    expect(signOut).toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────
// captainSignUpAction
// ────────────────────────────────────────────────────────────

describe("captainSignUpAction", () => {
  const validData = {
    fullName: "Budi Santoso",
    email: "budi@test.com",
    password: "password123",
    eventId: "event-abc",
    teamName: "Tim Budi",
    teamTag: "TBD",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimit.mockReturnValue(true);
    getUserByEmail.mockResolvedValue(null);
    getEventsByIds.mockResolvedValue([{ id: "event-abc", status: "Published" }]);
    createCaptainAccount.mockResolvedValue({ userId: "captain-new" });
    signIn.mockResolvedValue({ ok: true, user: { role: "captain" } });
  });

  it("creates account and returns to the requested event registration on valid input", async () => {
    await expect(captainSignUpAction(fd(validData))).rejects.toThrow(
      "REDIRECT:/captain?tab=registration&eventId=event-abc",
    );
    expect(createCaptainAccount).toHaveBeenCalledWith(
      expect.objectContaining({ email: "budi@test.com", name: "Budi Santoso", passwordHash: expect.any(String) }),
    );
    expect(registerTeam).not.toHaveBeenCalled();
    expect(createTeamRegistrationRequest).not.toHaveBeenCalled();
  });

  it("hashes password before creating account", async () => {
    await expect(captainSignUpAction(fd(validData))).rejects.toThrow("REDIRECT:");
    expect(bcrypt.hash).toHaveBeenCalledWith("password123", 10);
  });

  it("rejects fullName shorter than 2 characters", async () => {
    await expect(captainSignUpAction(fd({ ...validData, fullName: "A" }))).rejects.toThrow(
      "REDIRECT:/register?eventId=event-abc&error=",
    );
    expect(createCaptainAccount).not.toHaveBeenCalled();
  });

  it("rejects invalid email format", async () => {
    await expect(captainSignUpAction(fd({ ...validData, email: "notanemail" }))).rejects.toThrow(
      "REDIRECT:/register?eventId=event-abc&error=",
    );
  });

  it("rejects password shorter than 8 characters", async () => {
    await expect(captainSignUpAction(fd({ ...validData, password: "short" }))).rejects.toThrow(
      "REDIRECT:/register?eventId=event-abc&error=",
    );
  });

  it("preserves a valid event and locale through successful sign-up", async () => {
    await expect(captainSignUpAction(fd({ ...validData, locale: "en" }))).rejects.toThrow(
      "REDIRECT:/en/captain?tab=registration&eventId=event-abc",
    );
    expect(getEventsByIds).toHaveBeenCalledWith(["event-abc"]);
  });

  it("rejects an invalid event entity ID without creating an account", async () => {
    await expect(captainSignUpAction(fd({ ...validData, eventId: "https://evil.example" }))).rejects.toThrow(
      "REDIRECT:/register?error=",
    );
    expect(createCaptainAccount).not.toHaveBeenCalled();
  });
  it("does not require an event during captain sign-up", async () => {
    await expect(captainSignUpAction(fd({ ...validData, eventId: "" }))).rejects.toThrow(
      "REDIRECT:/captain?success=registered",
    );
    expect(createCaptainAccount).toHaveBeenCalled();
  });

  it("does not validate team fields during captain sign-up", async () => {
    await expect(captainSignUpAction(fd({ ...validData, teamTag: "TOOLONG" }))).rejects.toThrow(
      "REDIRECT:/captain?tab=registration&eventId=event-abc",
    );
    expect(createCaptainAccount).toHaveBeenCalled();
  });

  it("rejects duplicate email", async () => {
    getUserByEmail.mockResolvedValue({ id: "existing-user" });

    await expect(captainSignUpAction(fd(validData))).rejects.toThrow("REDIRECT:/register?eventId=event-abc&error=");
    expect(createCaptainAccount).not.toHaveBeenCalled();
  });

  it("redirects with an error when account creation fails", async () => {
    createCaptainAccount.mockRejectedValue(new Error("Unique constraint failed"));

    await expect(captainSignUpAction(fd(validData))).rejects.toThrow("REDIRECT:/register?eventId=event-abc&error=");
  });

  it("does not create a pending-payment request during captain sign-up", async () => {
    headers.mockResolvedValue(new Headers({ "x-forwarded-for": "10.0.0.99" }));

    await expect(captainSignUpAction(fd(validData))).rejects.toThrow(
      "REDIRECT:/captain?tab=registration&eventId=event-abc",
    );
    expect(createCaptainAccount).toHaveBeenCalledWith(
      expect.objectContaining({ email: "budi@test.com", name: "Budi Santoso" }),
    );
    expect(createTeamRegistrationRequest).not.toHaveBeenCalled();
    expect(registerTeam).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------------
// changePasswordAction
// ------------------------------------------------------------

describe("changePasswordAction", () => {
  const validData = {
    currentPassword: "oldpass123",
    newPassword: "newpass123",
    confirmPassword: "newpass123",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    requireRole.mockResolvedValue(captainSession());
    getUserPasswordHashById.mockResolvedValue("$hash$");
    (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  });

  it("changes password and redirects to /captain?success=password-changed", async () => {
    await expect(changePasswordAction(fd(validData))).rejects.toThrow(
      "REDIRECT:/captain?success=password-changed",
    );
    expect(updateCaptainPassword).toHaveBeenCalledWith("captain-1", "$hashed$");
  });

  it("requires captain session", async () => {
    requireRole.mockResolvedValue(null);

    await expect(changePasswordAction(fd(validData))).rejects.toThrow("REDIRECT:/login");
    expect(updateCaptainPassword).not.toHaveBeenCalled();
  });

  it("rejects empty fields", async () => {
    await expect(
      changePasswordAction(fd({ currentPassword: "", newPassword: "newpass123", confirmPassword: "newpass123" })),
    ).rejects.toThrow("REDIRECT:/captain/settings?error=");
  });

  it("rejects new password shorter than 8 characters", async () => {
    await expect(
      changePasswordAction(fd({ ...validData, newPassword: "short", confirmPassword: "short" })),
    ).rejects.toThrow("REDIRECT:/captain/settings?error=");
  });

  it("rejects mismatched confirm password", async () => {
    await expect(
      changePasswordAction(fd({ ...validData, confirmPassword: "different" })),
    ).rejects.toThrow("REDIRECT:/captain/settings?error=");
  });

  it("rejects wrong current password", async () => {
    (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    await expect(changePasswordAction(fd(validData))).rejects.toThrow(
      "REDIRECT:/captain/settings?error=",
    );
    expect(updateCaptainPassword).not.toHaveBeenCalled();
  });

  it("redirects with error when no password hash found", async () => {
    getUserPasswordHashById.mockResolvedValue(null);

    await expect(changePasswordAction(fd(validData))).rejects.toThrow(
      "REDIRECT:/captain/settings?error=",
    );
  });
});

// ────────────────────────────────────────────────────────────
// requestPasswordResetAction
// ────────────────────────────────────────────────────────────

describe("requestPasswordResetAction", () => {
  const afterCallbacks: Array<() => unknown | Promise<unknown>> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    afterCallbacks.length = 0;
    after.mockImplementation((callback: () => unknown | Promise<unknown>) => {
      afterCallbacks.push(callback);
    });
    checkRateLimit.mockReturnValue(true);
    createPasswordResetToken.mockResolvedValue("a".repeat(64));
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://miracle.example");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("redirects to sent=1 and sends an email for an existing captain", async () => {
    getUserByEmail.mockResolvedValue({ id: "captain-1", role: "captain" });
    sendEmail.mockResolvedValue(undefined);

    await expect(requestPasswordResetAction(fd({ email: "cap@test.com" }))).rejects.toThrow(
      "REDIRECT:/forgot-password?sent=1",
    );
    await afterCallbacks[0]?.();
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "cap@test.com" }),
    );
  });

  it("issues a token and sends a reset link to an existing organizer", async () => {
    getUserByEmail.mockResolvedValue({ id: "organizer-1", role: "organizer" });
    sendEmail.mockResolvedValue(undefined);

    await expect(requestPasswordResetAction(fd({ email: "Organizer@Test.com " }))).rejects.toThrow(
      "REDIRECT:/forgot-password?sent=1",
    );
    await afterCallbacks[0]?.();

    expect(getUserByEmail).toHaveBeenCalledWith("organizer@test.com");
    expect(createPasswordResetToken).toHaveBeenCalledWith("organizer-1");
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: "organizer@test.com",
      html: expect.stringContaining(`https://miracle.example/forgot-password/reset?token=${"a".repeat(64)}`),
    }));
  });

  it("does not issue a token or email for admin accounts, but still redirects to sent=1", async () => {
    getUserByEmail.mockResolvedValue({ id: "admin-1", role: "admin" });

    await expect(requestPasswordResetAction(fd({ email: "admin@test.com" }))).rejects.toThrow(
      "REDIRECT:/forgot-password?sent=1",
    );
    await afterCallbacks[0]?.();

    expect(createPasswordResetToken).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it.each(["captain", "organizer"])("does not issue a token or email for a deactivated %s", async (role) => {
    getUserByEmail.mockResolvedValue({ id: "user-1", role, deactivatedAt: new Date("2026-09-01T00:00:00.000Z") });

    await expect(requestPasswordResetAction(fd({ email: "gone@test.com" }))).rejects.toThrow(
      "REDIRECT:/forgot-password?sent=1",
    );
    await afterCallbacks[0]?.();

    expect(createPasswordResetToken).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("redirects to sent=1 without sending an email when the account does not exist", async () => {
    getUserByEmail.mockResolvedValue(null);

    await expect(requestPasswordResetAction(fd({ email: "nobody@test.com" }))).rejects.toThrow(
      "REDIRECT:/forgot-password?sent=1",
    );
    await afterCallbacks[0]?.();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("still redirects to sent=1 even if sendEmail rejects", async () => {
    getUserByEmail.mockResolvedValue({ id: "captain-1", role: "captain" });
    sendEmail.mockRejectedValue(new Error("Resend API unreachable"));

    await expect(requestPasswordResetAction(fd({ email: "cap@test.com" }))).rejects.toThrow(
      "REDIRECT:/forgot-password?sent=1",
    );
    await afterCallbacks[0]?.();
  });

  it("uses the exact 30-minute copy and keeps delivery logs redacted", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const rawToken = "a".repeat(64);
    getUserByEmail.mockResolvedValue({ id: "captain-1", role: "captain" });
    createPasswordResetToken.mockResolvedValue(rawToken);
    sendEmail.mockRejectedValue(new Error(`delivery failed for cap@test.com ${rawToken}`));

    await expect(requestPasswordResetAction(fd({ email: "cap@test.com" }))).rejects.toThrow(
      "REDIRECT:/forgot-password?sent=1",
    );

    await afterCallbacks[0]?.();
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      html: expect.stringContaining("30 menit"),
    }));
    expect(sendEmail.mock.calls[0]?.[0]?.html).not.toContain("1 jam");
    const logs = errorSpy.mock.calls.flat().join(" ");
    expect(logs).not.toContain("cap@test.com");
    expect(logs).not.toContain(rawToken);
    expect(logs).not.toContain("forgot-password/reset");
    errorSpy.mockRestore();
  });

  it("keeps a rate-limited request indistinguishable and does not issue a token", async () => {
    checkRateLimit.mockReturnValue(false);

    await expect(requestPasswordResetAction(fd({ email: "cap@test.com" }))).rejects.toThrow(
      "REDIRECT:/forgot-password?sent=1",
    );

    expect(getUserByEmail).not.toHaveBeenCalled();
    expect(createPasswordResetToken).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("defers issuance and email while keeping known and unknown foreground work identical", async () => {
    let resolveToken!: (token: string) => void;
    const deferredToken = new Promise<string>((resolve) => {
      resolveToken = resolve;
    });
    createPasswordResetToken.mockReturnValue(deferredToken);
    getUserByEmail.mockResolvedValueOnce({ id: "captain-1", role: "captain" }).mockResolvedValueOnce(null);
    sendEmail.mockResolvedValue(undefined);

    let knownRedirectError: unknown;
    const knownResult = requestPasswordResetAction(fd({ email: "cap@test.com" })).catch((error: unknown) => {
      knownRedirectError = error;
      return error;
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    let unknownRedirectError: unknown;
    const unknownResult = requestPasswordResetAction(fd({ email: "nobody@test.com" })).catch((error: unknown) => {
      unknownRedirectError = error;
      return error;
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(getUserByEmail).toHaveBeenCalledTimes(2);
    expect(after).toHaveBeenCalledTimes(2);
    expect(createPasswordResetToken).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(knownRedirectError).toMatchObject({ message: "REDIRECT:/forgot-password?sent=1" });
    expect(unknownRedirectError).toMatchObject({ message: "REDIRECT:/forgot-password?sent=1" });

    await afterCallbacks[1]?.();
    expect(sendEmail).not.toHaveBeenCalled();
    createPasswordResetToken.mockResolvedValue("a".repeat(64));
    await afterCallbacks[0]?.();
    expect(sendEmail).toHaveBeenCalledTimes(1);

    resolveToken("a".repeat(64));
    await expect(knownResult).resolves.toMatchObject({ message: "REDIRECT:/forgot-password?sent=1" });
    await expect(unknownResult).resolves.toMatchObject({ message: "REDIRECT:/forgot-password?sent=1" });
  });

  it("rejects an invalid email format", async () => {
    await expect(requestPasswordResetAction(fd({ email: "not-an-email" }))).rejects.toThrow(
      "REDIRECT:/forgot-password?error=",
    );
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("emits the password-reset request operation signal", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await expect(requestPasswordResetAction(fd({ email: "cap@test.com" }))).rejects.toThrow(
      "REDIRECT:/forgot-password?sent=1",
    );

    const operations = info.mock.calls.map(([line]) => JSON.parse(String(line)).operation);
    expect(operations).toContain("password_reset_request");
    info.mockRestore();
  });

  it("emits safe failed signals for rate limits and deferred delivery failures before the generic redirect", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    checkRateLimit.mockReturnValueOnce(false);
    await expect(requestPasswordResetAction(fd({ email: "private@example.test" }))).rejects.toThrow(
      "REDIRECT:/forgot-password?sent=1",
    );
    const rateLimitRecord = info.mock.calls
      .map(([line]) => JSON.parse(String(line)))
      .find((record) => record.operation === "password_reset_request" && record.phase === "failed");
    expect(rateLimitRecord).toMatchObject({ status: 429, errorCode: "rate_limited" });

    info.mockClear();
    checkRateLimit.mockReturnValue(true);
    getUserByEmail.mockResolvedValue({ id: "captain-private", role: "captain" });
    const rawToken = "private-reset-token".padEnd(64, "x");
    createPasswordResetToken.mockResolvedValue(rawToken);
    sendEmail.mockRejectedValue(new Error(`delivery failed for private@example.test ${rawToken}`));
    await expect(requestPasswordResetAction(fd({ email: "private@example.test" }))).rejects.toThrow(
      "REDIRECT:/forgot-password?sent=1",
    );
    await afterCallbacks.at(-1)?.();

    const records = info.mock.calls.map(([line]) => JSON.parse(String(line)));
    expect(records).toContainEqual(expect.objectContaining({
      operation: "password_reset_request",
      phase: "failed",
      status: 500,
      errorCode: "delivery_failed",
    }));
    expect(JSON.stringify(records)).not.toContain("private@example.test");
    expect(JSON.stringify(records)).not.toContain(rawToken);
  });

  it("emits a safe failed consume signal for invalid, reused, or expired tokens before the generic redirect", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const rawToken = "private-reset-token".padEnd(64, "x");
    consumePasswordResetToken.mockRejectedValue(new Error("Token tidak valid atau sudah kadaluarsa"));

    await expect(resetPasswordAction(fd({
      token: rawToken,
      password: "new-password",
      confirmPassword: "new-password",
    }))).rejects.toThrow("REDIRECT:/forgot-password/reset?token=");

    const records = info.mock.calls.map(([line]) => JSON.parse(String(line)));
    expect(records).toContainEqual(expect.objectContaining({
      operation: "password_reset_consume",
      phase: "failed",
      status: 400,
      errorCode: "token_invalid",
    }));
    expect(JSON.stringify(records)).not.toContain(rawToken);
  });
});

describe("resetPasswordAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimit.mockReturnValue(true);
    consumePasswordResetToken.mockResolvedValue(undefined);
    (bcrypt.hash as ReturnType<typeof vi.fn>).mockResolvedValue("$new-hash$");
  });

  it("rate-limits token consumption before hashing or consuming", async () => {
    checkRateLimit.mockReturnValue(false);

    await expect(resetPasswordAction(fd({
      token: "a".repeat(64),
      password: "new-password",
      confirmPassword: "new-password",
    }))).rejects.toThrow("REDIRECT:/forgot-password/reset?token=");

    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(consumePasswordResetToken).not.toHaveBeenCalled();
  });

  it("consumes a valid token and redirects without exposing the password", async () => {
    const token = "a".repeat(64);

    await expect(resetPasswordAction(fd({
      token,
      password: "new-password",
      confirmPassword: "new-password",
    }))).rejects.toThrow("REDIRECT:/login?reset=success");

    expect(consumePasswordResetToken).toHaveBeenCalledWith(token, "$new-hash$");
  });

  it("emits the password-reset consume operation signal", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const token = "a".repeat(64);

    await expect(resetPasswordAction(fd({
      token,
      password: "new-password",
      confirmPassword: "new-password",
    }))).rejects.toThrow("REDIRECT:/login?reset=success");

    const operations = info.mock.calls.map(([line]) => JSON.parse(String(line)).operation);
    expect(operations).toContain("password_reset_consume");
    info.mockRestore();
  });
});