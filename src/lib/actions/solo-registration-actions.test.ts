import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  checkRateLimit: vi.fn(),
  eventFindUnique: vi.fn(),
  registrationFindFirst: vi.fn(),
  registerSoloAndAnnounce: vi.fn(),
  uploadSoloProofAndAnnounce: vi.fn(),
  withdrawSoloAndAnnounce: vi.fn(),
  uploadImageAsset: vi.fn(),
  revalidatePath: vi.fn(),
  writeServerLog: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/solo/lookups", () => ({
  findEventSlug: mocks.eventFindUnique,
  findOwnSoloRegistration: mocks.registrationFindFirst,
}));
vi.mock("@/lib/solo/registration-service", () => ({
  registerSoloAndAnnounce: mocks.registerSoloAndAnnounce,
  uploadSoloProofAndAnnounce: mocks.uploadSoloProofAndAnnounce,
  withdrawSoloAndAnnounce: mocks.withdrawSoloAndAnnounce,
}));
vi.mock("@/lib/actions/shared/uploads", () => ({ uploadImageAsset: mocks.uploadImageAsset }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("./locale-redirect", () => ({
  redirectToLocale: (path: string, locale: string) => {
    throw new Error(`REDIRECT:${locale ? `/${locale}` : ""}${path}`);
  },
}));
vi.mock("@/lib/observability/logger", () => ({
  withServerActionLog: (_name: string, _route: string, run: () => unknown) => run(),
  writeServerLog: mocks.writeServerLog,
}));

import { UserFacingError } from "@/lib/security/public-error";
import { registerSoloAction, uploadSoloProofAction, withdrawSoloAction } from "./solo-registration-actions";

const player = { id: "player-1", role: "player", name: "Bima" };

function form(entries: Record<string, string | File | undefined>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) if (value !== undefined) data.set(key, value);
  return data;
}

const registerForm = (overrides: Record<string, string | undefined> = {}) =>
  form({
    eventId: "event-1", ign: "BimaK", uid: "12345678", primaryPosition: "Goalkeeper", secondaryPosition: "",
    willingCaptain: "on", whatsapp: "081234567890", shareContact: "on", locale: "id", ...overrides,
  });

async function destination(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    const message = (error as Error).message;
    if (message.startsWith("REDIRECT:")) return decodeURIComponent(message.slice("REDIRECT:".length).replace(/\+/g, " "));
    throw error;
  }
  throw new Error("expected a redirect");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FEATURE_FLAG_SOLO_TOURNAMENT_V1", "true");
  mocks.requireRole.mockResolvedValue(player);
  mocks.checkRateLimit.mockResolvedValue(true);
  mocks.eventFindUnique.mockResolvedValue({ slug: "solo-cup" });
  mocks.registrationFindFirst.mockResolvedValue({ eventId: "event-1", event: { slug: "solo-cup" } });
  mocks.registerSoloAndAnnounce.mockResolvedValue({ outcome: "pending_payment", event: { slug: "solo-cup", name: "Solo Cup" }, registration: {}, promoted: [] });
  mocks.uploadSoloProofAndAnnounce.mockResolvedValue({ registration: {}, promoted: [] });
  mocks.withdrawSoloAndAnnounce.mockResolvedValue({ registration: {}, needsRefund: false, promoted: [] });
  mocks.uploadImageAsset.mockResolvedValue({ url: "https://blob.test/proof.png" });
});
afterEach(() => vi.unstubAllEnvs());

