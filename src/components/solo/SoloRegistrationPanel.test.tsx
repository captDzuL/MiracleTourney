import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { SoloRegistrationView } from "@/lib/solo/registration-types";
import { SoloRegistrationPanel } from "./SoloRegistrationPanel";
import type { SoloPanelState } from "./registration-state";

Object.assign(globalThis, { React });

const action = async () => {
  throw new Error("not called");
};
const deadline = new Date("2026-10-14T03:30:00Z");

const registration = {
  id: "reg-1", eventId: "event-1", userId: "user-1", ign: "BimaK", uid: "12345678", primaryPosition: "Goalkeeper",
  secondaryPosition: null, slotGroup: "required", willingCaptain: false, status: "pending_payment", proofImageUrl: null,
  rejectReason: null, slotHeldAt: null, expiresAt: deadline, approvedAt: null, withdrawnAt: null, refundedAt: null,
  refundNote: null, version: 1, createdAt: new Date(),
} as unknown as SoloRegistrationView;

type PanelState = Exclude<SoloPanelState, { kind: "form" }>;

function render(state: PanelState, props: Partial<React.ComponentProps<typeof SoloRegistrationPanel>> = {}) {
  return renderToStaticMarkup(
    <SoloRegistrationPanel
      canWithdraw
      feeLabel="Rp25.000"
      locale="id"
      payment={{ qrisImageUrl: "https://blob.test/qris.png", instructions: "Tulis IGN di catatan." }}
      registration={registration}
      requiredPosition="Goalkeeper"
      state={state}
      uploadAction={action as never}
      withdrawAction={action as never}
      {...props}
    />,
  );
}

const hidden = (html: string, name: string) => html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0] ?? "";

describe("SoloRegistrationPanel", () => {
  it("shows the player what they signed up with, using the everyday word for the keeper", () => {
    const html = render({ kind: "approved" });
    expect(html).toContain("IGN BimaK · UID 12345678 · Kiper");
  });

  describe("queued", () => {
    it("tells the place and the group, and says no payment is due yet", () => {
      const html = render({ kind: "queued", position: 3 });
      expect(html).toContain("Kamu di antrean");
      expect(html).toContain("Antrean ke-3 untuk Kiper");
      expect(html).toContain("belum perlu bayar");
      expect(html).not.toContain('type="file"');
    });

    it("names the field players group for a field player", () => {
      const html = render({ kind: "queued", position: 1 }, { registration: { ...registration, slotGroup: "open", primaryPosition: "Forward" } });
      expect(html).toContain("Antrean ke-1 untuk Pemain lapangan");
    });

    it("still reads well when the place is unknown", () => {
      expect(render({ kind: "queued", position: null })).toContain("Kamu di antrean. Kamu belum perlu bayar.");
    });
  });

  describe("payment due", () => {
    it("shows the QRIS, the fee, the organizer's note and the deadline in Jakarta time", () => {
      const html = render({ kind: "pay", deadline });
      expect(html).toContain("Bayar untuk mengamankan slot");
      expect(html).toContain('src="https://blob.test/qris.png"');
      expect(html).toContain('alt="QRIS pembayaran"');
      expect(html).toContain("Biaya: Rp25.000");
      expect(html).toContain("Tulis IGN di catatan.");
      expect(html).toContain("14 Oktober 2026, 10.30 WIB");
    });

    it("lets the player upload a proof for this registration only", () => {
      const html = render({ kind: "pay", deadline });
      expect(html).toContain('type="file"');
      expect(html).toContain('name="paymentProof"');
      expect(html).toMatch(/accept="image\/png,image\/jpeg,image\/webp"/);
      expect(hidden(html, "registrationId")).toContain('value="reg-1"');
      expect(hidden(html, "locale")).toContain('value="id"');
      expect(html).toContain("Kirim bukti bayar");
    });

    it("says so when the organizer has not set up a QRIS", () => {
      const html = render({ kind: "pay", deadline }, { payment: {} });
      expect(html).toContain("Organizer belum menyiapkan QRIS");
      expect(html).not.toContain("<img");
    });

    it("omits the organizer note when there is none", () => {
      expect(render({ kind: "pay", deadline }, { payment: { qrisImageUrl: "https://blob.test/qris.png" } })).not.toContain("Petunjuk organizer");
    });
  });

  it("asks for patience while the organizer checks the proof, without a new upload form", () => {
    const html = render({ kind: "review" });
    expect(html).toContain("Bukti bayar sedang dicek");
    expect(html).toContain("Slotmu aman sampai ada keputusan.");
    expect(html).not.toContain('type="file"');
  });

  it("gives the reason for a rejection and a new upload form before the deadline", () => {
    const html = render({ kind: "rejected", reason: "Nominal kurang", deadline });
    expect(html).toContain("Bukti bayar ditolak");
    expect(html).toContain("Alasan: Nominal kurang. Unggah bukti yang benar sebelum 14 Oktober 2026, 10.30 WIB.");
    expect(html).toContain('type="file"');
  });

  it("escapes a rejection reason typed by the organizer", () => {
    const html = render({ kind: "rejected", reason: '<img src=x onerror="alert(1)">', deadline });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });

  it("confirms an approved player and explains what comes next", () => {
    const html = render({ kind: "approved" });
    expect(html).toContain("Kamu terdaftar");
    expect(html).toContain("organizer mengacak pemain jadi tim");
  });

  describe("cancelling", () => {
    it.each<PanelState>([
      { kind: "queued", position: 2 }, { kind: "pay", deadline }, { kind: "review" },
      { kind: "rejected", reason: "x", deadline }, { kind: "approved" },
    ])("is offered while registration is open (%j)", (state) => {
      const html = render(state);
      expect(html).toContain("Batalkan pendaftaran");
      expect(html).toContain("Slotmu diberikan ke pemain berikutnya.");
    });

    it("sends only the registration id and the page language", () => {
      const html = render({ kind: "approved" });
      const forms = html.split("<form").slice(1);
      const withdraw = forms.find((form) => form.includes("Batalkan pendaftaran"))!;
      expect(withdraw).toContain('name="registrationId"');
      expect(withdraw).toContain('name="locale"');
      expect(withdraw).not.toContain('name="userId"');
    });

    it("is not offered once registration is closed", () => {
      expect(render({ kind: "approved" }, { canWithdraw: false })).not.toContain("Batalkan pendaftaran");
    });
  });

  it("speaks English", () => {
    const html = render({ kind: "queued", position: 2 }, { locale: "en" });
    expect(html).toContain("You are in the queue");
    expect(html).toContain("Place 2 for Goalkeeper");
    expect(html).toContain("Cancel registration");
    expect(hidden(html, "locale")).toContain('value="en"');
  });
});
