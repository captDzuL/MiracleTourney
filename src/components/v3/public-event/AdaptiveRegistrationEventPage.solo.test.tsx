import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ShareButton", () => ({ ShareButton: () => <button>Bagikan</button> }));
vi.mock("./RegistrationEntryCta", () => ({ RegistrationEntryCta: () => <button>CTA</button> }));

import type { AdaptiveRegistrationEventViewModel } from "@/lib/events/adaptive-public-event";
import { AdaptiveRegistrationEventPage } from "./AdaptiveRegistrationEventPage";

Object.assign(globalThis, { React });

const slots = { required: { quota: 8, held: 5, queued: 0 }, open: { quota: 32, held: 30, queued: 4 } };

function soloView(overrides: Partial<AdaptiveRegistrationEventViewModel["registration"]> = {}): AdaptiveRegistrationEventViewModel {
  return {
    mode: "registration",
    event: {
      id: "event-1", slug: "solo-cup", name: "Flashpeak Solo Cup", description: "Main sendiri, dapat tim.", logoUrl: null,
      posterUrl: null, gameName: "Flashpeak", modeName: "5v5", formatLabel: "Single Elimination", formatDetails: [],
      eventStartsAt: "2026-09-20T02:00:00.000Z", timezone: "Asia/Jakarta", venue: "Discord", prize: null,
    },
    organizer: { name: "Miracle", verified: true, contactChannel: "WhatsApp", contactValue: "+628123456789", contactHref: "https://wa.me/628123456789" },
    registration: {
      mode: "solo", solo: { requiredPosition: "Goalkeeper", slots },
      availability: "open", opensAt: "2026-09-11T02:00:00.000Z", closesAt: "2026-09-17T16:59:00.000Z",
      activeTeamCount: 0, pendingReviewCount: 0, occupiedSlots: 0, remainingSlots: 8, participantCap: 8,
      feeRequired: true, feeAmount: 25000, feeLabel: "Rp25.000", minimumRoster: 1, maximumRoster: 8,
      ...overrides,
    },
    viewer: { state: "anonymous", cta: { kind: "login", label: "register_solo", enabled: true } },
  };
}

const copy = {
  registrationOpen: "Pendaftaran dibuka", registrationUpcoming: "Segera dibuka", registrationFull: "Penuh", registrationClosed: "Ditutup", organizedBy: "Diselenggarakan oleh", verified: "Terverifikasi",
  share: "Bagikan", startsAt: "Mulai", timezone: "Zona waktu", venue: "Lokasi", prize: "Hadiah",
  slots: "Slot terisi", summary: "Ringkasan", participants: "Peserta", requirements: "Persyaratan",
  organizer: "Organizer", registrationPeriod: "Periode pendaftaran", opens: "Dibuka", closes: "Ditutup",
  capacity: "Kapasitas", activeTeams: "Tim aktif", pendingReview: "Sedang ditinjau", remaining: "Sisa slot",
  fee: "Biaya pendaftaran", feeFree: "Gratis", feePaid: "Berbayar", roster: "Kebutuhan roster", rosterValue: "{min}–{max} pemain",
  uidIgn: "UID dan IGN wajib; posisi opsional.", howToTitle: "Cara mendaftar",
  steps: ["Masuk sebagai Captain", "Pilih atau buat tim", "Lengkapi roster", "Kirim pendaftaran"],
  description: "Tentang event", format: "Format pertandingan", contact: "Kontak organizer",
  contactHint: "Hubungi organizer bila membutuhkan bantuan.", importantInfo: "Informasi penting",
  teamCount: "{occupied} dari {cap} slot terisi", publicTitle: "Halaman event",
};

const render = (view: AdaptiveRegistrationEventViewModel, locale: "id" | "en" = "id") =>
  renderToStaticMarkup(<AdaptiveRegistrationEventPage view={view} locale={locale} copy={copy} />);

describe("AdaptiveRegistrationEventPage for a solo event", () => {
  it("shows how full each group is instead of team counts", () => {
    const html = render(soloView());
    expect(html).toContain("Kiper");
    expect(html).toContain("5 dari 8 terisi");
    expect(html).toContain("30 dari 32 terisi");
    expect(html).toContain("4 di antrean");
    expect(html).not.toContain("Tim aktif");
    expect(html).not.toContain("Sisa slot");
  });

  it("tells a player what to prepare, not what a captain would", () => {
    const html = render(soloView());
    expect(html).toContain("IGN, UID, posisi utama, dan nomor WhatsApp");
    expect(html).not.toContain("Kebutuhan roster");
    expect(html).not.toContain("Masuk sebagai Captain");
  });

  it("lists the steps of a solo sign-up", () => {
    const html = render(soloView());
    for (const step of ["Buat akun pemain", "Daftar solo dan pilih posisi", "Bayar kalau kamu dapat slot", "Tunggu hasil acak tim"]) {
      expect(html).toContain(step);
    }
  });

  it("explains that teams are drawn after registration closes", () => {
    expect(render(soloView())).toContain("organizer mengacak");
  });

  it("shows the total of players in the hero, not a team count", () => {
    expect(render(soloView())).toContain("35/40");
  });

  it("shows a dash in the hero and a calm note when the counts could not be read", () => {
    const html = render(soloView({ solo: { requiredPosition: "Goalkeeper", slots: null } }));
    expect(html).not.toContain("35/40");
    expect(html).toContain("Jumlah slot belum bisa ditampilkan");
    expect(html).toContain(">—</dd>");
  });

  it("keeps the section targets the page navigation links to", () => {
    const html = render(soloView());
    for (const id of ["summary", "participants", "requirements", "organizer"]) expect(html).toContain(`id="${id}"`);
  });

  it("keeps the fee card", () => {
    expect(render(soloView())).toContain("Rp25.000");
  });

  it("speaks English on the English page", () => {
    const html = render(soloView(), "en");
    expect(html).toContain("Goalkeeper");
    expect(html).toContain("5 of 8 filled");
    expect(html).toContain("IGN, UID, main position and WhatsApp number");
    expect(html).toContain("Pay once you hold a slot");
    expect(html).toContain("the organizer draws");
  });

  it("follows another game's required position", () => {
    const html = render(soloView({ solo: { requiredPosition: "Center", slots } }));
    expect(html).toContain("Center");
    expect(html).not.toContain("Kiper");
  });
});

describe("AdaptiveRegistrationEventPage for a team event", () => {
  it("is unchanged", () => {
    const team = soloView({ mode: "team", solo: undefined, activeTeamCount: 10, pendingReviewCount: 2, occupiedSlots: 12, remainingSlots: 4, participantCap: 16 });
    const html = render(team);
    expect(html).toContain("Tim aktif");
    expect(html).toContain("Kebutuhan roster");
    expect(html).toContain("Masuk sebagai Captain");
    expect(html).toContain("12/16");
    expect(html).not.toContain("Kiper");
  });
});
