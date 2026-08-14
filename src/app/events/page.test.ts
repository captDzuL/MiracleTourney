import fs from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

describe("events page public cards", () => {
  test("renders visible event naming and media placeholders for MVP cards", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "./page.tsx"), "utf8");

    expect(source).toContain("{event.name}");
    expect(source).toContain("logo");
    expect(source).toContain("{game.name}");
    expect(source).toContain("getEventBackgroundUrl(event)");
    expect(source).not.toContain('className="mt-4 text-xl font-semibold text-white">{event.name}</h2>');
  });

  test("homepage mode label rendering does not require getModeForEvent lookups", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../home-page-content.tsx"), "utf8");

    expect(source).not.toContain("getModeForEvent(event)");
    expect(source).toContain("getDefaultModeLabel(event.gameModeId, event.gameId)");
  });

  test("homepage promotes participant demo exploration instead of direct registration", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../home-page-content.tsx"), "utf8");

    expect(source).toContain("featuredEvent");
    expect(source).toContain("quickLinks");
    expect(source).toContain("/participants");
    expect(source).toContain("/leaderboards");
    expect(source).not.toContain('href="/register"');
  });

  test("homepage keeps demo events visible when public event loading falls back", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../home-page-content.tsx"), "utf8");

    expect(source).toContain('getPublicEvents as getDemoPublicEvents');
    expect(source).toContain("getDemoPublicEvents()");
  });

  test("global link styling does not override Tailwind text color utilities", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../globals.css"), "utf8");

    expect(source).not.toContain("color: inherit");
    expect(source).toContain("text-decoration: none");
  });

  test("captain stats page resolves stat keys through registry helpers", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../captain/stats/page.tsx"), "utf8");

    expect(source).not.toContain("getGameModes");
    expect(source).not.toContain("gameModes.find");
    expect(source).toContain("getStatKeysForMode(row.gameModeId, row.gameId)");
  });

  test("public leaderboard pages render stat summaries in registry order", () => {
    const leaderboardSource = fs.readFileSync(
      path.resolve(__dirname, "./[slug]/leaderboards/leaderboards-page.tsx"),
      "utf8",
    );
    const detailSource = fs.readFileSync(
      path.resolve(__dirname, "./[slug]/event-detail-page.tsx"),
      "utf8",
    );

    expect(leaderboardSource).toContain("getOrderedStatEntries(entry.totalStats, event.gameModeId, event.gameId)");
    expect(leaderboardSource).not.toContain("Object.entries(entry.totalStats)");

    expect(detailSource).toContain(
      "getOrderedStatEntries(leaderboard[0].totalStats, event.gameModeId, event.gameId)",
    );
    expect(detailSource).not.toContain("Object.entries(leaderboard[0].totalStats)");
  });

  test("event detail links do not require a next-intl client provider on the non-locale route", () => {
    const detailSource = fs.readFileSync(
      path.resolve(__dirname, "./[slug]/event-detail-page.tsx"),
      "utf8",
    );
    const localizedPageSource = fs.readFileSync(
      path.resolve(__dirname, "../[locale]/events/[slug]/page.tsx"),
      "utf8",
    );

    expect(detailSource).not.toContain('import { Link } from "@/i18n/navigation"');
    expect(detailSource).toContain('import Link from "next/link"');
    expect(detailSource).toContain("function buildEventHref");
    expect(localizedPageSource).toContain("renderEventDetailPage(slug, locale as");
  });

  test("event detail shows an external registration CTA only when a registration URL exists", () => {
    const detailSource = fs.readFileSync(
      path.resolve(__dirname, "./[slug]/event-detail-page.tsx"),
      "utf8",
    );

    expect(detailSource).toContain("event.registrationUrl");
    expect(detailSource).toContain("Daftar Event");
    expect(detailSource).toContain('target="_blank"');
  });

  test("localized events page passes search params through to the shared events page", () => {
    const localizedEventsSource = fs.readFileSync(
      path.resolve(__dirname, "../[locale]/events/page.tsx"),
      "utf8",
    );

    expect(localizedEventsSource).toContain("searchParams");
    expect(localizedEventsSource).toContain("<EventsPage searchParams={searchParams} />");
  });

  test("non-locale events page does not require a next-intl client link provider", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "./page.tsx"), "utf8");

    expect(source).toContain('import Link from "next/link"');
    expect(source).toContain("getLocale()");
    expect(source).not.toContain('import { Link } from "@/i18n/navigation"');
  });
});
