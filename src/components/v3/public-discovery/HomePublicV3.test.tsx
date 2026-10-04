// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publicV3RouteTargets, type PublicHomeFeaturedEvent, type PublicV3EventViewModel, type PublicV3Match } from "@/lib/events/public-v3-types";
import type { PublicDiscoveryEvent } from "@/lib/events/public-discovery";
import type { Game } from "@/lib/platform/types";
import { PublicDiscoveryHomeV3 } from "./PublicDiscoveryV3";

(globalThis as typeof globalThis & { React: typeof React }).React = React;
const dependencies = vi.hoisted(() => ({ read: vi.fn(), discovery: vi.fn(), locale: "id", pathname: "/" }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key, getLocale: async () => dependencies.locale }));
vi.mock("@/i18n/navigation", () => ({ Link: (props: React.ComponentProps<"a">) => <a {...props} />, usePathname: () => dependencies.pathname }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: () => true }));
vi.mock("@/lib/events/public-v3-read", () => ({ readPublicV3Event: dependencies.read }));
vi.mock("@/lib/events/public-home-read", () => ({ readPublicHomeFeaturedEvent: dependencies.read }));
vi.mock("@/lib/platform/repository", () => ({ getPublicDiscoveryEvents: dependencies.discovery, getAllGames: () => games, getPublicEvents: vi.fn() }));
import { HomePageContent } from "@/app/home-page-content";
import { PublicHomepageShellBoundary } from "./PublicHomepageShellBoundary";

const games = [{ id: "game-flashpeak", slug: "flashpeak", name: "Flashpeak" }] as Game[];
const targets = publicV3RouteTargets("live");
const match: PublicV3Match = { id: "match-1", roundLabel: "Final", home: "North Force", away: "Borneo Kings", homeScore: 1, awayScore: 0, status: "live", official: true, start: "2026-09-18T11:00:00Z", end: null, room: null, bestOf: 3 };
export function homepageView(): PublicV3EventViewModel {
  const identity = {
    id: "live", slug: "live", title: "Miracle Football League S3", description: "Community competition.",
    game: { id: "game-flashpeak", name: "Flashpeak", modeId: "mode-flashpeak-5v5", modeName: "5v5" },
    organizer: { name: "Miracle", verified: true, trust: "verified" as const, contactChannel: "", contactValue: "", contactHref: null },
    statusExplanation: "The event is in progress with official schedule and results.", statusExplanationKey: "ongoing.authoritative",
    routes: targets, facts: { startsAt: "2026-09-18T11:00:00Z", timezone: "Asia/Jakarta", venue: "Arena", prize: "Rp400.000", participants: 32, participantCap: 32, remainingSlots: 0 },
    cta: { label: "view_live_event", href: "/id/events/live", hrefByLocale: targets.overview.hrefByLocale, target: targets.overview, enabled: true },
    navigation: { overview: true, participants: true, schedule: true, bracket: true, leaderboard: true, targets },
    poster: { eventUrl: "/posters/live.png", logoUrl: null, gameImageUrl: null }, format: "Single Elimination",
  };
  return { source: "authoritative", identity, event: identity, organizer: identity.organizer, facts: identity.facts, statusExplanation: identity.statusExplanation, statusExplanationKey: identity.statusExplanationKey, cta: identity.cta, navigation: identity.navigation, teams: [], updates: [], mode: "ongoing", matches: [match], liveMatches: [match], nextMatches: [], recentResults: [], schedule: null, standings: [], stream: null, leaderboard: [], stateVersion: "1", lastUpdatedAt: "2026-09-18T11:00:00Z" };
}
function entry(slug: string, status: PublicDiscoveryEvent["event"]["status"]): PublicDiscoveryEvent {
  return { event: { id: slug, slug, name: `Miracle ${slug}`, gameId: "game-flashpeak", gameModeId: "mode-flashpeak-5v5", description: "Competition", status, format: "Single Elimination", participantCap: 32, startsAt: "2026-09-18", venue: "Arena", registrationWindow: "", registrationFeeRequired: false }, teamCount: 12, hasLiveMatch: status === "Ongoing", phaseStatus: null, updatedAt: "2026-09-18" };
}
const entries = [entry("done", "Finished"), entry("open", "Published"), entry("live", "Ongoing"), entry("second-live", "Ongoing")];
function render(view: PublicHomeFeaturedEvent | null = homepageView(), locale: "id" | "en" = "id") {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(<PublicDiscoveryHomeV3 locale={locale} entries={entries} games={games} gameFilter="all" loadState="ready" featuredView={view} />);
  return root;
}

