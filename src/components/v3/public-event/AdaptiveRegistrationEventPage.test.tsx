import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ShareButton", () => ({ ShareButton: () => <button>Bagikan</button> }));

vi.mock("./RegistrationEntryCta", () => ({
  RegistrationEntryCta: ({ readOnly }: { readOnly?: boolean }) => readOnly ? null : <button>Daftarkan tim</button>,
}));

import { AdaptiveRegistrationEventPage } from "./AdaptiveRegistrationEventPage";
import type { AdaptivePublicEventViewModel } from "@/lib/events/adaptive-public-event";

const view: AdaptivePublicEventViewModel = {
  event: {
    id: "event-1", slug: "miracle-cup", name: "Miracle Community Cup",
    description: "Turnamen komunitas yang tertata.", logoUrl: "/logo-event.png",
    posterUrl: "/poster-event.png", gameName: "Mobile Legends", modeName: "5v5",
    formatLabel: "Single Elimination", formatDetails: ["Early rounds BO1", "Final BO5"],
    eventStartsAt: "2026-09-20T02:00:00.000Z", timezone: "Asia/Jakarta",
    venue: "Discord Miracle", prize: "Rp5.000.000",
  },
  organizer: {
    name: "Miracle Community", verified: true, contactChannel: "WhatsApp",
    contactValue: "+62 812 3456 7890", contactHref: "https://wa.me/6281234567890",
  },
  registration: {
    availability: "open", opensAt: "2026-09-11T02:00:00.000Z",
    closesAt: "2026-09-17T16:59:00.000Z", activeTeamCount: 10,
    pendingReviewCount: 2, occupiedSlots: 12, remainingSlots: 4, participantCap: 16,
    feeRequired: true, feeAmount: 20000, feeLabel: "Rp20.000", minimumRoster: 1, maximumRoster: 7,
  },
  viewer: { state: "anonymous", cta: { kind: "login", label: "register_team", enabled: true } },
};

const copy = {
  registrationOpen: "Pendaftaran dibuka", registrationUpcoming: "Segera dibuka", registrationFull: "Penuh", registrationClosed: "Ditutup", organizedBy: "Diselenggarakan oleh", verified: "Terverifikasi",
  share: "Bagikan", startsAt: "Mulai", timezone: "Zona waktu", venue: "Lokasi", prize: "Hadiah",
  slots: "Slot terisi", summary: "Ringkasan", participants: "Peserta", requirements: "Persyaratan",
  organizer: "Organizer", registrationPeriod: "Periode pendaftaran", opens: "Dibuka", closes: "Ditutup",
  capacity: "Kapasitas", activeTeams: "Tim aktif", pendingReview: "Sedang ditinjau", remaining: "Sisa slot",
  fee: "Biaya pendaftaran", roster: "Kebutuhan roster", rosterValue: "{min}–{max} pemain",
  uidIgn: "UID dan IGN wajib; posisi opsional.", howToTitle: "Cara mendaftar",
  steps: ["Masuk sebagai Captain", "Pilih atau buat tim", "Lengkapi roster", "Kirim pendaftaran"],
  description: "Tentang event", format: "Format pertandingan", contact: "Kontak organizer",
  contactHint: "Hubungi organizer bila membutuhkan bantuan.", importantInfo: "Informasi penting",
  teamCount: "{occupied} dari {cap} slot terisi", publicTitle: "Halaman event",
};

describe("AdaptiveRegistrationEventPage", () => {
  it("renders one event heading with separate poster and logo, registration facts, and organizer contact", () => {
    const html = renderToStaticMarkup(<AdaptiveRegistrationEventPage view={view} locale="id" copy={copy} />);
    expect((html.match(/<h1/g) ?? [])).toHaveLength(1);
    expect(html).toContain("Miracle Community Cup");
    expect(html).toContain('data-testid="adaptive-event-poster"');
    expect(html).toContain('data-testid="adaptive-event-logo"');
    expect(html).toContain("Mobile Legends");
    expect(html).toContain("5v5");
    expect(html).toContain("Rp5.000.000");
    expect(html).toContain("Rp20.000");
    expect(html).toContain("Sedang ditinjau");
    expect(html).toContain("https://wa.me/6281234567890");
    expect(html).not.toContain("phase simulator");
  });

  it("removes registration actions for read-only previews", () => {
    const html = renderToStaticMarkup(<AdaptiveRegistrationEventPage view={view} locale="id" copy={copy} readOnly />);
    expect(html).not.toContain("Daftarkan tim");
  });
});