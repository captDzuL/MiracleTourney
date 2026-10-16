import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAnyRole: vi.fn(),
  checkRateLimit: vi.fn(),
  revalidateTag: vi.fn(),
  suspendIncompleteTeam: vi.fn(),
  restoreSuspendedTeam: vi.fn(),
  extendCompletionDeadline: vi.fn(),
  updateCaptainTeamContact: vi.fn(),
  requireCaptainSession: vi.fn(),
  redirectToActiveLocale: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidateTag: mocks.revalidateTag, revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/actions/shared/session", () => ({ requireCaptainSession: mocks.requireCaptainSession }));
vi.mock("@/i18n/redirect", () => ({ redirectToActiveLocale: mocks.redirectToActiveLocale }));
vi.mock("@/lib/auth/session", () => ({ requireAnyRole: mocks.requireAnyRole }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/registration/completion-repository", () => ({
  suspendIncompleteTeam: mocks.suspendIncompleteTeam,
  restoreSuspendedTeam: mocks.restoreSuspendedTeam,
  extendCompletionDeadline: mocks.extendCompletionDeadline,
  updateCaptainTeamContact: mocks.updateCaptainTeamContact,
}));

import { captainUpdateContactAction, extendTeamDeadlineAction, restoreTeamAction, suspendTeamAction } from "./registration-completion-actions";
import { UserFacingError } from "@/lib/security/public-error";

const organizer = { id: "org-1", role: "organizer", mustChangePassword: false };

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAnyRole.mockResolvedValue(organizer);
  mocks.checkRateLimit.mockResolvedValue(true);
});

