import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";
import id from "../../../../messages/id.json";

const mocks = vi.hoisted(() => ({
  locale: { current: "id" },
  requireRole: vi.fn(),
  isFeatureEnabled: vi.fn(),
  getPlayerDashboard: vi.fn(),
  getPlayerTeamView: vi.fn(),
  getPlayerWhatsapp: vi.fn(),
  hasTempPassword: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("next-intl/server", () => ({
  setRequestLocale: (locale: string) => { mocks.locale.current = locale; },
  getTranslations: async (namespace: string) => {
    const locale = mocks.locale.current === "en" ? "en" : "id";
    return createTranslator({ locale, messages: locale === "en" ? en : id, namespace: namespace as never, onError: (error) => { throw error; } });
  },
}));
vi.mock("@/i18n/redirect", () => ({ redirectToActiveLocale: (path: string): never => { throw new Error(`REDIRECT:${path}`); } }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a>,
  usePathname: () => "/player",
}));
vi.mock("@/lib/auth/session", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: mocks.isFeatureEnabled }));
vi.mock("@/lib/player/dashboard-read", () => ({ getPlayerDashboard: mocks.getPlayerDashboard, getPlayerTeamView: mocks.getPlayerTeamView }));
vi.mock("@/lib/player/profile-repository", () => ({ getPlayerWhatsapp: mocks.getPlayerWhatsapp }));
vi.mock("@/lib/platform/repository", () => ({ hasTempPassword: mocks.hasTempPassword }));
vi.mock("@/lib/actions/player-profile-actions", () => ({ updatePlayerProfileAction: vi.fn() }));
vi.mock("@/lib/actions", () => ({ changePasswordAction: vi.fn() }));

import PlayerHomePage from "./page";
import PlayerProfilePage from "./profile/page";
import PlayerRegistrationsPage from "./registrations/page";
import PlayerSettingsPage from "./settings/page";
import PlayerTeamPage from "./team/[eventId]/page";

Object.assign(globalThis, { React });

const player = { id: "player-1", role: "player", name: "Bima", email: "b@test.local" };
const params = <T extends Record<string, string>>(extra?: T): Promise<{ locale: string } & T> => Promise.resolve({ locale: "id", ...extra } as { locale: string } & T);
const view = async (node: Promise<React.ReactNode> | React.ReactNode) =>
  renderToStaticMarkup(<NextIntlClientProvider locale="id" messages={id}>{await node}</NextIntlClientProvider>);

const registration = (stage: object, extra: object = {}) => ({
  registrationId: "r1", ign: "Bima", uid: "UID-1", primaryPosition: "Goalkeeper", secondaryPosition: null, createdAt: new Date("2026-10-13"),
  event: { id: "event-1", slug: "solo-cup", name: "Solo Cup", status: "Published", feeRequired: true }, stage, team: null, ...extra,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.locale.current = "id";
  mocks.requireRole.mockResolvedValue(player);
  mocks.isFeatureEnabled.mockReturnValue(true);
  mocks.getPlayerDashboard.mockResolvedValue({ registrations: [], nextMatch: null });
  mocks.getPlayerWhatsapp.mockResolvedValue("6281234567890");
  mocks.hasTempPassword.mockResolvedValue(false);
});

const pages: ReadonlyArray<[string, () => Promise<React.ReactNode>]> = [
  ["the overview", () => PlayerHomePage({ params: params() }) as Promise<React.ReactNode>],
  ["the registrations", () => PlayerRegistrationsPage({ params: params() }) as Promise<React.ReactNode>],
  ["a team", () => PlayerTeamPage({ params: params({ eventId: "event-1" }) }) as Promise<React.ReactNode>],
  ["the profile", () => PlayerProfilePage({ params: params() }) as Promise<React.ReactNode>],
  ["the settings", () => PlayerSettingsPage({ params: params() }) as Promise<React.ReactNode>],
];