describe("registerSoloAction", () => {
  it("registers the signed-in player and returns to the event page with the outcome", async () => {
    expect(await destination(() => registerSoloAction(registerForm()))).toBe("/id/events/solo-cup/register?success=pending_payment");
    expect(mocks.registerSoloAndAnnounce).toHaveBeenCalledWith({
      eventId: "event-1", userId: "player-1", ign: "BimaK", uid: "12345678", primaryPosition: "Goalkeeper",
      secondaryPosition: null, willingCaptain: true, whatsapp: "6281234567890",
    });
  });

  it("reports a queue spot as its own outcome", async () => {
    mocks.registerSoloAndAnnounce.mockResolvedValue({ outcome: "queued", event: { slug: "solo-cup", name: "Solo Cup" }, registration: {}, promoted: [] });
    expect(await destination(() => registerSoloAction(registerForm()))).toBe("/id/events/solo-cup/register?success=queued");
  });

  it("always uses the signed-in account, never an id from the form", async () => {
    await destination(() => registerSoloAction(registerForm({ userId: "someone-else" })));
    expect(mocks.registerSoloAndAnnounce.mock.calls[0][0].userId).toBe("player-1");
  });

  it("refuses when solo tournaments are switched off", async () => {
    vi.stubEnv("FEATURE_FLAG_SOLO_TOURNAMENT_V1", "false");
    expect(await destination(() => registerSoloAction(registerForm()))).toContain("/events?error=Pendaftaran solo belum dibuka.");
    expect(mocks.registerSoloAndAnnounce).not.toHaveBeenCalled();
  });

  it("sends a visitor to sign in and back to the same page", async () => {
    mocks.requireRole.mockResolvedValue(null);
    expect(await destination(() => registerSoloAction(registerForm()))).toBe("/id/login?returnTo=/events/solo-cup/register");
    expect(mocks.registerSoloAndAnnounce).not.toHaveBeenCalled();
  });

  it("asks for a player account only", async () => {
    expect(mocks.requireRole).not.toHaveBeenCalled();
    await destination(() => registerSoloAction(registerForm()));
    expect(mocks.requireRole).toHaveBeenCalledWith("player");
  });

  it("sends a form problem back to the page with the message", async () => {
    expect(await destination(() => registerSoloAction(registerForm({ whatsapp: "12" })))).toBe(
      "/id/events/solo-cup/register?error=Nomor WhatsApp tidak valid.",
    );
    expect(mocks.registerSoloAndAnnounce).not.toHaveBeenCalled();
  });

  it("does not know an event it cannot find", async () => {
    mocks.eventFindUnique.mockResolvedValue(null);
    expect(await destination(() => registerSoloAction(registerForm()))).toBe("/id/events?error=Event tidak ditemukan.");
  });

  it("limits attempts per player and event", async () => {
    mocks.checkRateLimit.mockResolvedValue(false);
    expect(await destination(() => registerSoloAction(registerForm()))).toContain("Terlalu banyak percobaan");
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("solo-register:player-1:event-1", 5, 15 * 60 * 1000);
    expect(mocks.registerSoloAndAnnounce).not.toHaveBeenCalled();
  });

  it("shows a refusal from the repository as it is written", async () => {
    mocks.registerSoloAndAnnounce.mockRejectedValue(new UserFacingError("Kamu sudah daftar di event ini."));
    expect(await destination(() => registerSoloAction(registerForm()))).toBe("/id/events/solo-cup/register?error=Kamu sudah daftar di event ini.");
  });

  it("hides an unexpected failure behind a generic message", async () => {
    mocks.registerSoloAndAnnounce.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:5432"));
    const result = await destination(() => registerSoloAction(registerForm()));
    expect(result).toBe("/id/events/solo-cup/register?error=Gagal mendaftar. Coba lagi.");
    expect(result).not.toContain("ECONNREFUSED");
  });

  it("never writes the WhatsApp number or game ids to the logs", async () => {
    await destination(() => registerSoloAction(registerForm()));
    expect(JSON.stringify(mocks.writeServerLog.mock.calls)).not.toMatch(/081234567890|6281234567890|12345678|BimaK/);
  });
});

