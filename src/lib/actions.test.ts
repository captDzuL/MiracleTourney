import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  addPlayer,
  approveStatSubmission,
  approveTeamRegistrationRequest,
  assertCaptainCanSubmitStats,
  assertUserCanManageEvent,
  assertUserCanReviewStatSubmission,
  autoTransitionEventToOngoing,
  createCaptainWithTeam,
  createEvent,
  createTeamRegistrationRequest,
  deletePlayer,
  getImportSnapshot,
  getOrganizerUserById,
  getPublishedEvents,
  getUserByEmail,
  getUserPasswordHashById,
  generateCertificateIfFinal,
  importTeams,
  rejectStatSubmission,
  rejectTeamRegistrationRequest,
  registerTeam,
  revalidatePath,
  revalidateTag,
  requireRole,
  setEventStatus,
  setMatchGames,
  setMatchResult,
  signIn,
  signOut,
  headers,
  updateCaptainPassword,
  updatePaymentSettings,
  updateTeamRegistrationProof,
  updateEventStream,
  updatePlayer,
  updateEventCertificateAssets,
  updateEventPublicInfo,
  upsertRoundConfig,
  upsertStatSubmission,
  setTeamCaptainDisplay,
} = vi.hoisted(() => ({
  addPlayer: vi.fn(),
  approveStatSubmission: vi.fn(),
  approveTeamRegistrationRequest: vi.fn(),
  assertCaptainCanSubmitStats: vi.fn(),
  assertUserCanManageEvent: vi.fn(),
  assertUserCanReviewStatSubmission: vi.fn(),
  autoTransitionEventToOngoing: vi.fn(),
  createCaptainWithTeam: vi.fn(),
  createEvent: vi.fn(),
  createTeamRegistrationRequest: vi.fn(),
  deletePlayer: vi.fn(),
  getImportSnapshot: vi.fn(),
  getOrganizerUserById: vi.fn(),
  getPublishedEvents: vi.fn(),
  getUserByEmail: vi.fn(),
  getUserPasswordHashById: vi.fn(),
  generateCertificateIfFinal: vi.fn(),
  importTeams: vi.fn(),
  rejectStatSubmission: vi.fn(),
  rejectTeamRegistrationRequest: vi.fn(),
  registerTeam: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  requireRole: vi.fn(),
  setEventStatus: vi.fn(),
  setMatchGames: vi.fn(),
  setMatchResult: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  headers: vi.fn(),
  updateCaptainPassword: vi.fn(),
  updatePaymentSettings: vi.fn(),
  updateTeamRegistrationProof: vi.fn(),
  updateEventStream: vi.fn(),
  updatePlayer: vi.fn(),
  updateEventCertificateAssets: vi.fn(),
  updateEventPublicInfo: vi.fn(),
  upsertRoundConfig: vi.fn(),
  upsertStatSubmission: vi.fn(),
  setTeamCaptainDisplay: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath, revalidateTag }));