describe("final homepage composition", () => {
  beforeEach(() => { vi.clearAllMocks(); dependencies.locale = "id"; dependencies.discovery.mockResolvedValue(entries); dependencies.read.mockResolvedValue(homepageView()); });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
  it("distinguishes a featured reader rejection from a later identity access throw without exposing details", async () => {
    vi.stubEnv("PUBLIC_V3_HOME_DISCOVERY_TRACE", "1");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const rejected = Object.assign(new Error("secret reader detail"), { code: "P2024", meta: { password: "secret" } });
    dependencies.read.mockRejectedValueOnce(rejected);
    const rejectedHtml = renderToStaticMarkup(await HomePageContent({}));
    expect(rejectedHtml).toContain('data-public-home-featured="read_failure"');
    expect(info.mock.calls.map(([line]) => String(line))).toEqual(expect.arrayContaining([
      expect.stringMatching(/failure stage=reader_await class=pool_timeout/),
    ]));

    info.mockClear();
    dependencies.read.mockResolvedValueOnce({ identity: null });
    await HomePageContent({});
    expect(info.mock.calls.map(([line]) => String(line))).toEqual(expect.arrayContaining([
      expect.stringMatching(/failure stage=identity_check class=projection_error/),
    ]));
    expect(info.mock.calls.flat().join(" ")).not.toMatch(/secret reader detail|password|secret/);
  });
  it.each(["id", "en"] as const)("renders the narrow Ongoing hero identically to the full view in %s", (locale) => {
    const full = homepageView();
    if (full.mode !== "ongoing") throw new Error("expected ongoing fixture");
    const narrow: PublicHomeFeaturedEvent = {
      source: full.source, mode: "ongoing", identity: full.identity, organizer: full.organizer, facts: full.facts,
      statusExplanation: full.statusExplanation, statusExplanationKey: full.statusExplanationKey,
      cta: full.cta, navigation: full.navigation, teams: full.teams.map(({ id, name }) => ({ id, name })),
      liveMatches: full.liveMatches, nextMatches: full.nextMatches, recentResults: full.recentResults,
    };
    expect(render(narrow, locale).innerHTML).toBe(render(full, locale).innerHTML);
  });
  it("presents normalized hero, match, Pulse, five routes and lifecycle groups in that order", () => {
    const root = render();
    expect(root.querySelector("h1")?.textContent).toBe("Miracle Football League S3");
    expect(root.querySelectorAll("header")).toHaveLength(1);
    expect(root.querySelectorAll("main")).toHaveLength(1);
    const ordered = ["[data-featured-event]", "[data-phase-highlight]", "[data-event-pulse]", 'nav[aria-label="Navigasi event utama"]', "#other-events", '[data-lifecycle="finished"]'];
    for (let i = 0; i < ordered.length - 1; i++) expect(root.querySelector(ordered[i])!.compareDocumentPosition(root.querySelector(ordered[i + 1])!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(root.querySelector('[data-phase-highlight]')?.textContent).toContain("1 : 0");
    expect(root.querySelector('img[src="/posters/live.png"]')).not.toBeNull();
    for (const suffix of ["", "/participants", "/schedule", "/bracket", "/leaderboards"]) expect(root.querySelector(`nav[aria-label="Navigasi event utama"] a[href="/id/events/live${suffix}"]`)).not.toBeNull();
    expect(root.querySelectorAll("[data-lifecycle]")).toHaveLength(3);
  });
  it("does not publish unofficial scores or invent matches in the phase module", () => {
    const view = homepageView();
    if (view.mode !== "ongoing") throw new Error("fixture");
    view.liveMatches = [{ ...match, official: false, homeScore: 99, awayScore: 88 }];
    expect(render(view).querySelector('[data-phase-highlight]')?.textContent).not.toContain("99");
    view.liveMatches = []; view.matches = [];
    const root = render(view);
    expect(root.querySelector('[data-phase-highlight]')?.textContent).toContain("Belum ada pertandingan");
    expect(root.textContent).not.toContain("North Force");
  });
  it("keeps compatible data in the final V3 presentation with English copy and routes", () => {
    const view = homepageView(); view.source = "compatible"; view.statusExplanationKey = "ongoing.compatible"; view.statusExplanation = "The event is in progress using the latest saved schedule and results.";
    const root = render(view, "en");
    expect(root.querySelector('[data-public-source="compatible"]')).not.toBeNull();
    expect(root.textContent).toContain(view.statusExplanation);
    expect(root.textContent).toContain("Other events");
    expect(root.querySelector('nav[aria-label="Featured event navigation"] a[href="/en/events/live/schedule"]')).not.toBeNull();
    expect(root.querySelector('a[href^="/id"]')).toBeNull();
  });
  it("renders truthful read failure while retaining available discovery events", () => {
    const root = render(null);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain("Data event belum dapat dimuat");
    expect(root.querySelector("[data-featured-event]")).toBeNull();
    expect(root.textContent).toContain("Miracle open");
    expect(root.textContent).not.toContain("Rp400.000");
  });
  it("keeps disabled bracket discovery for league formats and unpublished routes", () => {
    const view = homepageView(); view.navigation.bracket = false; view.navigation.schedule = false;
    const root = render(view);
    const nav = root.querySelector('nav[aria-label="Navigasi event utama"]')!;
    expect(nav.querySelector('a[href$="/bracket"]')).toBeNull();
    expect(nav.querySelector('a[href$="/schedule"]')).toBeNull();
    expect(nav.querySelectorAll('[aria-disabled="true"]')).toHaveLength(2);
    expect(nav.textContent).toContain("Belum diumumkan");
  });
  it("shows finished phase information instead of suggesting a next match after completion", () => {
    const base = homepageView();
    const view: PublicV3EventViewModel = { ...base, mode: "finished", matches: [], certificates: { status: "preparing", publishedCount: 0, expectedCount: 7, isCurrent: false, isComplete: false, publicationVersion: null, items: [] }, podium: [], awards: [], standings: [], leaderboard: [] };
    const root = render(view);
    expect(root.querySelector("[data-event-pulse]")?.textContent).toContain("Hasil akhir belum tersedia");
    expect(root.querySelector("[data-event-pulse]")?.textContent).not.toContain("Jadwal pertandingan berikutnya");
  });
  it.each(["id", "en"] as const)("keeps closed registration disabled in %s", (locale) => {
    const base = homepageView();
    const view: PublicV3EventViewModel = { ...base, mode: "registration", statusExplanationKey: "registration.compatible", cta: { label: "registration_closed", href: null, hrefByLocale: null, enabled: false }, registration: { availability: "closed", opensAt: null, closesAt: null, activeTeamCount: 12, pendingReviewCount: 0, occupiedSlots: 12, remainingSlots: 20, participantCap: 32, feeRequired: false, feeAmount: null, feeLabel: "", minimumRoster: 5, maximumRoster: 7, bracket: { status: "tbd", slots: [] } }, viewer: { state: "anonymous", cta: { kind: "disabled", label: "registration_closed", reason: "registration_closed", enabled: false } }, matches: [], leaderboard: [] };
    const root = render(view, locale);
    expect(root.querySelector("[data-phase-highlight]")?.textContent).toContain("12 / 32");
    expect(root.querySelector('[data-featured-event] [aria-disabled="true"]')?.textContent).toContain(locale === "id" ? "Pendaftaran ditutup" : "Registration closed");
    expect(root.querySelector('[data-featured-event] a[href*="/login"]')).toBeNull();
    expect(root.querySelector("[data-phase-highlight]")?.textContent).not.toContain("North Force");
  });
  it.each([
    ["id", "/id/login?returnTo=%2Fid%2Fevents%2Flive%2Fregister", "Daftarkan tim"],
    ["en", "/en/login?returnTo=%2Fen%2Fevents%2Flive%2Fregister", "Register a team"],
  ] as const)("makes open anonymous registration actionable in %s with event return context", (locale, href, label) => {
    const base = homepageView();
    const cta = { kind: "login" as const, label: "register_team", href: null, hrefByLocale: null, enabled: true };
    const identity = { ...base.identity, cta };
    const view: PublicV3EventViewModel = { ...base, identity, event: identity, mode: "registration", statusExplanationKey: "registration.authoritative", cta, registration: { availability: "open", opensAt: null, closesAt: null, activeTeamCount: 12, pendingReviewCount: 0, occupiedSlots: 12, remainingSlots: 20, participantCap: 32, feeRequired: false, feeAmount: null, feeLabel: "", minimumRoster: 5, maximumRoster: 7, bracket: { status: "tbd", slots: [] } }, viewer: { state: "anonymous", cta: { kind: "login", label: "register_team", enabled: true } }, matches: [], leaderboard: [] };
    const root = render(view, locale);
    const action = root.querySelector(`[data-featured-event] a[href="${href}"]`);
    expect(action).not.toBeNull();
    expect(action?.textContent).toBe(label);
    expect(action?.hasAttribute("aria-disabled")).toBe(false);
    expect(root.querySelector('[data-featured-event] [aria-disabled="true"]')).toBeNull();
  });
  it.each([true, false])("shows drawing publication %s without inventing a match", (published) => {
    const base = homepageView();
    const view: PublicV3EventViewModel = { ...base, mode: "drawing", statusExplanationKey: published ? "drawing.authoritative" : "drawing.compatible", drawing: { published, status: published ? "published" : "tbd", seeds: [], slots: [] }, matches: [], standings: [], schedule: null, leaderboard: [] };
    const root = render(view);
    expect(root.querySelector("[data-phase-highlight]")?.textContent).toContain(published ? "Drawing resmi sudah terbit" : "Drawing resmi belum diterbitkan");
    expect(root.querySelector("[data-phase-highlight]")?.textContent).not.toContain("North Force");
  });
  it.each([["/", true, false], ["/", false, true], ["/events", true, false], ["/events", false, true], ["/events/live", true, true], ["/admin", true, true], ["/organizer", true, true]])("selects the correct landmark owner for %s with flag %s", (pathname, enabled, expectedShell) => {
    dependencies.pathname = pathname;
    const html = renderToStaticMarkup(<PublicHomepageShellBoundary enabled={enabled} shell={<main data-existing-shell>Existing route</main>}><main data-homepage-frame>Homepage</main></PublicHomepageShellBoundary>);
    expect(html.includes("data-existing-shell")).toBe(expectedShell);
    expect((html.match(/<main/g) ?? []).length).toBe(1);
  });
  it.each([["/events/live", true], ["/events/live/participants", false], ["/events/live/schedule", false], ["/events", false]] as const)("lets only the flagged event overview own the frame at %s", (pathname, ownsFrame) => {
    dependencies.pathname = pathname;
    const html = renderToStaticMarkup(<PublicHomepageShellBoundary enabled={false} eventOverviewEnabled shell={<main data-existing-shell>Existing route</main>}><main data-event-frame>Event overview</main></PublicHomepageShellBoundary>);
    expect(html.includes("data-event-frame")).toBe(ownsFrame);
    expect((html.match(/<main/g) ?? []).length).toBe(1);
  });
  it("loads the deterministic discovery winner through the normalized reader", async () => {
    const html = renderToStaticMarkup(await HomePageContent({}));
    expect(dependencies.read).toHaveBeenCalledWith("live");
    expect(html).toContain("Miracle Football League S3");
    expect(html).toContain('data-public-source="authoritative"');
    const root = document.createElement("div"); root.innerHTML = html;
    expect(root.querySelector(".mpv3-home-intro")?.getAttribute("data-public-home-discovery")).toBe("ready");
    expect(root.querySelector(".mpv3-home-intro")?.getAttribute("data-public-home-featured")).toBe("ready");
  });
  it("records safe marker diagnostics for real homepage success and fallback markup", async () => {
    const pressureModulePath = "../../../../scripts/public-v3-pressure.mjs";
    const { measureScenario, PRESSURE_SCENARIOS } = await import(pressureModulePath);
    const scenario = { ...PRESSURE_SCENARIOS.find((item: { path: string }) => item.path === "/id")!, requests: 1, concurrency: 1 };
    const fixtureEntries = [...entries, entry("flashpeak-champions-32", "Finished")];
    const goodHtml = renderToStaticMarkup(<PublicDiscoveryHomeV3 locale="id" entries={fixtureEntries} games={games} gameFilter="all" loadState="ready" featuredView={homepageView()} />);
    const failedHtml = renderToStaticMarkup(<PublicDiscoveryHomeV3 locale="id" entries={fixtureEntries} games={games} gameFilter="all" loadState="error" featuredView={null} diagnostics={{ discovery: "timeout", featured: "none" }} />);
    const measure = (body: string) => measureScenario(scenario, {
      fetchImpl: async () => ({ status: 200, text: async () => body }), baseUrl: "http://127.0.0.1:3102", clock: () => 0,
    });
    expect(await measure(goodHtml)).toMatchObject({ passed: true, failures: 0 });
    expect(await measure(failedHtml)).toMatchObject({
      passed: false, failureKinds: ["content"],
      contentDiagnostics: { missingMarkerCounts: { "featured-event": 1 }, detectedMarkerCounts: { alert: 1 }, sourceCounts: { absent: 1 }, discoveryStateCounts: { timeout: 1 }, featuredStateCounts: { none: 1 } },
    });
    const noFixtureHtml = renderToStaticMarkup(<PublicDiscoveryHomeV3 locale="id" entries={entries} games={games} gameFilter="all" loadState="ready" featuredView={homepageView()} />);
    expect(await measure(noFixtureHtml)).toMatchObject({
      passed: false, contentDiagnostics: { missingMarkerCounts: { "fixture-link": 1 }, detectedMarkerCounts: {}, sourceCounts: { authoritative: 1 } },
    });
    const compatibleView = { ...homepageView(), source: "compatible" as const };
    const compatibleHtml = renderToStaticMarkup(<PublicDiscoveryHomeV3 locale="id" entries={fixtureEntries} games={games} gameFilter="all" loadState="ready" featuredView={compatibleView} />);
    expect(await measure(compatibleHtml)).toMatchObject({
      passed: false, contentDiagnostics: { missingMarkerCounts: {}, detectedMarkerCounts: { "compatible-source": 1 }, sourceCounts: { compatible: 1 } },
    });
    const englishScenario = { ...PRESSURE_SCENARIOS.find((item: { path: string }) => item.path === "/en")!, requests: 1, concurrency: 1 };
    const englishHtml = renderToStaticMarkup(<PublicDiscoveryHomeV3 locale="en" entries={fixtureEntries} games={games} gameFilter="all" loadState="ready" featuredView={homepageView()} />);
    expect(await measureScenario(englishScenario, {
      fetchImpl: async () => ({ status: 200, text: async () => englishHtml }), baseUrl: "http://127.0.0.1:3102", clock: () => 0,
    })).toMatchObject({ passed: true, failures: 0 });
  });
  it.each(["reject", "missing"])("logs %s featured reads and renders honest failure without demo substitution", async (failure) => {
    if (failure === "reject") dependencies.read.mockRejectedValue(new Error("database unavailable"));
    else dependencies.read.mockResolvedValue(null);
    const logger = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const html = renderToStaticMarkup(await HomePageContent({}));
      const root = document.createElement("div"); root.innerHTML = html;
      expect(root.querySelector('[role="alert"]')).not.toBeNull();
      expect(root.querySelector(".mpv3-home-intro")?.getAttribute("data-public-home-featured")).toBe(failure === "reject" ? "read_failure" : "unavailable");
      expect(html).not.toContain("Miracle Football League S3");
      expect(logger).toHaveBeenCalledWith("Homepage featured event unavailable", { code: failure === "reject" ? "read_failure" : "unavailable" });
    } finally { logger.mockRestore(); }
  });
  it("marks a failed discovery read without attempting the featured read", async () => {
    dependencies.discovery.mockRejectedValue(new Error("private database detail"));
    const logger = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const html = renderToStaticMarkup(await HomePageContent({}));
      const root = document.createElement("div"); root.innerHTML = html;
      expect(root.querySelector(".mpv3-home-intro")?.getAttribute("data-public-home-discovery")).toBe("read_failure");
      expect(root.querySelector(".mpv3-home-intro")?.getAttribute("data-public-home-featured")).toBe("none");
      expect(root.querySelector('[role="alert"]')).not.toBeNull();
      expect(dependencies.read).not.toHaveBeenCalled();
      expect(logger).toHaveBeenCalledWith("Public discovery events unavailable", { code: "read_failure" });
    } finally { logger.mockRestore(); }
  });
});