describe.each([
  ["suspendTeamAction", suspendTeamAction, mocks.suspendIncompleteTeam],
  ["restoreTeamAction", restoreTeamAction, mocks.restoreSuspendedTeam],
  ["extendTeamDeadlineAction", extendTeamDeadlineAction, mocks.extendCompletionDeadline],
] as const)("%s", (_name, action, operation) => {
  it("runs the operation for the signed-in organizer and refreshes the cached pages", async () => {
    operation.mockResolvedValue(undefined);
    await expect(action(form({ eventId: "event-1", teamId: "team-1" }))).resolves.toEqual({ status: "done" });
    expect(operation).toHaveBeenCalledWith(organizer, "event-1", "team-1");
    expect(mocks.revalidateTag).toHaveBeenCalledWith("teams");
    expect(mocks.revalidateTag).toHaveBeenCalledWith("events");
  });

  it("rejects ids that are missing or have unsafe characters", async () => {
    await expect(action(form({ eventId: "event-1" }))).resolves.toMatchObject({ status: "failed" });
    await expect(action(form({ eventId: "event-1", teamId: "../x" }))).resolves.toMatchObject({ status: "failed" });
    expect(operation).not.toHaveBeenCalled();
  });

  it("refuses without a session", async () => {
    mocks.requireAnyRole.mockResolvedValue(null);
    await expect(action(form({ eventId: "event-1", teamId: "team-1" }))).resolves.toEqual({ status: "failed", message: "Sesi organizer tidak ditemukan." });
    expect(operation).not.toHaveBeenCalled();
  });

  it("refuses an organizer who still has to change the temporary password", async () => {
    mocks.requireAnyRole.mockResolvedValue({ ...organizer, mustChangePassword: true });
    await expect(action(form({ eventId: "event-1", teamId: "team-1" }))).resolves.toMatchObject({ status: "failed" });
    expect(operation).not.toHaveBeenCalled();
  });

  it("stops when the rate limit is reached", async () => {
    mocks.checkRateLimit.mockResolvedValue(false);
    await expect(action(form({ eventId: "event-1", teamId: "team-1" }))).resolves.toMatchObject({ status: "failed" });
    expect(operation).not.toHaveBeenCalled();
  });

  it("shows a business refusal as it is", async () => {
    operation.mockRejectedValue(new UserFacingError("Slot pendaftaran event ini sudah penuh."));
    await expect(action(form({ eventId: "event-1", teamId: "team-1" }))).resolves.toEqual({
      status: "failed",
      message: "Slot pendaftaran event ini sudah penuh.",
    });
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("hides the message of an unexpected failure", async () => {
    operation.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.1:5432"));
    await expect(action(form({ eventId: "event-1", teamId: "team-1" }))).resolves.toEqual({
      status: "failed",
      message: "Perubahan tidak dapat disimpan.",
    });
  });

  it("turns an access error into the generic message", async () => {
    operation.mockRejectedValue(new Error("Not authorized"));
    const result = await action(form({ eventId: "event-9", teamId: "team-1" }));
    expect(result.status).toBe("failed");
  });
});

describe("captainUpdateContactAction", () => {
  beforeEach(() => {
    mocks.requireCaptainSession.mockResolvedValue({ id: "captain-1" });
    mocks.redirectToActiveLocale.mockResolvedValue(undefined);
    mocks.updateCaptainTeamContact.mockResolvedValue(undefined);
  });

  it("saves the number for the signed-in captain and goes back with a success signal", async () => {
    await captainUpdateContactAction(form({ teamId: "team-1", captainContact: " 081234567890 " }));
    expect(mocks.updateCaptainTeamContact).toHaveBeenCalledWith("captain-1", "team-1", "081234567890");
    expect(mocks.revalidateTag).toHaveBeenCalledWith("teams");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/captain");
    expect(mocks.redirectToActiveLocale).toHaveBeenCalledWith("/captain?success=contact-saved");
  });

  it.each([
    ["missing", {}],
    ["too short", { captainContact: "0812" }],
    ["with markup", { captainContact: "<b>0812345678</b>" }],
    ["too long", { captainContact: "0".repeat(33) }],
  ])("rejects a number that is %s", async (_label, extra) => {
    await captainUpdateContactAction(form({ teamId: "team-1", ...extra }));
    expect(mocks.updateCaptainTeamContact).not.toHaveBeenCalled();
    expect(mocks.redirectToActiveLocale).toHaveBeenCalledWith(`/captain?error=${encodeURIComponent("Isi nomor WhatsApp kapten, 6 sampai 32 karakter.")}`);
  });

  it("stops when the captain saves numbers too fast", async () => {
    mocks.checkRateLimit.mockResolvedValueOnce(false);
    await captainUpdateContactAction(form({ teamId: "team-1", captainContact: "081234567890" }));
    expect(mocks.updateCaptainTeamContact).not.toHaveBeenCalled();
    expect(mocks.redirectToActiveLocale).toHaveBeenCalledWith(`/captain?error=${encodeURIComponent("Terlalu banyak percobaan. Coba lagi nanti.")}`);
  });

  it("rejects an unsafe team id", async () => {
    await captainUpdateContactAction(form({ teamId: "../x", captainContact: "081234567890" }));
    expect(mocks.updateCaptainTeamContact).not.toHaveBeenCalled();
  });

  it("shows a business refusal and hides an unexpected failure", async () => {
    mocks.updateCaptainTeamContact.mockRejectedValueOnce(new UserFacingError("Tim tidak ditemukan."));
    await captainUpdateContactAction(form({ teamId: "team-9", captainContact: "081234567890" }));
    expect(mocks.redirectToActiveLocale).toHaveBeenLastCalledWith(`/captain?error=${encodeURIComponent("Tim tidak ditemukan.")}`);

    mocks.updateCaptainTeamContact.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
    await captainUpdateContactAction(form({ teamId: "team-1", captainContact: "081234567890" }));
    expect(mocks.redirectToActiveLocale).toHaveBeenLastCalledWith(`/captain?error=${encodeURIComponent("Gagal menyimpan nomor WhatsApp.")}`);
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });
});
