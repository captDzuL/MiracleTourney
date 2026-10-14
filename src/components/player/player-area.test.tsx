// @vitest-environment jsdom
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";
import id from "../../../messages/id.json";
import type { PlayerMatch, PlayerRegistrationItem, PlayerStage, TeamMember } from "@/lib/player/dashboard-read";

const nav = vi.hoisted(() => ({ pathname: "/player" }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a>,
  usePathname: () => nav.pathname,
}));

import { NextMatchCard, MatchLine } from "./NextMatchCard";
import { PlayerNav } from "./PlayerNav";
import { PlayerRegistrationCard } from "./PlayerRegistrationCard";
import { PlayerTeamCard } from "./PlayerTeamCard";
import { TeamMembers } from "./TeamMembers";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

const DEADLINE = new Date("2026-10-15T10:00:00.000Z");

function html(locale: "id" | "en", node: React.ReactNode) {
  const errors: string[] = [];
  const markup = renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "id" ? id : en} timeZone="Asia/Jakarta" onError={(error) => errors.push(error.message)}>
      {node}
    </NextIntlClientProvider>,
  );
  expect(errors).toEqual([]);
  return markup;
}

const item = (stage: PlayerStage, overrides: Partial<PlayerRegistrationItem> = {}): PlayerRegistrationItem => ({
  registrationId: "r1", ign: "Bima", uid: "UID-1", primaryPosition: "Goalkeeper", secondaryPosition: null, createdAt: new Date("2026-10-13"),
  event: { id: "event-1", slug: "solo-cup", name: "Solo Cup", status: "Published", feeRequired: true }, stage, team: null, ...overrides,
});

describe("PlayerRegistrationCard", () => {
  it.each(["id", "en"] as const)("explains every stage in %s without a missing text", (locale) => {
    const stages: PlayerStage[] = [
      { kind: "queued", position: 3 }, { kind: "queued", position: null }, { kind: "pay", deadline: DEADLINE }, { kind: "pay", deadline: null },
      { kind: "review" }, { kind: "rejected", reason: "Bukti buram", deadline: DEADLINE }, { kind: "rejected", reason: null, deadline: DEADLINE },
      { kind: "waiting" }, { kind: "in_team" }, { kind: "out_of_teams", refund: "owed" }, { kind: "out_of_teams", refund: "done" }, { kind: "out_of_teams", refund: "none" },
      { kind: "lost", why: "expired", refund: "none" }, { kind: "lost", why: "withdrawn", refund: "owed" },
    ];
    for (const stage of stages) {
      const markup = html(locale, <PlayerRegistrationCard item={item(stage, { team: { id: "t1", name: "Tim 2", tag: "T2", iAmCaptain: false } })} locale={locale} />);
      expect(markup).toContain("Solo Cup");
      expect(markup).not.toMatch(/\{[a-z]+\}/);
    }
  });

  it("says the place in the queue and that nothing is due yet", () => {
    const markup = html("id", <PlayerRegistrationCard item={item({ kind: "queued", position: 3 })} locale="id" />);
    expect(markup).toContain("Kamu di antrean ke-3. Kamu belum perlu bayar.");
    expect(markup).toContain("Antrean");
  });

  it("gives the deadline in Jakarta time and a way to pay", () => {
    const markup = html("id", <PlayerRegistrationCard item={item({ kind: "pay", deadline: DEADLINE })} locale="id" />);
    expect(markup).toContain("Bayar sebelum");
    expect(markup).toContain("15 Okt 2026");
    expect(markup).toContain('href="/events/solo-cup/register"');
  });

  it("shows the reason a proof was turned down", () => {
    expect(html("id", <PlayerRegistrationCard item={item({ kind: "rejected", reason: "Bukti buram", deadline: DEADLINE })} locale="id" />)).toContain("Bukti bayar ditolak: Bukti buram.");
  });

  it("names the team and links to it once the player is in one", () => {
    const markup = html("id", <PlayerRegistrationCard item={item({ kind: "in_team" }, { team: { id: "t1", name: "Tim 2", tag: "T2", iAmCaptain: false } })} locale="id" />);
    expect(markup).toContain("Kamu masuk Tim 2.");
    expect(markup).toContain('href="/player/team/event-1"');
  });

  it("says whether the fee is coming back to a player left out, and shows nothing about money for a free event", () => {
    expect(html("id", <PlayerRegistrationCard item={item({ kind: "out_of_teams", refund: "owed" })} locale="id" />)).toContain("Organizer akan mengembalikan biaya kamu.");
    expect(html("id", <PlayerRegistrationCard item={item({ kind: "out_of_teams", refund: "done" })} locale="id" />)).toContain("Biaya sudah dikembalikan.");
    const free = html("id", <PlayerRegistrationCard item={item({ kind: "out_of_teams", refund: "none" })} locale="id" />);
    expect(free).not.toContain("biaya");
    expect(free).not.toContain("Biaya");
  });

  it("offers the sign-up page only while the event still takes sign-ups", () => {
    const open = html("id", <PlayerRegistrationCard item={item({ kind: "waiting" })} locale="id" />);
    expect(open).toContain('href="/events/solo-cup/register"');
    const closed = html("id", <PlayerRegistrationCard item={item({ kind: "waiting" }, { event: { id: "event-1", slug: "solo-cup", name: "Solo Cup", status: "Registration Closed", feeRequired: true } })} locale="id" />);
    expect(closed).not.toContain("/register");
  });

  it("calls the position by its everyday name and shows a backup position", () => {
    const markup = html("id", <PlayerRegistrationCard item={item({ kind: "waiting" }, { secondaryPosition: "Goalkeeper", primaryPosition: "Forward" })} locale="id" />);
    expect(markup).toContain("Forward");
    expect(markup).toContain("Cadangan: Kiper");
  });
});

