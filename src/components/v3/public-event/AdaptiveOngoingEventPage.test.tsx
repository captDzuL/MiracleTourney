import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AdaptiveOngoingEventPage } from "./AdaptiveOngoingEventPage";
import type { PublicOngoingEventViewModel, PublicOngoingMatch } from "@/lib/events/public-ongoing-types";
const match: PublicOngoingMatch & { roundLabel: string } = { id: "m1", home: "Alpha", away: "Bravo", round: 1, roundLabel: "upper 1", phaseId: "p", groupId: null, groupNumber: null, isPlayoff: false, bracket: "upper", bestOf: 3, status: "live", start: "2026-09-12T02:00:00Z", end: "2026-09-12T03:00:00Z", room: "Arena A", scheduledLabel: null, homeScore: null, awayScore: null, resultVersion: 0, confirmedAt: null };
const view: PublicOngoingEventViewModel = { mode: "ongoing", event: { id: "e", slug: "cup", name: "Miracle Cup", description: "Tournament", timezone: "Asia/Jakarta", format: "double_elimination" }, matches: [match], liveMatches: [match, { ...match, id: "m2", room: "Arena B" }], nextMatches: [{ ...match, id: "final", status: "delayed", home: null, away: null }], recentResults: [], schedule: { version: 2, publishedAt: null, changes: [] }, standings: [], announcements: [{ id: "a", title: "Room update", body: "See Arena B", urgency: "info", publishedAt: "2026-09-12T02:00:00Z", endsAt: null }], stream: { url: "https://youtube.com/watch?v=test", label: "Main stream", platform: "YouTube", isLive: true }, leaderboardHref: "/events/cup/leaderboards", stateVersion: "one", lastUpdatedAt: "2026-09-12T02:00:00Z" };
it.each(["id", "en"] as const)("renders simultaneous rooms, TBD, delayed state and localized accessible navigation in %s", locale => {
  const html = renderToStaticMarkup(<AdaptiveOngoingEventPage view={view} locale={locale} />);
  expect(html).toContain("<h1"); expect(html).toContain("Miracle Cup"); expect(html).toContain("Arena A"); expect(html).toContain("Arena B");
  expect(html).toContain('aria-label='); expect(html).toContain('min-h-11'); expect(html).toContain('min-w-0');
  expect(html).toContain(locale === "id" ? "Sedang berlangsung" : "Live now");
  expect(html).toContain(locale === "id" ? "Tertunda" : "Delayed"); expect(html).toContain("TBD");
  expect(html).toContain(`href="/${locale}/events/cup/leaderboards"`); expect(html).toContain("Room update");
  for (const route of ["participants", "schedule", "bracket"]) expect(html).toContain(`href="/${locale}/events/cup/${route}"`);
  expect(html).not.toMatch(/0\s[\u2013-]\s0/);
});
it("shows no-live and qualification context with official results", () => {
  const html = renderToStaticMarkup(<AdaptiveOngoingEventPage locale="en" view={{ ...view, liveMatches: [], recentResults: [{ ...match, status: "completed", homeScore: 2, awayScore: 1, resultVersion: 2 }], standings: [{ phaseId: "p", groupId: "g", groupNumber: 1, label: "Group A", complete: false, qualificationCutline: 2, rows: [{ teamId: "a", name: "Alpha", played: 1, wins: 1, draws: 0, losses: 0, points: 3, scoreFor: 2, scoreAgainst: 1, scoreDifference: 1, rank: 1, tied: false }] }] }} />);
  expect(html).toContain("No matches live right now"); expect(html).toContain("Top 2 qualify"); expect(html).toContain("Group A"); expect(html).toMatch(/2\s(?:-|–)\s1/);
});
it.each(["id", "en"] as const)("labels urgent announcements explicitly in %s", locale => {
  const html = renderToStaticMarkup(<AdaptiveOngoingEventPage locale={locale} view={{ ...view, announcements: [{ ...view.announcements[0], urgency: "urgent" }] }} />);
  expect(html).toContain(locale === "id" ? "Mendesak" : "Urgent");
});
it("keeps the complete published fixture list accessible beyond the next twelve matches", () => {
  const nextMatches = Array.from({ length: 14 }, (_, index) => ({ ...match, id: `fixture-${index}`, home: `Team ${index}`, status: "scheduled" as const }));
  const html = renderToStaticMarkup(<AdaptiveOngoingEventPage locale="en" view={{ ...view, matches: [], nextMatches }} />);
  expect(html).toContain("Team 13"); expect(html).toContain("<summary"); expect(html).toContain("Remaining schedule");
  expect(html.match(/Team 0/g)).toHaveLength(1);
  expect(html.match(/Team 13/g)).toHaveLength(1);
});
it.each([
  ["single", null, false, "single 1", "Eliminasi · Babak 1", "Elimination · Round 1"],
  ["upper", null, false, "upper 1", "Bagan atas · Babak 1", "Upper bracket · Round 1"],
  ["lower", null, false, "lower 1", "Bagan bawah · Babak 1", "Lower bracket · Round 1"],
  ["grand_final", null, false, "grand_final 1", "Final utama", "Grand final"],
  ["round_robin", null, false, "round_robin 1", "Liga · Babak 1", "League · Round 1"],
  ["round_robin", 1, false, "round_robin 1", "Grup A · Babak 1", "Group A · Round 1"],
  ["single", null, true, "single 1", "Playoff · Eliminasi · Babak 1", "Playoffs · Elimination · Round 1"],
] as const)("localizes %s context without displaying %s internal labels", (bracket, groupNumber, isPlayoff, internalLabel, idLabel, enLabel) => {
  for (const locale of ["id", "en"] as const) {
    const fixture = { ...match, bracket, groupNumber, isPlayoff, roundLabel: internalLabel, home: null, away: null };
    const html = renderToStaticMarkup(<AdaptiveOngoingEventPage locale={locale} view={{ ...view, matches: [fixture], liveMatches: [], nextMatches: [fixture] }} />);
    expect(html).toContain(locale === "id" ? idLabel : enLabel); expect(html).not.toContain(internalLabel); expect(html).toContain("TBD");
  }
});

