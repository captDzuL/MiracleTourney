import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AdaptiveOngoingEventPage } from "./AdaptiveOngoingEventPage";
import type { PublicOngoingEventViewModel, PublicOngoingMatch } from "@/lib/events/public-ongoing-types";
const match: PublicOngoingMatch = { id: "m1", home: "Alpha", away: "Bravo", round: 1, roundLabel: "Round 1", phaseId: "p", groupId: null, bracket: "upper", bestOf: 3, status: "live", start: "2026-09-12T02:00:00Z", end: "2026-09-12T03:00:00Z", room: "Arena A", scheduledLabel: null, homeScore: null, awayScore: null, resultVersion: 0, confirmedAt: null };
const view: PublicOngoingEventViewModel = { mode: "ongoing", event: { id: "e", slug: "cup", name: "Miracle Cup", description: "Tournament", timezone: "Asia/Jakarta", format: "double_elimination" }, matches: [match], liveMatches: [match, { ...match, id: "m2", room: "Arena B" }], nextMatches: [{ ...match, id: "final", status: "delayed", home: null, away: null }], recentResults: [], schedule: { version: 2, publishedAt: null, changes: [] }, standings: [], announcements: [{ id: "a", title: "Room update", body: "See Arena B", urgency: "info", publishedAt: "2026-09-12T02:00:00Z", endsAt: null }], stream: { url: "https://youtube.com/watch?v=test", label: "Main stream", platform: "YouTube", isLive: true }, leaderboardHref: "/events/cup/leaderboards", stateVersion: "one", lastUpdatedAt: "2026-09-12T02:00:00Z" };
it.each(["id", "en"] as const)("renders simultaneous rooms, TBD, delayed state and localized accessible navigation in %s", locale => {
  const html = renderToStaticMarkup(<AdaptiveOngoingEventPage view={view} locale={locale} />);
  expect(html).toContain("<h1"); expect(html).toContain("Miracle Cup"); expect(html).toContain("Arena A"); expect(html).toContain("Arena B");
  expect(html).toContain('aria-label='); expect(html).toContain('min-h-11'); expect(html).toContain('min-w-0');
  expect(html).toContain(locale === "id" ? "Sedang berlangsung" : "Live now");
  expect(html).toContain(locale === "id" ? "Tertunda" : "Delayed"); expect(html).toContain("TBD");
  expect(html).toContain(`href="/${locale}/events/cup/leaderboards"`); expect(html).toContain("Room update");
  expect(html).not.toContain("0 – 0");
});
it("shows no-live and qualification context with official results", () => {
  const html = renderToStaticMarkup(<AdaptiveOngoingEventPage locale="en" view={{ ...view, liveMatches: [], recentResults: [{ ...match, status: "completed", homeScore: 2, awayScore: 1, resultVersion: 2 }], standings: [{ phaseId: "p", groupId: "g", label: "Group A", complete: false, qualificationCutline: 2, rows: [{ teamId: "a", name: "Alpha", played: 1, wins: 1, draws: 0, losses: 0, points: 3, scoreFor: 2, scoreAgainst: 1, scoreDifference: 1, rank: 1, tied: false }] }] }} />);
  expect(html).toContain("No matches live right now"); expect(html).toContain("Top 2 qualify"); expect(html).toContain("Group A"); expect(html).toContain("2 – 1");
});
it.each(["id", "en"] as const)("labels urgent announcements explicitly in %s", locale => {
  const html = renderToStaticMarkup(<AdaptiveOngoingEventPage locale={locale} view={{ ...view, announcements: [{ ...view.announcements[0], urgency: "urgent" }] }} />);
  expect(html).toContain(locale === "id" ? "Mendesak" : "Urgent");
});
it("keeps the complete published fixture list accessible beyond the next twelve matches", () => {
  const nextMatches = Array.from({ length: 14 }, (_, index) => ({ ...match, id: `fixture-${index}`, home: `Team ${index}`, status: "scheduled" as const }));
  const html = renderToStaticMarkup(<AdaptiveOngoingEventPage locale="en" view={{ ...view, matches: [], nextMatches }} />);
  expect(html).toContain("Team 13"); expect(html).toContain("<summary"); expect(html).toContain("Full schedule");
});
