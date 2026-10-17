import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdaptivePublicEventView: vi.fn(),
  sweepSoloEventAndAnnounce: vi.fn(),
  getSoloRegistrationForUser: vi.fn(),
  getSoloQueuePosition: vi.fn(),
  getCaptainPaymentSettings: vi.fn(),
  getPlayerWhatsapp: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

vi.mock("@/lib/events/adaptive-public-event", () => ({ getAdaptivePublicEventView: mocks.getAdaptivePublicEventView }));
vi.mock("@/lib/solo/registration-service", () => ({ sweepSoloEventAndAnnounce: mocks.sweepSoloEventAndAnnounce }));
vi.mock("@/lib/solo/registration-repository", () => ({
  getSoloRegistrationForUser: mocks.getSoloRegistrationForUser,
  getSoloQueuePosition: mocks.getSoloQueuePosition,
}));
vi.mock("@/lib/registration/captain-repository", () => ({ getCaptainPaymentSettings: mocks.getCaptainPaymentSettings }));
vi.mock("@/lib/player/profile-repository", () => ({ getPlayerWhatsapp: mocks.getPlayerWhatsapp }));
vi.mock("@/lib/actions/solo-registration-actions", () => ({
  registerSoloAction: async () => undefined,
  uploadSoloProofAction: async () => undefined,
  withdrawSoloAction: async () => undefined,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: unknown; children?: React.ReactNode }) =>
    React.createElement("a", { ...rest, href: typeof href === "string" ? href : JSON.stringify(href) }, children),
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

import { renderSoloRegistrationPage } from "./solo-registration-page";

Object.assign(globalThis, { React });

const event = { id: "event-1", slug: "solo-cup", name: "Flashpeak Solo Cup", gameModeId: "mode-flashpeak-5v5", status: "Published", registrationFeeLabel: "Rp25.000", registrationFeeRequired: true };
const slots = { required: { quota: 8, held: 5, queued: 0 }, open: { quota: 32, held: 32, queued: 4 } };
const player = { id: "player-1", role: "player", name: "Bima", email: "b@x.id" };
const deadline = new Date(Date.now() + 3600_000);

function view(overrides: Record<string, unknown> = {}, registration: Record<string, unknown> = {}) {
  return {
    mode: "registration",
    event: { id: "event-1", slug: "solo-cup", name: "Flashpeak Solo Cup" },
    registration: { mode: "solo", availability: "open", feeRequired: true, feeLabel: "Rp25.000", solo: { requiredPosition: "Goalkeeper", slots }, ...registration },
    viewer: { state: "eligible_without_team" },
    ...overrides,
  };
}

const stored = (status: string, extra: Record<string, unknown> = {}) => ({
  id: "reg-1", eventId: "event-1", userId: "player-1", ign: "BimaK", uid: "12345678", primaryPosition: "Goalkeeper", secondaryPosition: null,
  slotGroup: "required", status, rejectReason: null, expiresAt: null, createdAt: new Date(), version: 0, ...extra,
});

async function render(options: { user?: unknown; locale?: "id" | "en"; search?: { error?: string; success?: string } } = {}) {
  const element = await renderSoloRegistrationPage({
    event: event as never,
    user: (options.user === undefined ? player : options.user) as never,
    locale: options.locale ?? "id",
    search: options.search,
  });
  return renderToStaticMarkup(element);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FEATURE_FLAG_SOLO_TOURNAMENT_V1", "true");
  mocks.sweepSoloEventAndAnnounce.mockResolvedValue({ expired: 0, promoted: [] });
  mocks.getAdaptivePublicEventView.mockResolvedValue(view());
  mocks.getSoloRegistrationForUser.mockResolvedValue(null);
  mocks.getSoloQueuePosition.mockResolvedValue(null);
  mocks.getCaptainPaymentSettings.mockResolvedValue({ qrisImageUrl: "https://blob.test/qris.png", instructions: "Tulis IGN." });
  mocks.getPlayerWhatsapp.mockResolvedValue("6281234567890");
});
afterEach(() => vi.unstubAllEnvs());

