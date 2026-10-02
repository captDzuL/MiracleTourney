import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PublicV3EventViewModel } from "@/lib/events/public-v3-types";
import { publicV3RouteTargets } from "@/lib/events/public-v3-types";
import { PublicV3EventPage } from "./PublicV3EventPage";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const routeSource = fs.readFileSync(
  path.resolve(process.cwd(), "src/app/[locale]/events/[slug]/page.tsx"),
  "utf8",
);
const shellBoundarySource = fs.readFileSync(
  path.resolve(process.cwd(), "src/components/v3/public-discovery/PublicHomepageShellBoundary.tsx"),
  "utf8",
);

describe("public V3 event overview route", () => {
  it("uses the normalized reader for every public event while the adaptive flag is enabled", () => {
    expect(routeSource).toContain("readPublicV3Event");
    expect(routeSource).toContain("<PublicV3EventPage");
    expect(routeSource).toContain('isFeatureEnabled("adaptive_public_event_v3")');
    expect(routeSource.indexOf("readPublicV3Event")).toBeLessThan(routeSource.indexOf("renderEventDetailPage"));
    expect(routeSource).not.toContain("shouldUseAdaptiveRegistrationRenderer");
  });

  it("retains the legacy renderer only on the flag-off path", () => {
    expect(routeSource).toContain("return renderEventDetailPage");
    expect(routeSource).toMatch(/if\s*\(event && isFeatureEnabled\("adaptive_public_event_v3"\)[\s\S]*?<PublicV3EventPage/);
  });

  it("lets an adaptive overview own the public V3 frame without taking detail routes", () => {
    expect(shellBoundarySource).toContain("eventOverviewEnabled");
    expect(shellBoundarySource).toContain("const eventOverviewRoute = /^\\/events\\/[^/]+$/.test(pathname);");
    expect(shellBoundarySource).toContain("? children : shell");
  });

  function shared(source: "authoritative" | "compatible" = "authoritative") {
    const routes = publicV3RouteTargets("mlbb-rank-war-32");
    const identity = {
      id: "event-32",
      slug: "mlbb-rank-war-32",
      title: "MLBB Rank War 32",
      description: "Community event overview.",
      game: { id: "game-flashpeak", name: "Mobile Legends", modeId: "mode-5v5", modeName: "5v5" },
      organizer: { name: "Miracle Community", verified: true, trust: "verified" as const, contactChannel: "", contactValue: "", contactHref: null },
      statusExplanation: source === "authoritative" ? "Official lifecycle details are available." : "The event is in progress using the latest saved schedule and results.",
      statusExplanationKey: source === "authoritative" ? "ongoing.authoritative" : "ongoing.compatible",
      routes,
      facts: { startsAt: "2026-09-20T02:00:00.000Z", timezone: "Asia/Jakarta", venue: "Jakarta", prize: "Rp1.000.000", participants: 8, participantCap: 16, remainingSlots: 8 },
      cta: { kind: "link" as const, label: "view_live_event", href: routes.overview.hrefByLocale.id, hrefByLocale: routes.overview.hrefByLocale, target: routes.overview, enabled: true },
      navigation: { overview: true, participants: true, schedule: true, bracket: true, leaderboard: true, targets: routes },
      poster: { eventUrl: null, logoUrl: null, gameImageUrl: null },
      format: "Single Elimination",
    };
    return { source, identity, event: identity, organizer: identity.organizer, facts: identity.facts, statusExplanation: identity.statusExplanation, statusExplanationKey: identity.statusExplanationKey, cta: identity.cta, navigation: identity.navigation, teams: [], updates: [] };
  }

  function view(mode: PublicV3EventViewModel["mode"], source: "authoritative" | "compatible" = "authoritative"): PublicV3EventViewModel {
    const base = shared(source);
    if (mode === "registration") return { ...base, mode, registration: { availability: "legacy", opensAt: null, closesAt: null, activeTeamCount: 0, pendingReviewCount: 0, occupiedSlots: 0, remainingSlots: 16, participantCap: 16, feeRequired: false, feeAmount: null, feeLabel: "", minimumRoster: 1, maximumRoster: 5, bracket: { status: "tbd", slots: [] } }, viewer: { state: "anonymous", cta: { kind: "disabled", label: "registration_unavailable", reason: "registration_unavailable", enabled: false } }, matches: [], leaderboard: [] };
    if (mode === "drawing") return { ...base, mode, drawing: { published: false, status: "tbd", seeds: [], slots: [] }, matches: [], standings: [], schedule: null, leaderboard: [] };
    if (mode === "ongoing") return { ...base, mode, matches: [], liveMatches: [], nextMatches: [], recentResults: [], schedule: null, standings: [], stream: null, leaderboard: [], stateVersion: "1", lastUpdatedAt: "2026-09-20T02:00:00.000Z" };
    return { ...base, mode, certificates: { status: "preparing", publishedCount: 0, expectedCount: 7, isCurrent: false, isComplete: false, publicationVersion: null, items: [] }, podium: [], awards: [], matches: [], standings: [], leaderboard: [] };
  }

  it.each(["registration", "drawing", "ongoing", "finished"] as const)("keeps %s in the same V3 frame", (mode) => {
    const html = renderToStaticMarkup(<PublicV3EventPage view={view(mode)} locale="en" />);
    expect(html).toContain('data-public-v3-event="true"');
    expect(html).toContain(`data-lifecycle-overview="${mode}"`);
    expect((html.match(/<header/g) ?? []).length).toBe(1);
    expect((html.match(/<main/g) ?? []).length).toBe(1);
  });

  it("keeps a compatible ongoing event truthful when the V3 graph is absent", () => {
    const html = renderToStaticMarkup(<PublicV3EventPage view={view("ongoing", "compatible")} locale="id" />);
    expect(html).toContain('data-public-source="compatible"');
    expect(html).toContain("The event is in progress using the latest saved schedule and results.");
    expect(html).toContain("Belum ada pertandingan live");
    expect(html).not.toContain("Grand Final");
    expect(html).not.toContain("North Force");
  });

  it("hides an unpublished drawing schedule and only renders published certificate links", () => {
    const drawing = view("drawing");
    const drawingHtml = renderToStaticMarkup(<PublicV3EventPage view={drawing} locale="en" />);
    expect(drawingHtml).not.toContain('data-schedule-publication="published"');
    const finished = view("finished");
    const finishedHtml = renderToStaticMarkup(<PublicV3EventPage view={finished} locale="en" />);
    expect(finishedHtml).toContain('data-certificates="preparing"');
    expect(finishedHtml).not.toContain("https://certificate");
  });
});
