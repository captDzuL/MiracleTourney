import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  eventFindMany: vi.fn(),
  sendEmail: vi.fn(),
  writeServerLog: vi.fn(),
  registerSolo: vi.fn(),
  uploadSoloProof: vi.fn(),
  withdrawSolo: vi.fn(),
  sweepSoloEvent: vi.fn(),
}));

vi.mock("@/lib/platform/db", () => ({
  prisma: { user: { findMany: mocks.userFindMany }, event: { findMany: mocks.eventFindMany } },
}));
vi.mock("@/lib/email/send", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("@/lib/observability/logger", () => ({ writeServerLog: mocks.writeServerLog }));
vi.mock("./registration-repository", async () => {
  const actual = await vi.importActual<typeof import("./registration-repository")>("./registration-repository").catch(() => ({}));
  return {
    ...actual,
    registerSolo: mocks.registerSolo,
    uploadSoloProof: mocks.uploadSoloProof,
    withdrawSolo: mocks.withdrawSolo,
    sweepSoloEvent: mocks.sweepSoloEvent,
  };
});

import { UserFacingError } from "@/lib/security/public-error";
import type { PromotedRegistration } from "./registration-types";
import {
  announcePromotions,
  registerSoloAndAnnounce,
  sweepSoloEventAndAnnounce,
  uploadSoloProofAndAnnounce,
  withdrawSoloAndAnnounce,
} from "./registration-service";

const deadline = new Date("2026-10-14T03:30:00Z");
const promotedPay: PromotedRegistration = { registrationId: "reg-1", eventId: "event-1", userId: "user-1", status: "pending_payment", expiresAt: deadline };
const promotedFree: PromotedRegistration = { registrationId: "reg-2", eventId: "event-1", userId: "user-2", status: "approved", expiresAt: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://miracle.example/");
  mocks.userFindMany.mockResolvedValue([
    { id: "user-1", email: "one@example.com", name: "Satu" },
    { id: "user-2", email: "two@example.com", name: "Dua" },
  ]);
  mocks.eventFindMany.mockResolvedValue([{ id: "event-1", slug: "solo-cup", name: "Solo Cup" }]);
  mocks.sendEmail.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("announcePromotions", () => {
  it("emails each promoted player with a link to the event page", async () => {
    await announcePromotions([promotedPay, promotedFree]);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
    const [first] = mocks.sendEmail.mock.calls[0];
    expect(first).toMatchObject({ to: "one@example.com", subject: "Slot kamu terbuka: Solo Cup" });
    expect(first.html).toContain('href="https://miracle.example/id/events/solo-cup/register"');
    expect(mocks.sendEmail.mock.calls[1][0]).toMatchObject({ to: "two@example.com", subject: "Kamu masuk: Solo Cup" });
  });

  it("does nothing, and reads nothing, when nobody was promoted", async () => {
    await announcePromotions([]);
    expect(mocks.userFindMany).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("keeps going when one mail fails, and never lets the failure escape", async () => {
    mocks.sendEmail.mockRejectedValueOnce(new Error("smtp down for one@example.com"));
    await expect(announcePromotions([promotedPay, promotedFree])).resolves.toBeUndefined();
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
  });

  it("logs a failure without the address, name or any message text", async () => {
    mocks.sendEmail.mockRejectedValueOnce(new Error("smtp down for one@example.com"));
    await announcePromotions([promotedPay]);
    const logged = JSON.stringify(mocks.writeServerLog.mock.calls);
    expect(logged).toContain("solo_slot_email");
    expect(logged).not.toMatch(/one@example\.com|Satu|smtp down/);
  });

  it("skips quietly, with a log, when the site address is not configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "");
    await announcePromotions([promotedPay]);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.writeServerLog.mock.calls)).toContain("solo_slot_email");
  });

  it("skips a player whose account or event is gone", async () => {
    mocks.userFindMany.mockResolvedValue([{ id: "user-2", email: "two@example.com", name: "Dua" }]);
    await announcePromotions([promotedPay, promotedFree]);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail.mock.calls[0][0].to).toBe("two@example.com");
  });
});

describe("registration actions that announce promotions", () => {
  it("registerSoloAndAnnounce returns the result and mails the promoted players", async () => {
    const result = { registration: { id: "reg-9" }, outcome: "queued", event: { slug: "solo-cup", name: "Solo Cup" }, promoted: [promotedPay] };
    mocks.registerSolo.mockResolvedValue(result);
    await expect(registerSoloAndAnnounce({} as never)).resolves.toBe(result);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("withdrawSoloAndAnnounce mails the player who got the freed slot", async () => {
    const result = { registration: { id: "reg-9" }, needsRefund: false, promoted: [promotedPay] };
    mocks.withdrawSolo.mockResolvedValue(result);
    await expect(withdrawSoloAndAnnounce({ userId: "u", registrationId: "r" })).resolves.toBe(result);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("uploadSoloProofAndAnnounce mails promotions from a successful upload", async () => {
    const result = { registration: { id: "reg-9" }, promoted: [promotedFree] };
    mocks.uploadSoloProof.mockResolvedValue(result);
    await expect(uploadSoloProofAndAnnounce({ userId: "u", registrationId: "r", proofImageUrl: "https://blob.test/p.png" })).resolves.toBe(result);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("uploadSoloProofAndAnnounce still mails promotions when the upload itself is refused, then rethrows", async () => {
    const { SoloRegistrationNotice } = await import("./registration-repository");
    mocks.uploadSoloProof.mockRejectedValue(new SoloRegistrationNotice("Batas waktu bayar sudah lewat.", [promotedPay]));
    await expect(uploadSoloProofAndAnnounce({ userId: "u", registrationId: "r", proofImageUrl: "https://blob.test/p.png" }))
      .rejects.toThrow("Batas waktu bayar sudah lewat.");
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("does not mail anyone when an ordinary refusal carries no promotions", async () => {
    mocks.registerSolo.mockRejectedValue(new UserFacingError("Kamu sudah daftar di event ini."));
    await expect(registerSoloAndAnnounce({} as never)).rejects.toThrow("Kamu sudah daftar di event ini.");
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("sweepSoloEventAndAnnounce reports the sweep and mails promotions", async () => {
    mocks.sweepSoloEvent.mockResolvedValue({ expired: 1, promoted: [promotedPay] });
    await expect(sweepSoloEventAndAnnounce("event-1")).resolves.toEqual({ expired: 1, promoted: [promotedPay] });
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("sweepSoloEventAndAnnounce never breaks the page that called it", async () => {
    mocks.sweepSoloEvent.mockRejectedValue(new Error("db down"));
    await expect(sweepSoloEventAndAnnounce("event-1")).resolves.toEqual({ expired: 0, promoted: [] });
    expect(JSON.stringify(mocks.writeServerLog.mock.calls)).toContain("solo_sweep");
  });
});