describe.each(pages)("%s", (_name, open) => {
  it("is not there while solo tournaments are switched off, and reads nothing", async () => {
    mocks.isFeatureEnabled.mockReturnValue(false);
    await expect(open()).rejects.toThrow("NOT_FOUND");
    expect(mocks.getPlayerDashboard).not.toHaveBeenCalled();
    expect(mocks.getPlayerTeamView).not.toHaveBeenCalled();
    expect(mocks.getPlayerWhatsapp).not.toHaveBeenCalled();
  });

  it.each([
    ["nobody signed in", null],
    ["a captain", { id: "captain-1", role: "captain", name: "Kapten", email: "c@test.local" }],
    ["an organizer", { id: "org-1", role: "organizer", name: "Org", email: "o@test.local" }],
  ])("sends %s to sign in, and reads nothing", async (_who, user) => {
    // The session answers for one role only, as the real one does.
    mocks.requireRole.mockImplementation(async (role: string) => (user && user.role === role ? user : null));
    await expect(open()).rejects.toThrow("REDIRECT:/login");
    expect(mocks.requireRole).toHaveBeenCalledWith("player");
    expect(mocks.getPlayerDashboard).not.toHaveBeenCalled();
    expect(mocks.getPlayerTeamView).not.toHaveBeenCalled();
    expect(mocks.getPlayerWhatsapp).not.toHaveBeenCalled();
  });
});

describe("the overview", () => {
  it("asks only for the signed-in player's own data", async () => {
    await view(PlayerHomePage({ params: params() }));
    expect(mocks.getPlayerDashboard).toHaveBeenCalledWith("player-1");
  });

  it("greets the player and points to the events when there is nothing yet", async () => {
    const html = await view(PlayerHomePage({ params: params() }));
    expect(html).toContain("Halo, Bima");
    expect(html).toContain("Kamu belum daftar event solo.");
    expect(html).toContain('href="/events"');
    expect(html).not.toContain("Tim kamu");
    expect(html).not.toContain("Pertandingan berikutnya");
  });

  it("shows active registrations, one card per team, and the next match once there is a team", async () => {
    const team = { id: "t1", name: "Tim 2", tag: "T2", iAmCaptain: true };
    mocks.getPlayerDashboard.mockResolvedValue({
      registrations: [
        registration({ kind: "in_team" }, { team }),
        registration({ kind: "lost", why: "expired", refund: "none" }, { registrationId: "r2", event: { id: "event-2", slug: "old", name: "Old Cup", status: "Finished", feeRequired: false } }),
      ],
      nextMatch: { matchId: "m1", eventId: "event-1", eventName: "Solo Cup", teamName: "Tim 2", opponentName: "Tim 3", roundLabel: "Final", status: "Scheduled", scheduledAt: new Date("2026-10-20T10:00:00Z"), scheduledLabel: null },
    });

    const html = await view(PlayerHomePage({ params: params() }));

    expect(html).toContain("Tim kamu");
    expect(html).toContain('href="/player/team/event-1"');
    expect(html).toContain('href="/captain"');
    expect(html).toContain("Tim 2 lawan Tim 3");
    expect(html).toContain("Solo Cup");
    expect(html).not.toContain("Old Cup");
  });

  it("confirms a password change", async () => {
    const html = await view(PlayerHomePage({ params: params(), searchParams: Promise.resolve({ success: "password-changed" }) }));
    expect(html).toContain("Password sudah diganti.");
  });
});

describe("the registrations", () => {
  it("keeps what is alive apart from the history", async () => {
    mocks.getPlayerDashboard.mockResolvedValue({
      registrations: [
        registration({ kind: "queued", position: 2 }),
        registration({ kind: "lost", why: "withdrawn", refund: "none" }, { registrationId: "r2", event: { id: "event-2", slug: "old", name: "Old Cup", status: "Finished", feeRequired: false } }),
      ],
      nextMatch: null,
    });
    const html = await view(PlayerRegistrationsPage({ params: params() }));
    const active = html.slice(html.indexOf("Pendaftaran aktif"), html.indexOf("Riwayat"));
    const history = html.slice(html.indexOf("Riwayat"));
    expect(active).toContain("Solo Cup");
    expect(active).not.toContain("Old Cup");
    expect(history).toContain("Old Cup");
  });

  it("says so when there is no history", async () => {
    expect(await view(PlayerRegistrationsPage({ params: params() }))).toContain("Belum ada riwayat.");
  });
});

