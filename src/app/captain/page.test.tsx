import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCaptainTeams,
  getCertificatesForEvents,
  getEventsByIds,
  getGameForEvent,
  getModeForEvent,
  getOpenRegistrationEventsForCaptain,
  getPlayersForTeams,
  hasTempPassword,
  requireRole,
} = vi.hoisted(() => ({
  getCaptainTeams: vi.fn(),
  getCertificatesForEvents: vi.fn(),
  getEventsByIds: vi.fn(),
  getGameForEvent: vi.fn(),
  getModeForEvent: vi.fn(),
  getOpenRegistrationEventsForCaptain: vi.fn(),
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
  getOpenRegistrationEventsForCaptain,
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
    getOpenRegistrationEventsForCaptain.mockResolvedValue([]);

    const page = await CaptainPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Tidak ada event baru yang sedang membuka pendaftaran untuk akun ini.");
  });
});