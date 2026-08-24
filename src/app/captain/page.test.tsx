import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCaptainTeams,
  getCertificatesForEvents,
  getEventsByIds,
  getGameForEvent,
  getModeForEvent,
  getCaptainRegistrationRequests,
  getOpenRegistrationEventsForCaptain,
  getPaymentSettings,
  getPlayersForTeams,
  hasTempPassword,
  requireRole,
} = vi.hoisted(() => ({
  getCaptainTeams: vi.fn(),
  getCertificatesForEvents: vi.fn(),
  getEventsByIds: vi.fn(),
  getGameForEvent: vi.fn(),
  getModeForEvent: vi.fn(),
  getCaptainRegistrationRequests: vi.fn(),
  getOpenRegistrationEventsForCaptain: vi.fn(),
  getPaymentSettings: vi.fn(),
  getPlayersForTeams: vi.fn(),
  hasTempPassword: vi.fn(),
  requireRole: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (namespace: string) => (key: string, values?: Record<string, string | number>) => {
    const messages: Record<string, Record<string, string>> = {
      captain: {
        registrationTab: "Pendaftaran Event Baru",
        rosterTab: "Management Roster",
        openRegistrationTitle: "Daftar Event Baru",
        openRegistrationDescription: "Pilih event yang sedang membuka pendaftaran dan daftarkan satu tim.",
        noOpenRegistration: "Tidak ada event baru yang sedang membuka pendaftaran untuk akun ini.",
        teamName: "Nama tim",
        teamNamePlaceholder: "Miracle Five",
        teamTag: "Tag tim",
        teamTagPlaceholder: "MFC",
        registerTeamSubmit: "Daftarkan Tim",
        eventCapacity: `${values?.registered ?? 0}/${values?.cap ?? 0} tim terdaftar`,
        rosterManagementTitle: "Management Roster",
        rosterManagementDescription: "Kelola pemain untuk tim yang sudah terdaftar.",
        paymentPending: "Pendaftaran pembayaran dibuat. Upload bukti bayar agar admin bisa verifikasi.",
        paymentProofUploaded: "Bukti pembayaran berhasil diupload dan menunggu verifikasi admin.",
        paymentRequestsTitle: "Status Pembayaran",
        paymentRequestsDescription: "Pantau pembayaran event berbayar dan upload bukti bayar.",
        paymentInstructionsTitle: "Instruksi pembayaran",
        uploadPaymentProof: "Upload Bukti Bayar",
        paymentProof: "Bukti bayar",
        noQrisConfigured: "QRIS belum tersedia. Hubungi organizer.",
        paymentStatus_pending_payment: "Menunggu pembayaran",
        paymentStatus_pending_review: "Menunggu verifikasi",
        paymentStatus_rejected: "Ditolak",
        paymentStatus_expired: "Kedaluwarsa",
      },
      status: {
        registrationOpen: "Pendaftaran Dibuka",
      },
    };
    return messages[namespace]?.[key] ?? key;
  }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
vi.mock("@/i18n/redirect", () => ({
  redirectToActiveLocale: (url: string): never => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireRole }));
vi.mock("@/lib/platform/repository", () => ({
  getCaptainTeams,
  getCertificatesForEvents,
  getEventsByIds,
  getGameForEvent,
  getModeForEvent,
  getCaptainRegistrationRequests,
  getOpenRegistrationEventsForCaptain,
  getPaymentSettings,
  getPlayersForTeams,
  hasTempPassword,
}));
vi.mock("@/components/GameArt", () => ({
  GameArt: () => <div />,
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
}));

Object.assign(globalThis, { React });

import CaptainPage from "./page";

const openEvent = {
  id: "event-open",
  slug: "open-cup",
  name: "Open Cup",
  description: "Open registration event",
  gameId: "game-kuroko",
  gameModeId: "mode-kuroko-3v3",
  format: "Single Elimination" as const,
  status: "Published" as const,
  participantCap: 8 as const,
  registrationWindow: "Aug 24 - Aug 31",
  startsAt: "2026-09-01",
  venue: "Online",
  registrationFeeRequired: false,
  registeredTeams: 3,
};

describe("captain dashboard event registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRole.mockResolvedValue({ id: "captain-1", email: "cap@test.com", name: "Captain", role: "captain" });
    getCaptainTeams.mockResolvedValue([]);
    hasTempPassword.mockResolvedValue(false);
    getEventsByIds.mockResolvedValue([]);
    getPlayersForTeams.mockResolvedValue([]);
    getCertificatesForEvents.mockResolvedValue(new Map());
  });

  it("renders registration and roster as separate tabs", async () => {
    getCaptainRegistrationRequests.mockResolvedValue([]);
    getPaymentSettings.mockResolvedValue({ id: "global" });
    getOpenRegistrationEventsForCaptain.mockResolvedValue([openEvent]);

    const page = await CaptainPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Daftar Event Baru");
    expect(html).toContain("Open Cup");
    expect(html).toContain("name=\"eventId\" value=\"event-open\"");
    expect(html).toContain("Daftarkan Tim");
    expect(html).toContain("data-registration-list-item=\"true\"");
    expect(html).not.toContain("lg:grid-cols-2");
  });

  it("shows an empty state when no published event is available to this captain", async () => {
    getCaptainRegistrationRequests.mockResolvedValue([]);
    getPaymentSettings.mockResolvedValue({ id: "global" });
    getOpenRegistrationEventsForCaptain.mockResolvedValue([]);

    const page = await CaptainPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Tidak ada event baru yang sedang membuka pendaftaran untuk akun ini.");
  });

  it("shows pending paid registration requests with QRIS and proof upload", async () => {
    getOpenRegistrationEventsForCaptain.mockResolvedValue([]);
    getPaymentSettings.mockResolvedValue({ id: "global", qrisImageUrl: "/payment/qris.png", instructions: "Scan QRIS lalu upload bukti." });
    getCaptainRegistrationRequests.mockResolvedValue([
      {
        id: "request-1",
        eventId: "event-paid",
        captainId: "captain-1",
        teamName: "Paid United",
        teamTag: "PDU",
        status: "pending_payment",
        expiresAt: new Date("2026-08-25T00:00:00.000Z"),
        createdAt: new Date("2026-08-24T00:00:00.000Z"),
        updatedAt: new Date("2026-08-24T00:00:00.000Z"),
        event: { ...openEvent, id: "event-paid", name: "Paid Cup", registrationFeeRequired: true, registrationFeeAmount: 25000, registrationFeeLabel: "Rp25.000 / team" },
      },
    ]);

    const page = await CaptainPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Status Pembayaran");
    expect(html).toContain("Paid Cup");
    expect(html).toContain("Scan QRIS lalu upload bukti.");
    expect(html).toContain("/payment/qris.png");
    expect(html).toContain("name=\"paymentProof\"");
    expect(html).toContain("Upload Bukti Bayar");
  });});