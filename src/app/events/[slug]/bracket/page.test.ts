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

const {
  getEventRoundConfigsMock,
  getMatchGamesForEventMock,
  getMatchesForEventMock,
} = vi.hoisted(() => ({
  getEventRoundConfigsMock: vi.fn(),
  getMatchGamesForEventMock: vi.fn(),
  getMatchesForEventMock: vi.fn(),
}));

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

describe("public bracket page", () => {
  let roundConfigsByEvent: Map<string, EventRoundConfig[]>;
  let matchGamesByEvent: Map<string, Map<string, MatchGame[]>>;
  let matchOverridesByEvent: Map<string, Match[]>;

  beforeEach(resetDemoStore);
  afterEach(resetDemoStore);

  beforeEach(() => {
    roundConfigsByEvent = new Map();
    matchGamesByEvent = new Map();
    matchOverridesByEvent = new Map();

    getEventRoundConfigsMock.mockImplementation(async (eventId: string, store: typeof import("@/lib/platform/demo-store")) => (
      roundConfigsByEvent.get(eventId) ?? []
    ));
    getMatchGamesForEventMock.mockImplementation(async (eventId: string, store: typeof import("@/lib/platform/demo-store")) => (
      matchGamesByEvent.get(eventId) ?? new Map()
    ));
    getMatchesForEventMock.mockImplementation(async (eventId: string, store: typeof import("@/lib/platform/demo-store")) => (
      matchOverridesByEvent.get(eventId) ?? store.getMatchesForEvent(eventId)
    ));
  });

  test("uses the public-visible projection for rendering and full projection for labels", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "./bracket-page-content.tsx"), "utf8");

    expect(source).toContain("getPublicVisibleBracketPreview");
    expect(source).toContain("getBracketPreview(event.id)");
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
});