describe("PlayerTeamCard", () => {
  const team = { id: "t1", name: "Tim 2", tag: "T2", iAmCaptain: false };

  it("links to the team, and to the captain pages only for the captain", () => {
    const plain = html("id", <PlayerTeamCard item={{ ...item({ kind: "in_team" }), team }} />);
    expect(plain).toContain('href="/player/team/event-1"');
    expect(plain).not.toContain('href="/captain"');
    const captain = html("id", <PlayerTeamCard item={{ ...item({ kind: "in_team" }), team: { ...team, iAmCaptain: true } }} />);
    expect(captain).toContain('href="/captain"');
    expect(captain).toContain("Kelola tim");
  });
});

describe("TeamMembers", () => {
  const member = (overrides: Partial<TeamMember> = {}): TeamMember => ({
    playerId: "p1", ign: "Ace", uid: "UID-1", position: "Goalkeeper", whatsapp: "6281234567890", isCaptain: false, isMe: false, ...overrides,
  });

  it("links a valid number to a chat, opened safely", () => {
    const markup = html("id", <TeamMembers members={[member()]} locale="id" />);
    expect(markup).toContain('href="https://wa.me/6281234567890"');
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(markup).toContain("Kiper");
    expect(markup).toContain("Nomor WhatsApp hanya terlihat oleh teman satu tim.");
  });

  it("never turns anything but digits into a link", () => {
    for (const whatsapp of ['6281"><script>x</script>', "javascript:alert(1)", "123", "62812345678901234567"]) {
      const markup = html("id", <TeamMembers members={[member({ whatsapp })]} locale="id" />);
      expect(markup).not.toContain("wa.me");
      expect(markup).not.toContain("<script>");
      expect(markup).toContain("Tidak ada");
    }
  });

  it("marks the captain and the player themselves, and says plainly when there is no number", () => {
    const markup = html("en", <TeamMembers members={[member({ isCaptain: true, isMe: true, whatsapp: null })]} locale="en" />);
    expect(markup).toContain("Captain");
    expect(markup).toContain("You");
    expect(markup).toContain("None");
  });
});

describe("matches", () => {
  const match = (overrides: Partial<PlayerMatch> = {}): PlayerMatch => ({
    matchId: "m1", eventId: "event-1", eventName: "Solo Cup", teamName: "Tim 1", opponentName: "Tim 2", roundLabel: "Semifinal", status: "Scheduled",
    scheduledAt: DEADLINE, scheduledLabel: null, ...overrides,
  });

  it("shows who plays whom, the round and the time", () => {
    const markup = html("id", <MatchLine match={match()} locale="id" />);
    expect(markup).toContain("Tim 1 lawan Tim 2");
    expect(markup).toContain("Semifinal");
    expect(markup).toContain("15 Okt 2026");
  });

  it("says when the opponent or the time is not known, and when it is live", () => {
    expect(html("id", <MatchLine match={match({ opponentName: null })} locale="id" />)).toContain("Lawan belum ditentukan");
    expect(html("id", <MatchLine match={match({ scheduledAt: null })} locale="id" />)).toContain("Jadwal belum ditentukan");
    expect(html("id", <MatchLine match={match({ scheduledAt: null, scheduledLabel: "Sabtu malam" })} locale="id" />)).toContain("Sabtu malam");
    expect(html("id", <MatchLine match={match({ status: "Live" })} locale="id" />)).toContain("Sedang berlangsung");
  });

  it("has a plain empty state", () => {
    expect(html("id", <NextMatchCard match={null} locale="id" />)).toContain("Belum ada pertandingan terjadwal.");
    expect(html("en", <NextMatchCard match={match()} locale="en" />)).toContain("Tim 1 vs Tim 2");
  });
});

describe("PlayerNav", () => {
  async function render(pathname: string) {
    nav.pathname = pathname;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<NextIntlClientProvider locale="id" messages={id}><PlayerNav /></NextIntlClientProvider>));
    const current = [...host.querySelectorAll('a[aria-current="page"]')].map((link) => link.getAttribute("href"));
    const all = [...host.querySelectorAll("a")].map((link) => link.getAttribute("href"));
    act(() => root.unmount());
    host.remove();
    return { current, all };
  }

  it("lists the four pages and marks the one that is open", async () => {
    const { current, all } = await render("/player/registrations");
    expect(all).toEqual(["/player", "/player/registrations", "/player/profile", "/player/settings"]);
    expect(current).toEqual(["/player/registrations"]);
  });

  it("marks the overview only on its own address, and a team page under no tab", async () => {
    expect((await render("/player")).current).toEqual(["/player"]);
    expect((await render("/player/team/event-1")).current).toEqual([]);
  });
});