vi.mock("next/navigation", () => ({
  redirect: (url: string): never => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("next/headers", () => ({ headers }));
vi.mock("@/lib/auth/session", () => ({ requireRole, signIn, signOut }));
vi.mock("@/lib/imports/team-import", () => ({
  parseAndValidateTeamImport: vi.fn(),
}));
vi.mock("@/lib/platform/repository", () => ({
  addPlayer,
  approveStatSubmission,
  approveTeamRegistrationRequest,
  assertCaptainCanSubmitStats,
  assertUserCanManageEvent,
  assertUserCanReviewStatSubmission,
  autoTransitionEventToOngoing,
  createCaptainWithTeam,
  createEvent,
  createTeamRegistrationRequest,
  deletePlayer,
  getImportSnapshot,
  getOrganizerUserById,
  getPublishedEvents,
  getUserByEmail,
  getUserPasswordHashById,
  importTeams,
  rejectStatSubmission,
  rejectTeamRegistrationRequest,
  registerTeam,
  setEventStatus,
  setMatchGames,
  setMatchResult,
  updateCaptainPassword,
  updatePaymentSettings,
  updateTeamRegistrationProof,
  updateEventCertificateAssets,
  updateEventPublicInfo,
  updateEventStream,
  updatePlayer,
  upsertRoundConfig,
  upsertStatSubmission,
  setTeamCaptainDisplay,
}));
vi.mock("@/lib/certificate/generate", () => ({
  generateCertificateIfFinal,
}));
vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("$hashed$"),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

import { parseAndValidateTeamImport } from "@/lib/imports/team-import";
import bcrypt from "bcryptjs";
import {
  adminApproveStatAction,
  adminApprovePaymentAction,
  adminCreateEventAction,
  adminImportTeamsCsvAction,
  adminRejectStatAction,
  adminRejectPaymentAction,
  adminSetMatchGamesAction,
  adminSetRoundConfigAction,
  adminUploadCharacterArtAction,
  adminUpdateEventStatusAction,
  adminUpdateEventPublicInfoAction,
  adminUpdatePaymentSettingsAction,
  adminUpdateMatchResultAction,
  adminUpdateStreamAction,
  captainAddPlayerAction,
  captainDeletePlayerAction,
  captainRegisterTeamAction,
  captainUploadPaymentProofAction,
  captainSetDisplayCaptainAction,
  captainSignUpAction,
  captainSubmitStatsAction,
  captainUpdatePlayerAction,
  changePasswordAction,
  loginAction,
} from "./actions";
import { logoutAction } from "./session-actions";

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

describe("loginAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects admin to /admin on valid credentials", async () => {
    signIn.mockResolvedValue({ ok: true, user: { role: "admin" } });

    await expect(loginAction(fd({ email: "admin@test.com", password: "secret123" }))).rejects.toThrow(
      "REDIRECT:/admin",
    );
    expect(signIn).toHaveBeenCalledWith("admin@test.com", "secret123");
  });

  it("redirects captain to /captain on valid credentials", async () => {
    signIn.mockResolvedValue({ ok: true, user: { role: "captain" } });

    await expect(loginAction(fd({ email: "cap@test.com", password: "secret123" }))).rejects.toThrow(
      "REDIRECT:/captain",
    );
  });

  it("redirects to /login?error=invalid when credentials are wrong", async () => {
    signIn.mockResolvedValue({ ok: false, error: "Invalid email or password." });

    await expect(loginAction(fd({ email: "bad@test.com", password: "wrong" }))).rejects.toThrow(
      "REDIRECT:/login?error=invalid",
    );
  });

  it("redirects to a database error when sign-in cannot reach the database", async () => {
    signIn.mockRejectedValue(new Error("Can't reach database server at `db.example.com:5432`"));

    await expect(loginAction(fd({ email: "admin@test.com", password: "secret123" }))).rejects.toThrow(
      "REDIRECT:/login?error=database",
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
    getUserByEmail.mockResolvedValue(null);
    getPublishedEvents.mockResolvedValue([{ id: "event-abc" }]);
    createCaptainWithTeam.mockResolvedValue({ id: "captain-new" });
    signIn.mockResolvedValue({ ok: true, user: { role: "captain" } });
  });

  it("creates account and redirects to /captain?success=registered on valid input", async () => {
    await expect(captainSignUpAction(fd(validData))).rejects.toThrow(
      "REDIRECT:/captain?success=registered",
    );
    expect(createCaptainWithTeam).toHaveBeenCalledWith(
      expect.objectContaining({ email: "budi@test.com", teamName: "Tim Budi", teamTag: "TBD" }),
    );
  });

  it("hashes password before creating account", async () => {
    await expect(captainSignUpAction(fd(validData))).rejects.toThrow("REDIRECT:");
    expect(bcrypt.hash).toHaveBeenCalledWith("password123", 10);
  });

  it("rejects fullName shorter than 2 characters", async () => {
    await expect(captainSignUpAction(fd({ ...validData, fullName: "A" }))).rejects.toThrow(
      "REDIRECT:/register?error=",
    );
    expect(createCaptainWithTeam).not.toHaveBeenCalled();
  });

  it("rejects invalid email format", async () => {
    await expect(captainSignUpAction(fd({ ...validData, email: "notanemail" }))).rejects.toThrow(
      "REDIRECT:/register?error=",
    );
  });

  it("rejects password shorter than 8 characters", async () => {
    await expect(captainSignUpAction(fd({ ...validData, password: "short" }))).rejects.toThrow(
      "REDIRECT:/register?error=",
    );
  });

  it("rejects missing eventId", async () => {
    await expect(captainSignUpAction(fd({ ...validData, eventId: "" }))).rejects.toThrow(
      "REDIRECT:/register?error=",
    );
  });

  it("rejects teamTag longer than 4 characters", async () => {
    await expect(captainSignUpAction(fd({ ...validData, teamTag: "TOOLONG" }))).rejects.toThrow(
      "REDIRECT:/register?error=",
    );
  });

  it("rejects duplicate email", async () => {
    getUserByEmail.mockResolvedValue({ id: "existing-user" });

    await expect(captainSignUpAction(fd(validData))).rejects.toThrow("REDIRECT:/register?error=");
    expect(createCaptainWithTeam).not.toHaveBeenCalled();
  });

  it("rejects event not in published list", async () => {
    getPublishedEvents.mockResolvedValue([{ id: "other-event" }]);

    await expect(captainSignUpAction(fd(validData))).rejects.toThrow("REDIRECT:/register?error=");
  });

  it("redirects with duplicate-tag message when createCaptainWithTeam throws Unique constraint", async () => {
    createCaptainWithTeam.mockRejectedValue(new Error("Unique constraint failed"));

    await expect(captainSignUpAction(fd(validData))).rejects.toThrow("REDIRECT:/register?error=");
  });
});

// ────────────────────────────────────────────────────────────
// changePasswordAction
// ────────────────────────────────────────────────────────────

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
// captain actions (existing + additions)
// ────────────────────────────────────────────────────────────

describe("captain actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRole.mockResolvedValue(captainSession());
    assertCaptainCanSubmitStats.mockResolvedValue(undefined);
  });

  it("requires a captain session before registering a team", async () => {
    requireRole.mockResolvedValue(null);

    await expect(captainRegisterTeamAction(fd({ eventId: "e1", name: "Team A", tag: "TA" }))).rejects.toThrow(
      "REDIRECT:/login",
    );
    expect(registerTeam).not.toHaveBeenCalled();
  });

  it("derives the registering captain from the authenticated session", async () => {
    await expect(
      captainRegisterTeamAction(fd({ eventId: "event-flashpeak-open", name: "Session United", tag: "SES" })),
    ).rejects.toThrow("REDIRECT:/captain?success=team-created");
    expect(registerTeam).toHaveBeenCalledWith({
      eventId: "event-flashpeak-open",
      captainId: "captain-1",
      name: "Session United",
      tag: "SES",
    });
  });


  it("creates a pending payment request when the event requires a fee", async () => {
    registerTeam.mockRejectedValue(new Error("Event ini membutuhkan verifikasi pembayaran sebelum tim aktif."));
    createTeamRegistrationRequest.mockResolvedValue({ id: "request-1", status: "pending_payment" });

    await expect(
      captainRegisterTeamAction(fd({ eventId: "event-paid", name: "Paid United", tag: "PDU" })),
    ).rejects.toThrow("REDIRECT:/captain?tab=registration&success=payment-pending");

    expect(createTeamRegistrationRequest).toHaveBeenCalledWith({
      eventId: "event-paid",
      captainId: "captain-1",
      name: "Paid United",
      tag: "PDU",
    });
    expect(revalidateTag).toHaveBeenCalledWith("teams");
    expect(revalidatePath).toHaveBeenCalledWith("/captain");
  });

  it("uploads a payment proof for the authenticated captain", async () => {
    updateTeamRegistrationProof.mockResolvedValue({ id: "request-1", status: "pending_review" });
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    await expect(
      captainUploadPaymentProofAction(fd({ requestId: "request-1", paymentProof: new File([png], "proof.png", { type: "image/png" }) })),
    ).rejects.toThrow("REDIRECT:/captain?tab=registration&success=payment-proof-uploaded");

    expect(updateTeamRegistrationProof).toHaveBeenCalledWith("captain-1", "request-1", expect.stringContaining("payment-proofs/"));
    expect(revalidatePath).toHaveBeenCalledWith("/captain");
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
  beforeEach(() => {
    vi.clearAllMocks();
    requireRole.mockResolvedValue(adminSession());
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
    ).rejects.toThrow("REDIRECT:/admin?error=");
  });
});

