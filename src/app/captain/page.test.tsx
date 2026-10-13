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
  getCaptainPaymentSettings,
  getPlayersForTeams,
  hasTempPassword,
  requireRole,
  getRosterChangeOverview,
} = vi.hoisted(() => ({
  getCaptainTeams: vi.fn(),
  getCertificatesForEvents: vi.fn(),
  getEventsByIds: vi.fn(),
  getGameForEvent: vi.fn(),
  getModeForEvent: vi.fn(),
  getCaptainRegistrationRequests: vi.fn(),
  getOpenRegistrationEventsForCaptain: vi.fn(),
  getCaptainPaymentSettings: vi.fn(),
  getPlayersForTeams: vi.fn(),
  hasTempPassword: vi.fn(),
  requireRole: vi.fn(),
  getRosterChangeOverview: vi.fn(),
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
vi.mock("@/lib/certificate/repository", () => ({
  getCertificatesForEvents,
}));
vi.mock("@/lib/events/repository", () => ({
  getEventsByIds,
  getOpenRegistrationEventsForCaptain,
}));
vi.mock("@/lib/identity/repository", () => ({
  hasTempPassword,
}));
vi.mock("@/lib/platform/settings-repository", () => ({
  getGameForEvent,
  getModeForEvent,
}));
vi.mock("@/lib/registration/repository", () => ({
  getCaptainRegistrationRequests,
}));
vi.mock("@/lib/teams/repository", () => ({
  getCaptainTeams,
  getPlayersForTeams,
}));
vi.mock("@/lib/platform/roster-change-requests", () => ({ getRosterChangeOverview }));
vi.mock("@/lib/actions/captain-roster-change-actions", () => ({
  captainRequestRosterChangeAction: vi.fn(),
  captainCancelRosterChangeAction: vi.fn(),
}));
vi.mock("@/lib/registration/captain-repository", () => ({ getCaptainPaymentSettings }));
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
    getRosterChangeOverview.mockResolvedValue(null);
  });

  it("renders registration and roster as separate tabs", async () => {
    getCaptainRegistrationRequests.mockResolvedValue([]);
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
    getOpenRegistrationEventsForCaptain.mockResolvedValue([]);

    const page = await CaptainPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Tidak ada event baru yang sedang membuka pendaftaran untuk akun ini.");
  });

  it("shows pending paid registration requests with QRIS and proof upload", async () => {
    getOpenRegistrationEventsForCaptain.mockResolvedValue([]);
    getCaptainPaymentSettings.mockResolvedValue({ id: "event-settings-paid", eventId: "event-paid", source: "event", qrisImageUrl: "/payment/qris.png", instructions: "Scan QRIS lalu upload bukti." });
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
    expect(getCaptainPaymentSettings).toHaveBeenCalledWith("event-paid");
  });

  it("offers position choices for a draft team that has no event yet", async () => {
    getCaptainRegistrationRequests.mockResolvedValue([]);
    getOpenRegistrationEventsForCaptain.mockResolvedValue([]);
    getCaptainTeams.mockResolvedValue([
      { id: "draft-1", name: "Draft FC", tag: "DFC", captainId: "captain-1", eventId: null, source: "draft" },
    ]);

    const html = renderToStaticMarkup(await CaptainPage({ searchParams: Promise.resolve({ tab: "roster" }) }));

    expect(html).toContain("id=\"add-player-form\"");
    expect(html).toContain("<option value=\"Jungler\">Jungler</option>");
    expect(html).toContain("<option value=\"Guard\">Guard</option>");
  });

  it("registers with the draft team even when leftover intake copies are listed first", async () => {
    getCaptainRegistrationRequests.mockResolvedValue([]);
    getOpenRegistrationEventsForCaptain.mockResolvedValue([{ ...openEvent, registrationFeeRequired: true }]);
    getCaptainTeams.mockResolvedValue([
      { id: "intake-2", name: "Teil E-sports", tag: "TEL", captainId: "captain-1", eventId: null, source: "registration-intake" },
      { id: "draft-1", name: "Teil E-sports", tag: "TEL", captainId: "captain-1", eventId: null, source: "draft" },
      { id: "intake-1", name: "Teil E-sports", tag: "TEL", captainId: "captain-1", eventId: null, source: "registration-intake" },
    ]);

    const html = renderToStaticMarkup(await CaptainPage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain("name=\"draftTeamId\" value=\"draft-1\"");
    expect(html).not.toContain("value=\"intake-2\"");
    expect(html).not.toContain("value=\"intake-1\"");
  });

  it("does not treat a registration intake copy as the captain's draft", async () => {
    getCaptainRegistrationRequests.mockResolvedValue([]);
    getOpenRegistrationEventsForCaptain.mockResolvedValue([openEvent]);
    getCaptainTeams.mockResolvedValue([
      { id: "intake-1", name: "Teil E-sports", tag: "TEL", captainId: "captain-1", eventId: null, source: "registration-intake" },
    ]);

    const html = renderToStaticMarkup(await CaptainPage({ searchParams: Promise.resolve({}) }));

    expect(html).not.toContain("name=\"draftTeamId\"");
  });

  it("shows the organizer-missing notice instead of any Miracle QRIS when the event has none", async () => {
    getOpenRegistrationEventsForCaptain.mockResolvedValue([]);
    getCaptainPaymentSettings.mockResolvedValue({ id: "event-payment-event-paid", eventId: "event-paid", source: "event" });
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

    const html = renderToStaticMarkup(await CaptainPage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain("QRIS belum tersedia. Hubungi organizer.");
    expect(html).not.toContain("alt=\"QRIS\"");
  });
});

describe("captain roster tab and the roster lock", () => {
  const team = { id: "team-1", eventId: "event-1", captainId: "captain-1", name: "Redclover", tag: "RC", source: "registration", logoText: "RC" };
  const players = [
    { id: "p-a", teamId: "team-1", displayName: "UID-a", nickname: "Ace", position: "Guard" },
    { id: "p-b", teamId: "team-1", displayName: "UID-b", nickname: "Bee", position: "Guard" },
  ];
  const overview = (window: string, extra: Record<string, unknown> = {}) => ({
    window, limit: 2, used: 0, remaining: 2, pending: null, history: [], rosterMin: 3, rosterMax: 5, activeCount: 2, ...extra,
  });

  async function renderRoster(params: Record<string, string> = {}) {
    getCaptainRegistrationRequests.mockResolvedValue([]);
    getOpenRegistrationEventsForCaptain.mockResolvedValue([]);
    getCaptainTeams.mockResolvedValue([team]);
    getEventsByIds.mockResolvedValue([{ ...openEvent, id: "event-1", status: "Registration Closed" }]);
    getPlayersForTeams.mockResolvedValue(players);
    getGameForEvent.mockReturnValue({ id: "game-kuroko", name: "Kuroko" });
    getModeForEvent.mockReturnValue({ id: "mode-kuroko-3v3", name: "3v3", positions: ["Guard"] });
    const page = await CaptainPage({ searchParams: Promise.resolve({ tab: "roster", ...params }) });
    return renderToStaticMarkup(page);
  }

  it("keeps the direct add, edit and delete controls while the roster is free", async () => {
    getRosterChangeOverview.mockResolvedValue(overview("free"));
    const html = await renderRoster();
    expect(html).toContain('id="add-player-form"');
    expect(html).toContain("edit=p-a");
    expect(html).not.toContain("rosterChange.title");
  });

  it("keeps today's controls when the overview cannot be read", async () => {
    getRosterChangeOverview.mockRejectedValue(new Error("db down"));
    const html = await renderRoster();
    expect(html).toContain('id="add-player-form"');
    expect(html).not.toContain("rosterChange.title");
  });

  it("swaps the direct controls for the request panel while changes are limited", async () => {
    getRosterChangeOverview.mockResolvedValue(overview("limited"));
    const html = await renderRoster();
    expect(html).not.toContain('id="add-player-form"');
    expect(html).not.toContain("edit=p-a");
    expect(html).not.toContain("confirm=p-a");
    expect(html).toContain("rosterChange.limitedNotice");
    expect(html).toContain('name="kind"');
    expect(html).toContain("Ace");
  });

  it("opens the edit and delete forms from the address bar only while the roster is free", async () => {
    getRosterChangeOverview.mockResolvedValue(overview("free"));
    const free = await renderRoster({ edit: "p-a", confirm: "p-b" });
    expect(free).toContain("editPlayerTitle");
    expect(free).toContain("deleteConfirm");

    getRosterChangeOverview.mockResolvedValue(overview("limited"));
    const limited = await renderRoster({ edit: "p-a", confirm: "p-b" });
    expect(limited).not.toContain("editPlayerTitle");
    expect(limited).not.toContain("deleteConfirm");
  });

  it("shows only the lock notice once the roster is locked", async () => {
    getRosterChangeOverview.mockResolvedValue(overview("locked", { remaining: 0 }));
    const html = await renderRoster();
    expect(html).not.toContain('id="add-player-form"');
    expect(html).toContain("rosterChange.lockedNotice");
    expect(html).not.toContain('name="kind"');
  });

  it("confirms a filed request on the roster tab", async () => {
    getRosterChangeOverview.mockResolvedValue(overview("limited"));
    const html = await renderRoster({ success: "roster-change-requested" });
    expect(html).toContain("rosterChange.requestedNotice");
  });
});
