import fs from "node:fs";
import path from "node:path";

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, test, vi } from "vitest";

import {
  createEvent,
  getPublicVisibleBracketPreview,
  importTeams,
  resetDemoStore,
  setEventStatus,
} from "@/lib/platform/demo-store";
import type { EventRoundConfig, Match, MatchGame } from "@/lib/platform/types";
import BracketPage from "./page";
import { bracketDesignFixture } from "@/app/[locale]/bracket-design-preview/fixture";

const {
  getEventRoundConfigsMock,
  getMatchGamesForEventMock,
  getMatchesForEventMock,
  featureEnabledMock,
  drawingEventMock,
  socialReaderMock,
} = vi.hoisted(() => ({
  getEventRoundConfigsMock: vi.fn(),
  getMatchGamesForEventMock: vi.fn(),
  getMatchesForEventMock: vi.fn(),
  featureEnabledMock: vi.fn(),
  drawingEventMock: vi.fn(),
  socialReaderMock: vi.fn(),
}));

vi.mock("@/lib/bracket/read", () => ({ readPublicSocialBracket: socialReaderMock }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: featureEnabledMock }));
vi.mock("@/lib/events/adaptive-public-phases", () => ({
  getPublicCompetitionPhaseVisibility: vi.fn().mockResolvedValue("none"),
  getPublicDrawingEvent: drawingEventMock,
  getPublicFinishedEvent: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/events/public-ongoing", () => ({ getPublicOngoingEvent: vi.fn().mockResolvedValue(null) }));

vi.mock("next-intl/server", async () => {
  const en = (await import("../../../../../messages/en.json")) as unknown as Record<string, Record<string, string>>;
  return {
    getTranslations: vi.fn().mockImplementation(async (namespace: string) => {
      const ns = en[namespace] ?? {};
      return (key: string, values?: Record<string, string | number>) => {
        let str = ns[key] ?? key;
        if (values) {
          for (const [k, v] of Object.entries(values)) {
            str = str.replace(new RegExp(`\\{${k}\\b[^}]*\\}`, "g"), String(v));
          }
        }
        return str;
      };
    }),
  };
});

vi.mock("@/lib/platform/repository", async () => {
  const store = await import("@/lib/platform/demo-store");
  return {
    getPublicEventBySlug: (slug: string) => Promise.resolve(store.getPublicEventBySlug(slug)),
    getTeamsForEvent: (eventId: string) => Promise.resolve(store.getTeamsForEvent(eventId)),
    getPublicVisibleBracketPreview: (eventId: string) => Promise.resolve(store.getPublicVisibleBracketPreview(eventId)),
    getMatchesForEvent: (eventId: string) => getMatchesForEventMock(eventId, store),
    getBracketPreview: (eventId: string) => Promise.resolve(store.getBracketPreview(eventId)),
    getEventRoundConfigs: (eventId: string) => getEventRoundConfigsMock(eventId, store),
    getMatchGamesForEvent: (eventId: string) => getMatchGamesForEventMock(eventId, store),
  };
});

Object.assign(globalThis, { React });

async function renderBracket(slug: string) {
  const page = await BracketPage({ params: Promise.resolve({ slug }) });
  return renderToStaticMarkup(page);
}

function publishedDrawingView(event: ReturnType<typeof createEvent>) {
  return {
    mode: "drawing" as const,
    event: {
      id: event.id,
      slug: event.slug,
      name: event.name,
      description: event.description,
      timezone: "Asia/Jakarta",
      format: "single_elimination",
    },
    organizer: { name: "Miracle Organizer", verified: true },
    facts: { startsAt: "TBD", venue: "Online", prize: null, participants: 2, participantCap: event.participantCap },
    statusExplanation: "Drawing resmi telah diterbitkan organizer.",
    cta: { label: "Lihat bracket", href: `/events/${event.slug}/bracket` },
    navigation: { overview: true, participants: true, schedule: true, bracket: true, leaderboard: true },
    drawing: { published: true as const, seeds: [{ teamId: "team-alpha", teamName: "Alpha", seed: 1 }] },
    matches: [
      { id: "drawn-final", roundLabel: "Final", home: "Alpha", away: null, status: "scheduled" as const, homeScore: null, awayScore: null, start: null, room: null, bestOf: 3 },
      { id: "drawn-semifinal", roundLabel: "Semifinal", home: "Alpha", away: "Beta", status: "completed" as const, homeScore: 2, awayScore: 1, start: null, room: null, bestOf: 3 },
    ],
    schedule: null,
    standings: [],
  };
}

describe("public bracket page", () => {
  let roundConfigsByEvent: Map<string, EventRoundConfig[]>;
  let matchGamesByEvent: Map<string, Map<string, MatchGame[]>>;
  let matchOverridesByEvent: Map<string, Match[]>;

  beforeEach(resetDemoStore);
  afterEach(resetDemoStore);

  beforeEach(() => {
    featureEnabledMock.mockReturnValue(false);
    socialReaderMock.mockResolvedValue(null);
    drawingEventMock.mockResolvedValue(null);
    roundConfigsByEvent = new Map();
    matchGamesByEvent = new Map();
    matchOverridesByEvent = new Map();

    getEventRoundConfigsMock.mockImplementation(async (eventId: string) => (
      roundConfigsByEvent.get(eventId) ?? []
    ));
    getMatchGamesForEventMock.mockImplementation(async (eventId: string) => (
      matchGamesByEvent.get(eventId) ?? new Map()
    ));
    getMatchesForEventMock.mockImplementation(async (eventId: string, store: typeof import("@/lib/platform/demo-store")) => (
      matchOverridesByEvent.get(eventId) ?? store.getMatchesForEvent(eventId)
    ));
  });

  function configureSeriesFallback(event: ReturnType<typeof createEvent>) {
    const visibleMatches = getPublicVisibleBracketPreview(event.id) as Array<{
      id: string;
      round: number;
      slot: number;
      roundLabel: string;
      homeTeamId: string;
      awayTeamId: string;
    }>;
    const firstMatch = visibleMatches.find((match) => match.homeTeamId && match.awayTeamId);
    if (!firstMatch) throw new Error("Expected a drawn match for the series fixture");

    roundConfigsByEvent.set(event.id, [{ id: "cfg-bo3-v3", eventId: event.id, roundLabel: firstMatch.roundLabel, bestOf: 3 }]);
    matchOverridesByEvent.set(event.id, [{
      id: firstMatch.id,
      eventId: event.id,
      roundLabel: firstMatch.roundLabel,
      homeTeamId: firstMatch.homeTeamId,
      awayTeamId: firstMatch.awayTeamId,
      homeScore: 2,
      awayScore: 1,
      status: "Completed" as const,
      winnerTeamId: firstMatch.homeTeamId,
      round: firstMatch.round,
      slot: firstMatch.slot,
    }]);
    matchGamesByEvent.set(event.id, new Map([[
      firstMatch.id,
      [
        { id: "v3-g1", matchId: firstMatch.id, gameNumber: 1, homeScore: 21, awayScore: 15 },
        { id: "v3-g2", matchId: firstMatch.id, gameNumber: 2, homeScore: 10, awayScore: 21 },
        { id: "v3-g3", matchId: firstMatch.id, gameNumber: 3, homeScore: 21, awayScore: 18 },
      ],
    ]]));
  }

  test("uses the public-visible projection for rendering and full projection for labels", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "./bracket-page-content.tsx"), "utf8");

    expect(source).toContain("getPublicVisibleBracketPreview");
    expect(source).toContain("getBracketPreview(event.id)");
  });

  it("keeps every registration bracket slot TBD when no drawing has been published", async () => {
    const event = createEvent({
      name: "Private registration order",
      slug: "private-registration-order",
      gameModeId: "mode-flashpeak-5v5",
      format: "Single Elimination",
      participantCap: 8,
    });
    setEventStatus(event.id, "Published");
    importTeams([
      { eventId: event.id, teamName: "First Registrant", teamTag: "FIRST", captainName: "One", captainContact: "one@example.test" },
      { eventId: event.id, teamName: "Second Registrant", teamTag: "SECOND", captainName: "Two", captainContact: "two@example.test" },
    ]);
    featureEnabledMock.mockReturnValue(true);

    const markup = await renderBracket(event.slug);

    expect(markup).toContain("TBD");
    expect(markup).not.toContain("First Registrant");
    expect(markup).not.toContain("Second Registrant");
  });

  test("uses only published adaptive phase readers when the adaptive experience is enabled", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "./bracket-page-content.tsx"), "utf8");
    expect(source).toContain("getPublicDrawingEvent");
    expect(source).toContain("getPublicOngoingEvent");
    expect(source).toContain("getPublicFinishedEvent");
    expect(source).toContain("AdaptiveBracketBoard");
  });

  it("uses the dark V3 composition for the adaptive bracket when the visual foundation is enabled", async () => {
    const event = createEvent({
      name: "V3 adaptive bracket",
      slug: "v3-adaptive-bracket",
      gameModeId: "mode-flashpeak-5v5",
      format: "Single Elimination",
      participantCap: 8,
    });
    setEventStatus(event.id, "Published");
    featureEnabledMock.mockImplementation((flag: string) => flag === "adaptive_public_event_v3" || flag === "ui_v3_foundation");
    drawingEventMock.mockResolvedValue(null);

    const markup = await renderBracket(event.slug);

    expect(markup).toContain('class="miracle-public-v3 mpv3-bracket-page"');
    expect(markup).toContain("mpv3-action--text");
    expect(markup).toContain("overflow-x-auto");
    expect(markup).not.toContain("pv-section-card");
    expect(markup).not.toContain("bg-white");
  });

  it("keeps registration order private: no social bracket and no team names before the drawing is published", async () => {
    const event = createEvent({
      name: "Private registration order",
      slug: "private-registration-order",
      gameModeId: "mode-flashpeak-5v5",
      format: "Single Elimination",
      participantCap: 8,
    });
    setEventStatus(event.id, "Published");
    featureEnabledMock.mockImplementation((flag: string) => flag === "adaptive_public_event_v3" || flag === "ui_v3_foundation");
    drawingEventMock.mockResolvedValue(null);
    // The legacy reader would expose every pairing the engine can already resolve. It must not reach the page.
    const model = bracketDesignFixture("en");
    socialReaderMock.mockResolvedValue({ ...model, event: { ...model.event, id: event.id, slug: event.slug }, preview: false });
    const teamNames = model.matches.flatMap((match) => [match.home.team?.name, match.away.team?.name]).filter((name): name is string => Boolean(name));
    expect(teamNames.length).toBeGreaterThan(0);

    const markup = await renderBracket(event.slug);

    expect(markup).not.toContain("social-bracket");
    for (const name of teamNames) expect(markup, `${name} must stay private before the drawing is published`).not.toContain(name);
    expect(markup).toContain("TBD");
  });

  it("shows the social bracket once the drawing is published", async () => {
    const event = createEvent({
      name: "Published social bracket",
      slug: "published-social-bracket",
      gameModeId: "mode-flashpeak-5v5",
      format: "Single Elimination",
      participantCap: 8,
    });
    setEventStatus(event.id, "Published");
    featureEnabledMock.mockImplementation((flag: string) => flag === "adaptive_public_event_v3" || flag === "ui_v3_foundation");
    drawingEventMock.mockResolvedValue(publishedDrawingView(event));
    const model = bracketDesignFixture("en");
    socialReaderMock.mockResolvedValue({ ...model, event: { ...model.event, id: event.id, slug: event.slug }, preview: false });

    const markup = await renderBracket(event.slug);

    expect(markup).toContain("social-bracket");
  });

  it("offers a PNG beside adaptive V3 league standings without replacing them", async () => {
    const event = createEvent({ name: "Adaptive league", slug: "adaptive-league", gameModeId: "mode-flashpeak-5v5", format: "League", participantCap: 8 });
    setEventStatus(event.id, "Published");
    featureEnabledMock.mockImplementation((flag: string) => flag === "adaptive_public_event_v3" || flag === "ui_v3_foundation");
    const model = bracketDesignFixture("en");
    socialReaderMock.mockResolvedValue({ ...model, event: { ...model.event, id: event.id, slug: event.slug, format: "League" }, preview: false });
    const markup = await renderBracket(event.slug);
    expect(markup).toContain("mpv3-bracket-page");
    expect(markup).toContain("Download full PNG");
    expect(markup).toContain("Select round for PNG");
    expect(markup).toContain("mpv3-panel");
    expect(markup).not.toContain("social-bracket");
  });

  it("preserves the adaptive legacy composition when only the adaptive flag is enabled", async () => {
    const event = createEvent({
      name: "Adaptive legacy bracket",
      slug: "adaptive-legacy-bracket",
      gameModeId: "mode-flashpeak-5v5",
      format: "Single Elimination",
      participantCap: 8,
    });
    setEventStatus(event.id, "Published");
    featureEnabledMock.mockImplementation((flag: string) => flag === "adaptive_public_event_v3");
    drawingEventMock.mockResolvedValue(null);

    const markup = await renderBracket(event.slug);

    expect(markup).toContain("pv-section-card");
    expect(markup).toContain("bg-white");
    expect(markup).not.toContain("miracle-public-v3");
  });

  it("renders a published adaptive drawing in the dark V3 composition", async () => {
    const event = createEvent({
      name: "Drawn adaptive V3 bracket",
      slug: "drawn-adaptive-v3-bracket",
      gameModeId: "mode-flashpeak-5v5",
      format: "Single Elimination",
      participantCap: 8,
    });
    setEventStatus(event.id, "Published");
    featureEnabledMock.mockImplementation((flag: string) => flag === "adaptive_public_event_v3" || flag === "ui_v3_foundation");
    drawingEventMock.mockResolvedValue(publishedDrawingView(event));

    const markup = await renderBracket(event.slug);

    expect(markup).toContain('class="miracle-public-v3 mpv3-bracket-page"');
    expect(markup).toContain("mpv3-panel");
    expect(markup).toContain("mpv3-bracket-scroll");
    expect(markup).toContain("overflow-x-auto");
    expect(markup).toContain("TBD");
    expect(markup).toContain("2 – 1");
    expect(markup).not.toContain("pv-section-card");
    expect(markup).not.toContain("bg-white");
  });

  it("preserves the published adaptive drawing legacy composition when V3 is disabled", async () => {
    const event = createEvent({
      name: "Drawn adaptive legacy bracket",
      slug: "drawn-adaptive-legacy-bracket",
      gameModeId: "mode-flashpeak-5v5",
      format: "Single Elimination",
      participantCap: 8,
    });
    setEventStatus(event.id, "Published");
    featureEnabledMock.mockImplementation((flag: string) => flag === "adaptive_public_event_v3");
    drawingEventMock.mockResolvedValue(publishedDrawingView(event));

    const markup = await renderBracket(event.slug);

    expect(markup).toContain("pv-section-card");
    expect(markup).toContain("bg-white");
    expect(markup).toContain("Menunggu hasil");
    expect(markup).not.toContain("miracle-public-v3");
  });

  it("renders the non-adaptive single-elimination fallback with V3 series, bye, and bounded-board semantics", async () => {
    const event = createEvent({
      name: "V3 fallback series bracket",
      slug: "v3-fallback-series-bracket",
      gameModeId: "mode-kuroko-3v3",
      format: "Single Elimination",
      participantCap: 8,
    });
    setEventStatus(event.id, "Ongoing");
    importTeams(Array.from({ length: 6 }, (_, index) => ({
      eventId: event.id,
      teamName: `V3 Team ${index + 1}`,
      teamTag: `V${index + 1}`,
      captainName: `V3 Captain ${index + 1}`,
      captainContact: `v3-captain-${index + 1}@example.test`,
    })));
    featureEnabledMock.mockImplementation((flag: string) => flag === "ui_v3_foundation");
    configureSeriesFallback(event);

    const markup = await renderBracket(event.slug);

    expect(markup).toContain('class="miracle-public-v3 mpv3-bracket-page"');
    expect(markup).toContain("mpv3-bracket-scroll");
    expect(markup).toContain("mpv3-bracket-match");
    expect(markup).toContain("2 - 1 (BO3)");
    expect(markup).toContain("G1");
    expect(markup).toContain("Series");
    expect(markup).toContain("Auto-advance");
    expect(markup).toContain("TBD");
    expect(markup).not.toContain("pv-section-card");
    expect(markup).not.toContain("bg-white");
  });

  it("preserves the non-adaptive single-elimination fallback legacy composition", async () => {
    const event = createEvent({
      name: "Legacy fallback series bracket",
      slug: "legacy-fallback-series-bracket",
      gameModeId: "mode-kuroko-3v3",
      format: "Single Elimination",
      participantCap: 8,
    });
    setEventStatus(event.id, "Ongoing");
    importTeams(Array.from({ length: 6 }, (_, index) => ({
      eventId: event.id,
      teamName: `Legacy Team ${index + 1}`,
      teamTag: `L${index + 1}`,
      captainName: `Legacy Captain ${index + 1}`,
      captainContact: `legacy-captain-${index + 1}@example.test`,
    })));
    featureEnabledMock.mockReturnValue(false);
    socialReaderMock.mockResolvedValue(null);
    configureSeriesFallback(event);

    const markup = await renderBracket(event.slug);

    expect(markup).toContain("pv-section-card");
    expect(markup).toContain("bg-white");
    expect(markup).toContain("pv-match-card");
    expect(markup).toContain("2 - 1 (BO3)");
    expect(markup).toContain("Auto-advance");
    expect(markup).toContain("TBD");
    expect(markup).not.toContain("miracle-public-v3");
  });

  it("uses the dark V3 table composition for the legacy league fallback", async () => {
    const event = createEvent({
      name: "V3 league fallback",
      slug: "v3-league-fallback",
      gameModeId: "mode-flashpeak-5v5",
      format: "League",
      participantCap: 8,
    });
    setEventStatus(event.id, "Published");
    featureEnabledMock.mockImplementation((flag: string) => flag === "ui_v3_foundation");
    const model = bracketDesignFixture("en");
    socialReaderMock.mockResolvedValue({ ...model, event: { ...model.event, id: event.id, slug: event.slug, format: "League" }, preview: false });

    const markup = await renderBracket(event.slug);

    expect(markup).toContain('class="miracle-public-v3 mpv3-bracket-page"');
    expect(markup).toContain("mpv3-table-wrap");
    expect(markup).toContain("Download full PNG");
    expect(markup).toContain("Select round for PNG");
    expect(markup).not.toContain("pv-section-card");
    expect(markup).not.toContain("bg-white");
  });

  it("preserves the legacy fallback composition when the visual foundation is disabled", async () => {
    const event = createEvent({
      name: "Legacy bracket fallback",
      slug: "legacy-bracket-fallback",
      gameModeId: "mode-flashpeak-5v5",
      format: "League",
      participantCap: 8,
    });
    setEventStatus(event.id, "Published");
    featureEnabledMock.mockReturnValue(false);
    socialReaderMock.mockResolvedValue(null);

    const markup = await renderBracket(event.slug);

    expect(markup).toContain("pv-section-card");
    expect(markup).toContain("pv-data-table");
    expect(markup).not.toContain("miracle-public-v3");
  });

  test("bracket routes stay dynamic so production builds do not query the database", () => {
    const publicRouteSource = fs.readFileSync(path.resolve(__dirname, "./page.tsx"), "utf8");
    const localizedRouteSource = fs.readFileSync(
      path.resolve(__dirname, "../../../[locale]/events/[slug]/bracket/page.tsx"),
      "utf8",
    );

    expect(publicRouteSource).toContain('export const dynamic = "force-dynamic"');
    expect(publicRouteSource).not.toContain("generateStaticParams");
    expect(localizedRouteSource).toContain('export const dynamic = "force-dynamic"');
    expect(localizedRouteSource).not.toContain("generateStaticParams");
  });

  test("keeps bracket team labels readable with long team names", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "./bracket-page-content.tsx"), "utf8");

    expect(source).toContain("pv-match-card__team-row flex items-center justify-between gap-3");
    expect(source).toContain("pv-match-card__team-slot min-w-0");
    expect(source).toContain("pv-match-card__side mono shrink-0 whitespace-nowrap");
  });
  it("hides unresolved downstream rounds for a single-elimination bracket with byes", async () => {
    const event = createEvent({
      name: "Bye path visibility test",
      slug: "bye-path-visibility-test",
      gameModeId: "mode-kuroko-3v3",
      format: "Single Elimination",
      participantCap: 8,
    });
    setEventStatus(event.id, "Published");
    importTeams(
      Array.from({ length: 6 }, (_, index) => ({
        eventId: event.id,
        teamName: `Team ${index + 1}`,
        teamTag: `T${index + 1}`,
        captainName: `Captain ${index + 1}`,
        captainContact: `captain-${index + 1}@example.test`,
      })),
    );

    const markup = await renderBracket(event.slug);

    expect(markup).toContain("Auto-advance");
    expect(markup).not.toContain("Semifinal");
  });

  it("does not label the visible 24-team opening round as the final", async () => {
    const event = createEvent({
      name: "Flashpeak 24",
      slug: "flashpeak-24-round-label-test",
      gameModeId: "mode-flashpeak-5v5",
      format: "Single Elimination",
      participantCap: 24,
    });
    setEventStatus(event.id, "Published");
    importTeams(
      Array.from({ length: 24 }, (_, index) => ({
        eventId: event.id,
        teamName: `Team ${index + 1}`,
        teamTag: `X${String(index + 1).padStart(2, "0")}`,
        captainName: `Captain ${index + 1}`,
        captainContact: `captain-${index + 1}@example.test`,
      })),
    );

    const markup = await renderBracket(event.slug);

    expect(markup).not.toContain(">Final<");
    expect(markup).not.toContain("Semifinal");
    expect(markup).toContain("Play-in Round");
    expect(markup).not.toContain("Round of 16");
  });

  it("labels the visible 12-team opening round as a play-in round", async () => {
    const event = createEvent({
      name: "Kuroko 12",
      slug: "kuroko-12-round-label-test",
      gameModeId: "mode-kuroko-3v3",
      format: "Single Elimination",
      participantCap: 12,
    });
    setEventStatus(event.id, "Published");
    importTeams(
      Array.from({ length: 12 }, (_, index) => ({
        eventId: event.id,
        teamName: `Team ${index + 1}`,
        teamTag: `K${String(index + 1).padStart(2, "0")}`,
        captainName: `Captain ${index + 1}`,
        captainContact: `captain-${index + 1}@example.test`,
      })),
    );

    const markup = await renderBracket(event.slug);

    expect(markup).toContain("Play-in Round");
    expect(markup).not.toContain("Quarterfinal");
  });

  it("does not show a completed score on a projected matchup with different teams", async () => {
    const markup = await renderBracket("kuroko-summer-cup");

    expect(markup).not.toContain("21 - 16");
    expect(markup).not.toContain("18 - 20");
  });

  it("shows completed league fixture scores from recorded matches", async () => {
    const markup = await renderBracket("flashpeak-open-league");

    expect(markup).toContain("4 - 2");
    expect(markup).toContain("1 - 1");
  });
  it("renders completed scores with a high-contrast chip", async () => {
    const markup = await renderBracket("flashpeak-open-league");
    expect(markup).toMatch(/class="[^"]*bg-slate-950[^"]*text-white[^"]*"[^>]*>4 - 2<\/span>/);
  });

  it("renders completed scores with a high-contrast chip", async () => {
    const markup = await renderBracket("flashpeak-open-league");
    expect(markup).toMatch(/class="[^"]*bg-slate-950[^"]*text-white[^"]*"[^>]*>4 - 2<\/span>/);
  });

  it("shows per-game BO3 detail for a completed public bracket match", async () => {
    const event = createEvent({
      name: "Bracket BO3",
      slug: "bracket-bo3-test",
      gameModeId: "mode-kuroko-3v3",
      format: "Single Elimination",
      participantCap: 8,
    });
    setEventStatus(event.id, "Ongoing");
    importTeams(
      Array.from({ length: 8 }, (_, index) => ({
        eventId: event.id,
        teamName: `Team ${index + 1}`,
        teamTag: `B${index + 1}`,
        captainName: `Captain ${index + 1}`,
        captainContact: `captain-${index + 1}@example.test`,
      })),
    );

    const [firstMatch] = getPublicVisibleBracketPreview(event.id) as Array<{
      id: string;
      round: number;
      slot: number;
      homeTeamId: string;
      awayTeamId: string;
    }>;

    roundConfigsByEvent.set(event.id, [
      { id: "cfg-bo3", eventId: event.id, roundLabel: "Final", bestOf: 3 },
    ]);
    matchOverridesByEvent.set(event.id, [
      {
        id: firstMatch.id,
        eventId: event.id,
        roundLabel: "Final",
        homeTeamId: firstMatch.homeTeamId,
        awayTeamId: firstMatch.awayTeamId,
        homeScore: 2,
        awayScore: 1,
        status: "Completed",
        round: firstMatch.round,
        slot: firstMatch.slot,
        winnerTeamId: firstMatch.homeTeamId,
      },
    ]);
    matchGamesByEvent.set(event.id, new Map([
      [firstMatch.id, [
        { id: "g1", matchId: firstMatch.id, gameNumber: 1, homeScore: 21, awayScore: 15 },
        { id: "g2", matchId: firstMatch.id, gameNumber: 2, homeScore: 10, awayScore: 21 },
        { id: "g3", matchId: firstMatch.id, gameNumber: 3, homeScore: 21, awayScore: 18 },
      ]],
    ]));

    const markup = await renderBracket(event.slug);

    expect(markup).toContain("2 - 1 (BO3)");
    expect(markup).toContain("G1");
    expect(markup).toContain("G2");
    expect(markup).toContain("G3");
    expect(markup).toContain("Series");
    expect(markup).toContain("pv-match-card__game-score");
    expect(markup).toContain("pv-match-card__game-score--winner");
    expect(markup).toContain("pv-match-card__game-winner");
  });

  it("shows partial BO5 detail before the series winner is decided", async () => {
    const event = createEvent({
      name: "Bracket BO5",
      slug: "bracket-bo5-test",
      gameModeId: "mode-flashpeak-5v5",
      format: "Single Elimination",
      participantCap: 8,
    });
    setEventStatus(event.id, "Ongoing");
    importTeams(
      Array.from({ length: 8 }, (_, index) => ({
        eventId: event.id,
        teamName: `Squad ${index + 1}`,
        teamTag: `P${index + 1}`,
        captainName: `Captain ${index + 1}`,
        captainContact: `captain-${index + 1}@example.test`,
      })),
    );

    const [firstMatch] = getPublicVisibleBracketPreview(event.id) as Array<{
      id: string;
      round: number;
      slot: number;
      homeTeamId: string;
      awayTeamId: string;
    }>;

    roundConfigsByEvent.set(event.id, [
      { id: "cfg-bo5", eventId: event.id, roundLabel: "Final", bestOf: 5 },
    ]);
    matchOverridesByEvent.set(event.id, [
      {
        id: firstMatch.id,
        eventId: event.id,
        roundLabel: "Final",
        homeTeamId: firstMatch.homeTeamId,
        awayTeamId: firstMatch.awayTeamId,
        homeScore: 1,
        awayScore: 1,
        status: "Scheduled",
        round: firstMatch.round,
        slot: firstMatch.slot,
        winnerTeamId: null,
      },
    ]);
    matchGamesByEvent.set(event.id, new Map([
      [firstMatch.id, [
        { id: "g1", matchId: firstMatch.id, gameNumber: 1, homeScore: 3, awayScore: 1 },
        { id: "g2", matchId: firstMatch.id, gameNumber: 2, homeScore: 0, awayScore: 2 },
      ]],
    ]));

    const markup = await renderBracket(event.slug);

    expect(markup).toContain("1 - 1 (BO5)");
    expect(markup).toContain("G1");
    expect(markup).toContain("G2");
  });

  it("renders seeded finished organizer bracket results", async () => {
    const flashpeakMarkup = await renderBracket("flashpeak-champions-32");
    const mlbbMarkup = await renderBracket("mlbb-dawn-finals-16");

    expect(flashpeakMarkup).toContain("Summit Strikers");
    expect(flashpeakMarkup).toContain("3 - 2");
    expect(flashpeakMarkup).toContain("Final");
    expect(mlbbMarkup).toContain("Dawn Breakers");
    expect(mlbbMarkup).toContain("3 - 2");
    expect(mlbbMarkup).toContain("Final");
  });

  it("uses the shared social board for a V3 elimination event", async () => {
    const event = createEvent({ name: "Social final", slug: "social-final", gameModeId: "mode-flashpeak-5v5", format: "Single Elimination", participantCap: 8 });
    setEventStatus(event.id, "Published");
    featureEnabledMock.mockImplementation((key: string) => key === "ui_v3_foundation");
    socialReaderMock.mockResolvedValue({
      event: { id: event.id, slug: event.slug, name: event.name, logoUrl: null, format: event.format, status: event.status },
      locale: "id", appearance: { backgroundUrl: null, positionX: 50, positionY: 50, overlay: 35 },
      matches: [{ id: "final", roundKey: "single:1", roundLabel: "Final", round: 1, slot: 1, bracket: "single",
        home: { team: { id: "alpha", name: "Alpha", logoUrl: null, initials: "A" }, label: "Alpha", sourceMatchId: null, outcome: null },
        away: { team: null, label: "Menunggu tim", sourceMatchId: null, outcome: null },
        homeScore: null, awayScore: null, winnerTeamId: null, status: "scheduled", bestOf: 3, schedule: null, games: [] }],
      champion: null, preview: false,
    });
    const markup = await renderBracket(event.slug);
    expect(markup).toContain("social-bracket");
    expect(markup).toContain("Unduh PNG lengkap");
    expect(markup).toContain("Alpha");
  });
});