// ────────────────────────────────────────────────────────────
// adminUpdateMatchResultAction
// ────────────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────
// adminImportTeamsCsvAction
// ────────────────────────────────────────────────────────────

describe("adminImportTeamsCsvAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRole.mockResolvedValue(adminSession());
    getImportSnapshot.mockResolvedValue({ events: [], teams: [] });
  });

  it("requires an admin session", async () => {
    requireRole.mockResolvedValue(null);
    const f = new FormData();
    f.set("csv", new File(["data"], "teams.csv", { type: "text/csv" }));
    await expect(adminImportTeamsCsvAction(f)).rejects.toThrow("REDIRECT:/login");
  });

  it("redirects with error when no file is provided", async () => {
    await expect(adminImportTeamsCsvAction(fd({}))).rejects.toThrow(
      "REDIRECT:/admin?error=Please%20choose%20a%20CSV%20file%20before%20importing.",
    );
    expect(importTeams).not.toHaveBeenCalled();
  });

  it("rejects oversized CSV files before reading or parsing them", async () => {
    const f = new FormData();
    f.set("csv", new File(["x".repeat(262_145)], "large.csv", { type: "text/csv" }));

    await expect(adminImportTeamsCsvAction(f)).rejects.toThrow("REDIRECT:/admin?error=");
    expect(parseAndValidateTeamImport).not.toHaveBeenCalled();
    expect(importTeams).not.toHaveBeenCalled();
  });

  it("redirects with error when parseAndValidateTeamImport fails", async () => {
    const f = new FormData();
    f.set("csv", new File(["bad"], "bad.csv", { type: "text/csv" }));
    (parseAndValidateTeamImport as ReturnType<typeof vi.fn>).mockReturnValue({
      ok: false,
      message: "Invalid header row",
    });

    await expect(adminImportTeamsCsvAction(f)).rejects.toThrow("REDIRECT:/admin?error=");
    expect(importTeams).not.toHaveBeenCalled();
  });

  it("imports teams and redirects with count on success", async () => {
    const rows = [{ eventId: "e1", teamName: "A", teamTag: "AA", captainName: "C", captainContact: "c@c.com" }];
    const f = new FormData();
    f.set("csv", new File(["csv content"], "teams.csv", { type: "text/csv" }));
    (parseAndValidateTeamImport as ReturnType<typeof vi.fn>).mockReturnValue({ ok: true, rows });

    await expect(adminImportTeamsCsvAction(f)).rejects.toThrow(
      "REDIRECT:/admin?success=teams-imported&count=1",
    );
    expect(importTeams).toHaveBeenCalledWith(rows);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
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
});


  it("updates global payment settings", async () => {
    updatePaymentSettings.mockResolvedValue({ id: "global", qrisImageUrl: "/payment/qris.png" });

    await expect(
      adminUpdatePaymentSettingsAction(fd({ qrisImageUrl: "/payment/qris.png", instructions: "Scan QRIS lalu upload bukti." })),
    ).rejects.toThrow("REDIRECT:/admin?phase=payments&success=payment-settings-updated");

    expect(updatePaymentSettings).toHaveBeenCalledWith({ qrisImageUrl: "/payment/qris.png", instructions: "Scan QRIS lalu upload bukti." });
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
  });

  it("uploads a QRIS image file and uses it instead of the text URL field", async () => {
    updatePaymentSettings.mockResolvedValue({ id: "global", qrisImageUrl: "/payment-qris/global-123.png" });
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    await expect(
      adminUpdatePaymentSettingsAction(fd({
        qrisImageUrl: "https://old-url-should-be-ignored.example/qris.png",
        instructions: "Scan QRIS lalu upload bukti.",
        qrisImage: new File([png], "qris.png", { type: "image/png" }),
      })),
    ).rejects.toThrow("REDIRECT:/admin?phase=payments&success=payment-settings-updated");

    expect(updatePaymentSettings).toHaveBeenCalledWith({
      qrisImageUrl: expect.stringContaining("payment-qris/"),
      instructions: "Scan QRIS lalu upload bukti.",
    });
  });

  it("approves paid registration requests from admin", async () => {
    approveTeamRegistrationRequest.mockResolvedValue({ id: "team-paid" });

    await expect(adminApprovePaymentAction(fd({ requestId: "request-1" }))).rejects.toThrow(
      "REDIRECT:/admin?phase=payments&success=payment-approved",
    );

    expect(approveTeamRegistrationRequest).toHaveBeenCalledWith(organizerSession(), "request-1");
    expect(revalidateTag).toHaveBeenCalledWith("teams");
  });

  it("rejects paid registration requests with a reason", async () => {
    rejectTeamRegistrationRequest.mockResolvedValue({ id: "request-1", status: "rejected" });

    await expect(adminRejectPaymentAction(fd({ requestId: "request-1", reason: "Bukti tidak sesuai." }))).rejects.toThrow(
      "REDIRECT:/admin?phase=payments&success=payment-rejected",
    );

    expect(rejectTeamRegistrationRequest).toHaveBeenCalledWith(organizerSession(), "request-1", "Bukti tidak sesuai.");
  });
describe("captainSubmitStatsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRole.mockResolvedValue(captainSession());
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
      3,
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
      5,
    );
  });

  it("redirects with error when setMatchGames throws", async () => {
    setMatchGames.mockRejectedValue(new Error("Series winner not yet determined"));

    await expect(adminSetMatchGamesAction(bo3FormData())).rejects.toThrow(
      "REDIRECT:/admin?matchEventId=event-1&error=",
    );
  });
});

describe("adminUploadCharacterArtAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRole.mockResolvedValue(adminSession());
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
    ).rejects.toThrow("REDIRECT:/admin?error=");
    expect(updateEventCertificateAssets).not.toHaveBeenCalled();
  });
});
