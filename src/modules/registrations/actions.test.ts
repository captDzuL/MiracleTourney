import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  assertCaptainCanUploadPaymentProof,
  getSessionActor,
  getSessionUser,
  redirect,
  registerTeam,
  updatePaymentSettings,
  updateTeamRegistrationProof,
  uploadRegistrationImage,
  validateTeamData,
} = vi.hoisted(() => ({
  assertCaptainCanUploadPaymentProof: vi.fn(),
  getSessionActor: vi.fn(),
  getSessionUser: vi.fn(),
  redirect: vi.fn((url: string): never => { throw new Error(`REDIRECT:${url}`); }),
  registerTeam: vi.fn(),
  updatePaymentSettings: vi.fn(),
  updateTeamRegistrationProof: vi.fn(),
  uploadRegistrationImage: vi.fn(),
  validateTeamData: vi.fn(() => []),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/i18n/redirect", () => ({
  redirectToActiveLocale: (url: string): never => { throw new Error(`REDIRECT:${url}`); },
}));
vi.mock("@/modules/identity", () => ({ getSessionActor, getSessionUser }));
vi.mock("@/lib/validation/team-data", () => ({ validateTeamData }));
vi.mock("./service", () => ({
  assertCaptainCanUploadPaymentProof,
  registerTeam,
  updatePaymentSettings,
  updateTeamRegistrationProof,
}));
vi.mock("./upload", () => ({ uploadRegistrationImage }));

import { adminUpdatePaymentSettingsAction, captainRegisterTeamAction, captainUploadPaymentProofAction } from "./actions";

function validPngFile(name: string) {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], name, { type: "image/png" });
}

describe("registration actions side-effect ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionActor.mockResolvedValue({ userId: "captain-1", role: "captain", tenantId: null });
  });

  it("does not store payment proof when captain ownership preflight fails", async () => {
    assertCaptainCanUploadPaymentProof.mockRejectedValue(new Error("Pendaftaran pembayaran tidak ditemukan."));
    const formData = new FormData();
    formData.set("requestId", "request-other");
    formData.set("paymentProof", validPngFile("proof.png"));

    await expect(captainUploadPaymentProofAction(formData)).rejects.toThrow(
      "REDIRECT:/captain?tab=registration&error=Pendaftaran%20pembayaran%20tidak%20ditemukan.",
    );
    expect(uploadRegistrationImage).not.toHaveBeenCalled();
    expect(updateTeamRegistrationProof).not.toHaveBeenCalled();
  });

  it("validates registration with the authenticated captain's stored name", async () => {
    getSessionUser.mockResolvedValue({ id: "captain-1", role: "captain", name: "Alya Captain", email: "alya@test.com" });
    const formData = new FormData();
    formData.set("eventId", "event-1");
    formData.set("name", "Session United");
    formData.set("tag", "SES");

    await expect(captainRegisterTeamAction(formData)).rejects.toThrow("REDIRECT:/captain?success=team-created");

    expect(validateTeamData).toHaveBeenCalledWith({
      teamName: "Session United",
      teamTag: "SES",
      captainName: "Alya Captain",
    });
  });

  it("does not store global QRIS for organizer or legacy admin", async () => {
    getSessionUser.mockResolvedValue({ id: "organizer-1", role: "organizer", name: "Organizer", email: "org@test.com" });
    const formData = new FormData();
    formData.set("qrisImage", validPngFile("qris.png"));

    await expect(adminUpdatePaymentSettingsAction(formData)).rejects.toThrow("REDIRECT:/login");
    expect(uploadRegistrationImage).not.toHaveBeenCalled();
    expect(updatePaymentSettings).not.toHaveBeenCalled();
  });
});