describe("renderSoloRegistrationPage", () => {
  it("is not found while solo tournaments are off", async () => {
    vi.stubEnv("FEATURE_FLAG_SOLO_TOURNAMENT_V1", "false");
    await expect(render()).rejects.toThrow("NOT_FOUND");
    expect(mocks.sweepSoloEventAndAnnounce).not.toHaveBeenCalled();
  });

  it("is not found for a game without solo rules", async () => {
    await expect(renderSoloRegistrationPage({ event: { ...event, gameModeId: "mode-mlbb-5v5" } as never, user: player as never, locale: "id" })).rejects.toThrow("NOT_FOUND");
  });

  it("expires late slots first, so the page never shows a slot that is already gone", async () => {
    await render();
    expect(mocks.sweepSoloEventAndAnnounce).toHaveBeenCalledWith("event-1");
    expect(mocks.sweepSoloEventAndAnnounce.mock.invocationCallOrder[0]).toBeLessThan(mocks.getAdaptivePublicEventView.mock.invocationCallOrder[0]);
  });

  it("shows every visitor how full the slots are", async () => {
    const html = await render({ user: null });
    expect(html).toContain("Kiper");
    expect(html).toContain("5 dari 8 terisi");
    expect(html).toContain("4 di antrean");
    expect(html).toContain("Flashpeak Solo Cup");
  });

  describe("a visitor", () => {
    beforeEach(() => mocks.getAdaptivePublicEventView.mockResolvedValue(view({ viewer: { state: "anonymous" } })));

    it("is asked to sign in or create a player account, and returns to this page", async () => {
      const html = await render({ user: null });
      const returnTo = encodeURIComponent("/events/solo-cup/register");
      expect(html).toContain("Masuk untuk daftar solo");
      expect(html).toContain(`login?returnTo=${returnTo}`);
      expect(html).toContain(`register?as=player&amp;returnTo=${returnTo}`);
      expect(html).not.toContain("data-solo-register");
    });
  });

  describe("a captain", () => {
    it("is told to use a player account", async () => {
      mocks.getAdaptivePublicEventView.mockResolvedValue(view({ viewer: { state: "wrong_role" } }));
      const html = await render({ user: { id: "c1", role: "captain", name: "C" } });
      expect(html).toContain("Gunakan akun Pemain");
      expect(html).not.toContain("data-solo-register");
      expect(mocks.getSoloRegistrationForUser).not.toHaveBeenCalled();
    });
  });

  describe("a player who has not registered", () => {
    it("gets the form with the number from the profile filled in", async () => {
      const html = await render();
      expect(html).toContain("data-solo-register");
      expect(html).toMatch(/name="whatsapp"[^>]*value="6281234567890"|value="6281234567890"[^>]*name="whatsapp"/);
      expect(html).toContain("Biaya Rp25.000. Bayar setelah kamu dapat slot.");
      expect(mocks.getPlayerWhatsapp).toHaveBeenCalledWith("player-1");
    });

    it("still gets the form when the slots are full, because the queue is open", async () => {
      mocks.getAdaptivePublicEventView.mockResolvedValue(view({}, { availability: "full" }));
      expect(await render()).toContain("data-solo-register");
    });

    it.each([["upcoming", "Pendaftaran belum dibuka."], ["closed", "Pendaftaran sudah ditutup."], ["legacy", "Pendaftaran sudah ditutup."]])(
      "sees no form while registration is %s",
      async (availability, message) => {
        mocks.getAdaptivePublicEventView.mockResolvedValue(view({}, { availability }));
        const html = await render();
        expect(html).toContain(message);
        expect(html).not.toContain("data-solo-register");
      },
    );

    it("offers a free event's form without a fee line", async () => {
      mocks.getAdaptivePublicEventView.mockResolvedValue(view({}, { feeRequired: false, feeLabel: "" }));
      expect(await render()).toContain("Gratis.");
    });
  });

  describe("a player who has registered", () => {
    it("sees their place in the queue", async () => {
      const row = stored("queued");
      mocks.getSoloRegistrationForUser.mockResolvedValue(row);
      mocks.getSoloQueuePosition.mockResolvedValue(2);
      const html = await render();
      expect(html).toContain("Antrean ke-2 untuk Kiper");
      expect(html).not.toContain("data-solo-register");
      expect(mocks.getSoloQueuePosition).toHaveBeenCalledWith(row);
      expect(mocks.getCaptainPaymentSettings).not.toHaveBeenCalled();
    });

    it("sees the QRIS and the upload form when a payment is due", async () => {
      mocks.getSoloRegistrationForUser.mockResolvedValue(stored("pending_payment", { expiresAt: deadline }));
      const html = await render();
      expect(html).toContain("Bayar untuk mengamankan slot");
      expect(html).toContain("https://blob.test/qris.png");
      expect(html).toContain('name="paymentProof"');
      expect(mocks.getCaptainPaymentSettings).toHaveBeenCalledWith("event-1");
    });

    it("sees the reason when a payment was rejected", async () => {
      mocks.getSoloRegistrationForUser.mockResolvedValue(stored("rejected", { rejectReason: "Nominal kurang", expiresAt: deadline }));
      expect(await render()).toContain("Alasan: Nominal kurang.");
    });

    it("can start over when the deadline has passed", async () => {
      mocks.getSoloRegistrationForUser.mockResolvedValue(stored("pending_payment", { expiresAt: new Date(Date.now() - 1000) }));
      const html = await render();
      expect(html).toContain("data-solo-register");
      expect(html).not.toContain('name="paymentProof"');
    });

    it("can cancel while registration is open, and not after it closes", async () => {
      mocks.getSoloRegistrationForUser.mockResolvedValue(stored("approved"));
      expect(await render()).toContain("Batalkan pendaftaran");
      mocks.getAdaptivePublicEventView.mockResolvedValue(view({}, { availability: "closed" }));
      const closed = await renderSoloRegistrationPage({ event: { ...event, status: "Registration Closed" } as never, user: player as never, locale: "id" });
      expect(renderToStaticMarkup(closed)).not.toContain("Batalkan pendaftaran");
    });
  });

  describe("messages from the last action", () => {
    it("shows a known success code as text", async () => {
      expect(await render({ search: { success: "queued" } })).toContain("Slot penuh. Kamu masuk antrean.");
    });

    it("ignores a success code it does not know", async () => {
      expect(await render({ search: { success: "<b>hacked</b>" } })).not.toContain("hacked");
    });

    it("shows an error as plain text, never as markup", async () => {
      const html = await render({ search: { error: "<img src=x onerror=alert(1)>" } });
      expect(html).not.toContain("<img src=x");
      expect(html).toContain("&lt;img src=x");
    });
  });

  it("speaks English with English links", async () => {
    mocks.getAdaptivePublicEventView.mockResolvedValue(view({ viewer: { state: "anonymous" } }));
    const html = await render({ user: null, locale: "en" });
    expect(html).toContain("Sign in to join solo");
    expect(html).toContain("5 of 8 filled");
    expect(html).toContain("Goalkeeper");
  });

  it("links back to the event page", async () => {
    expect(await render()).toContain('href="/events/solo-cup"');
  });

  it("does not read the page for an event that is no longer taking registrations", async () => {
    mocks.getAdaptivePublicEventView.mockResolvedValue({ mode: "ongoing" });
    const html = await render();
    expect(html).toContain("Pendaftaran sudah ditutup.");
    expect(html).not.toContain("data-solo-register");
    expect(mocks.getSoloRegistrationForUser).not.toHaveBeenCalled();
  });
});