describe("uploadSoloProofAction", () => {
  const proofForm = (overrides: Record<string, string | File | undefined> = {}) =>
    form({ registrationId: "reg-1", locale: "id", paymentProof: new File(["x"], "proof.png", { type: "image/png" }), ...overrides });

  it("stores the proof for the player's own registration", async () => {
    expect(await destination(() => uploadSoloProofAction(proofForm()))).toBe("/id/events/solo-cup/register?success=payment-proof-uploaded");
    expect(mocks.uploadImageAsset).toHaveBeenCalledWith(expect.objectContaining({ folder: "payment-proofs", entityId: "reg-1", maxBytes: 2 * 1024 * 1024 }));
    expect(mocks.uploadSoloProofAndAnnounce).toHaveBeenCalledWith({ userId: "player-1", registrationId: "reg-1", proofImageUrl: "https://blob.test/proof.png" });
  });

  it("looks the registration up by owner, so another player's id finds nothing", async () => {
    mocks.registrationFindFirst.mockResolvedValue(null);
    expect(await destination(() => uploadSoloProofAction(proofForm()))).toBe("/id/events?error=Pendaftaran tidak ditemukan.");
    expect(mocks.registrationFindFirst).toHaveBeenCalledWith("reg-1", "player-1");
    expect(mocks.uploadImageAsset).not.toHaveBeenCalled();
  });

  it("limits uploads per registration", async () => {
    mocks.checkRateLimit.mockResolvedValue(false);
    expect(await destination(() => uploadSoloProofAction(proofForm()))).toContain("Terlalu banyak percobaan");
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("solo-proof:player-1:reg-1", 5, 15 * 60 * 1000);
    expect(mocks.uploadImageAsset).not.toHaveBeenCalled();
  });

  it("shows a refused or invalid image with a safe message", async () => {
    mocks.uploadImageAsset.mockRejectedValue(new Error("sharp: Input buffer contains unsupported image format"));
    const result = await destination(() => uploadSoloProofAction(proofForm()));
    expect(result).toBe("/id/events/solo-cup/register?error=Gagal mengunggah bukti bayar.");
  });

  it("shows a missed deadline as written", async () => {
    mocks.uploadSoloProofAndAnnounce.mockRejectedValue(new UserFacingError("Batas waktu bayar sudah lewat. Daftar lagi untuk dapat slot."));
    expect(await destination(() => uploadSoloProofAction(proofForm()))).toContain("Batas waktu bayar sudah lewat.");
  });

  it("needs a signed-in player", async () => {
    mocks.requireRole.mockResolvedValue(null);
    expect(await destination(() => uploadSoloProofAction(proofForm()))).toContain("/login");
    expect(mocks.uploadImageAsset).not.toHaveBeenCalled();
  });

  it("refuses a bad registration id before touching the database", async () => {
    expect(await destination(() => uploadSoloProofAction(proofForm({ registrationId: "../etc" })))).toContain("error=Pendaftaran tidak valid.");
    expect(mocks.registrationFindFirst).not.toHaveBeenCalled();
  });
});

describe("withdrawSoloAction", () => {
  const withdrawForm = (overrides: Record<string, string | undefined> = {}) => form({ registrationId: "reg-1", locale: "id", ...overrides });

  it("withdraws the player's own registration", async () => {
    expect(await destination(() => withdrawSoloAction(withdrawForm()))).toBe("/id/events/solo-cup/register?success=withdrawn");
    expect(mocks.withdrawSoloAndAnnounce).toHaveBeenCalledWith({ userId: "player-1", registrationId: "reg-1" });
  });

  it("points out the refund when money may have been paid", async () => {
    mocks.withdrawSoloAndAnnounce.mockResolvedValue({ registration: {}, needsRefund: true, promoted: [] });
    expect(await destination(() => withdrawSoloAction(withdrawForm()))).toBe("/id/events/solo-cup/register?success=withdrawn-refund");
  });

  it("shows a refusal as written", async () => {
    mocks.withdrawSoloAndAnnounce.mockRejectedValue(new UserFacingError("Pendaftaran sudah ditutup. Hubungi organizer untuk membatalkan."));
    expect(await destination(() => withdrawSoloAction(withdrawForm()))).toContain("Pendaftaran sudah ditutup.");
  });

  it("needs a signed-in player", async () => {
    mocks.requireRole.mockResolvedValue(null);
    expect(await destination(() => withdrawSoloAction(withdrawForm()))).toContain("/login");
    expect(mocks.withdrawSoloAndAnnounce).not.toHaveBeenCalled();
  });
});