describe("a team page", () => {
  const teamView = {
    event: { id: "event-1", slug: "solo-cup", name: "Solo Cup", status: "Ongoing" },
    team: { id: "t1", name: "Tim 2", tag: "T2" },
    members: [{ playerId: "p1", ign: "Ace", uid: "UID-1", position: "Goalkeeper", whatsapp: "6281234567890", isCaptain: true, isMe: true }],
    iAmCaptain: true,
    matches: [],
  };

  it("shows the team, the numbers of the teammates and a way to the captain pages", async () => {
    mocks.getPlayerTeamView.mockResolvedValue(teamView);
    const html = await view(PlayerTeamPage({ params: params({ eventId: "event-1" }) }));
    expect(mocks.getPlayerTeamView).toHaveBeenCalledWith("player-1", "event-1");
    expect(html).toContain("Tim 2");
    expect(html).toContain("https://wa.me/6281234567890");
    expect(html).toContain('href="/captain"');
    expect(html).toContain("Belum ada pertandingan terjadwal.");
  });

  it("is a 404 for a team the player is not on, or one that is not locked", async () => {
    mocks.getPlayerTeamView.mockResolvedValue(null);
    await expect(PlayerTeamPage({ params: params({ eventId: "event-9" }) })).rejects.toThrow("NOT_FOUND");
  });

  it("is a 404 for an event id that is not even well formed, without asking the database", async () => {
    await expect(PlayerTeamPage({ params: params({ eventId: "../etc/passwd" }) })).rejects.toThrow("NOT_FOUND");
    expect(mocks.getPlayerTeamView).not.toHaveBeenCalled();
  });

  it("hides the captain link from a player who does not captain the team", async () => {
    mocks.getPlayerTeamView.mockResolvedValue({ ...teamView, iAmCaptain: false });
    expect(await view(PlayerTeamPage({ params: params({ eventId: "event-1" }) }))).not.toContain('href="/captain"');
  });
});

describe("the profile", () => {
  it("fills in the number the player gave, with the country code shown", async () => {
    const html = await view(PlayerProfilePage({ params: params() }));
    expect(mocks.getPlayerWhatsapp).toHaveBeenCalledWith("player-1");
    expect(html).toContain('value="+6281234567890"');
    expect(html).toContain('name="locale"');
    expect(html).toContain('autoComplete="tel"');
  });

  it("starts empty for a player without a profile", async () => {
    mocks.getPlayerWhatsapp.mockResolvedValue(undefined);
    expect(await view(PlayerProfilePage({ params: params() }))).toContain('value=""');
  });

  it.each([
    ["invalid-whatsapp", "Nomor WhatsApp tidak valid."],
    ["too-many", "Terlalu banyak percobaan."],
    ["save-failed", "Profil belum bisa disimpan."],
  ])("explains %s, and ignores a code it does not know", async (code, text) => {
    expect(await view(PlayerProfilePage({ params: params(), searchParams: Promise.resolve({ error: code }) }))).toContain(text);
    const unknown = await view(PlayerProfilePage({ params: params(), searchParams: Promise.resolve({ error: "<script>x</script>" }) }));
    expect(unknown).not.toContain("<script>x");
    expect(unknown).not.toContain('role="alert"');
  });

  it("confirms a save", async () => {
    expect(await view(PlayerProfilePage({ params: params(), searchParams: Promise.resolve({ success: "saved" }) }))).toContain("Profil disimpan.");
  });
});

describe("the settings", () => {
  it("is the captain's password form, on the player's own page", async () => {
    const html = await view(PlayerSettingsPage({ params: params() }));
    expect(html).toContain('name="currentPassword"');
    expect(html).toContain('name="confirmPassword"');
    expect(html).toContain("Pengaturan Akun");
    expect(mocks.hasTempPassword).toHaveBeenCalledWith("player-1");
  });

  it("warns about a temporary password and shows an error", async () => {
    mocks.hasTempPassword.mockResolvedValue(true);
    const html = await view(PlayerSettingsPage({ params: params(), searchParams: Promise.resolve({ error: "Password saat ini tidak tepat." }) }));
    expect(html).toContain("password sementara");
    expect(html).toContain("Password saat ini tidak tepat.");
  });

  it("shows no text that the password action did not send, and does not fall over on a stray percent sign", async () => {
    for (const error of ["Akun diblokir. Hubungi admin di WA 0812", "%", "<b>x</b>"]) {
      const html = await view(PlayerSettingsPage({ params: params(), searchParams: Promise.resolve({ error }) }));
      expect(html).not.toContain("Akun diblokir");
      expect(html).not.toContain('role="alert"');
    }
  });
});

describe("the English page", () => {
  it("has every text it needs", async () => {
    const errors: string[] = [];
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={en} onError={(error) => errors.push(error.message)}>
        {await PlayerProfilePage({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({ error: "invalid-whatsapp" }) })}
      </NextIntlClientProvider>,
    );
    expect(html).toContain("WhatsApp number");
    expect(html).toContain("That WhatsApp number is not valid.");
    expect(errors).toEqual([]);
  });
});
