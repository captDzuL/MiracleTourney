// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Event, Match, Team } from "@/lib/platform/types";

// The Next.js tsconfig keeps `jsx: "preserve"`, so Vitest compiles JSX with the classic
// runtime. Components under test follow the Next convention of not importing React, so we
// expose it globally for the duration of this suite.
(globalThis as typeof globalThis & { React?: typeof React }).React = React;

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    priority,
    sizes,
  }: {
    src: string;
    alt: string;
    priority?: boolean;
    sizes?: string;
    fill?: boolean;
    className?: string;
    style?: React.CSSProperties;
  }) =>
    React.createElement("img", {
      src,
      alt,
      "data-priority": priority ? "true" : "false",
      "data-sizes": sizes,
    }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href, ...rest }, children),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href, ...rest }, children),
}));

import { PublicHomeV2 } from "@/components/public-v2/PublicHomeV2";
import { games } from "@/lib/platform/config";

function makeEvent(overrides: Partial<Event> & Pick<Event, "id" | "slug" | "name">): Event {
  return {
    description: "Demo event for the public visual system.",
    gameId: "game-flashpeak",
    gameModeId: "mode-flashpeak-5v5",
    format: "Single Elimination",
    status: "Ongoing",
    participantCap: 16,
    registrationWindow: "Open",
    startsAt: "2026-08-21",
    venue: "Online",
    gameImageUrl: "https://cdn.example.test/art.jpg",
    ...overrides,
  };
}

const featuredEvent = makeEvent({ id: "evt-1", slug: "dawn-finals", name: "Dawn Finals" });
const railEventA = makeEvent({
  id: "evt-2",
  slug: "street-clash",
  name: "Street Clash",
  status: "Published",
  gameId: "game-kuroko",
  gameModeId: "mode-kuroko-3v3",
});
const railEventB = makeEvent({
  id: "evt-3",
  slug: "summer-cup",
  name: "Summer Cup",
  status: "Finished",
});

const featuredTeams: Team[] = [
  { id: "team-a", eventId: "evt-1", captainId: "c1", name: "Alter Ego", logoText: "AE", tag: "ALT" },
  { id: "team-b", eventId: "evt-1", captainId: "c2", name: "Bigetron", logoText: "BT", tag: "BTR" },
  { id: "team-c", eventId: "evt-1", captainId: "c3", name: "Evos", logoText: "EV", tag: "EVS" },
  { id: "team-d", eventId: "evt-1", captainId: "c4", name: "Geek Fam", logoText: "GF", tag: "GEK" },
];

function makeMatch(id: string, home: string, away: string, overrides: Partial<Match> = {}): Match {
  return {
    id,
    eventId: "evt-1",
    roundLabel: "Round 1",
    homeTeamId: home,
    awayTeamId: away,
    homeScore: 0,
    awayScore: 0,
    status: "Scheduled",
    ...overrides,
  };
}

const featuredBracket: Match[] = [
  makeMatch("m1", "team-a", "team-b", { status: "Completed", homeScore: 1, awayScore: 0, slot: 1, round: 1 }),
  makeMatch("m2", "team-c", "team-d", { slot: 2, round: 1 }),
  makeMatch("m3", "team-a", "team-c", { slot: 3, round: 1 }),
  makeMatch("m4", "team-b", "team-d", { slot: 4, round: 1 }),
];

const homeLabels = {
  ongoing: "BERLANGSUNG",
  upNext: "SEGERA",
  exploreEvent: "Jelajahi Event",
  allEvents: "Semua Event",
  allGames: "Semua Game",
  teams: "tim",
  eventDrop: "Event Drop",
  liveFeed: "Live Feed",
  tickerEmpty: "Jadwal muncul setelah tim siap.",
  noEvents: "Belum ada event publik untuk game ini.",
  issue: "Event",
};

describe("PublicHomeV2", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    container?.remove();
  });

  function renderHome(overrides: Partial<React.ComponentProps<typeof PublicHomeV2>> = {}) {
    act(() => {
      root.render(
        <PublicHomeV2
          events={[featuredEvent, railEventA, railEventB]}
          games={games}
          featuredEvent={featuredEvent}
          featuredGame={games.find((game) => game.id === featuredEvent.gameId)!}
          featuredTeams={featuredTeams}
          featuredBracket={featuredBracket}
          gameFilter="all"
          labels={homeLabels}
          {...overrides}
        />,
      );
    });
  }

  it("renders exactly one semantic h1 carrying the featured event name", () => {
    renderHome();

    const headings = container.querySelectorAll("h1");
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toContain("Dawn Finals");
  });

  it("links the primary call to action to the featured event page", () => {
    renderHome();

    const primary = container.querySelector('[data-testid="pv-hero-primary-cta"]');
    expect(primary?.getAttribute("href")).toBe("/events/dawn-finals");
    expect(primary?.textContent).toContain("Jelajahi Event");

    const secondary = container.querySelector('[data-testid="pv-hero-secondary-cta"]');
    expect(secondary?.getAttribute("href")).toBe("/events");
  });

  it("shows at most three match rows in the live ticker with resolved team names", () => {
    renderHome();

    const rows = container.querySelectorAll('[data-testid="pv-ticker-row"]');
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain("Alter Ego");
    expect(rows[0]?.textContent).toContain("Bigetron");
  });

  it("falls back to ticker copy when the bracket is empty", () => {
    renderHome({ featuredBracket: [] });

    expect(container.querySelectorAll('[data-testid="pv-ticker-row"]')).toHaveLength(0);
    expect(container.textContent).toContain("Jadwal muncul setelah tim siap.");
  });

  it("renders the remaining events as an event drop rail with real text names", () => {
    renderHome();

    const rail = container.querySelector('[data-testid="pv-event-rail"]');
    expect(rail).toBeTruthy();

    const cards = rail!.querySelectorAll('[data-testid="pv-event-card"]');
    expect(cards).toHaveLength(2);
    expect(rail!.textContent).toContain("Street Clash");
    expect(rail!.textContent).toContain("Summer Cup");

    const headings = Array.from(rail!.querySelectorAll("h2, h3")).map((node) => node.textContent);
    expect(headings.some((text) => text?.includes("Street Clash"))).toBe(true);
  });

  it("marks exactly one artwork as priority in the initial viewport", () => {
    renderHome();

    expect(container.querySelectorAll('img[data-priority="true"]')).toHaveLength(1);
    expect(container.querySelectorAll('img[data-priority="false"]').length).toBeGreaterThan(0);
  });

  it("never paints event artwork through a CSS background image", () => {
    renderHome();

    const painted = Array.from(container.querySelectorAll<HTMLElement>("[style]")).filter((node) =>
      node.getAttribute("style")?.includes("background-image"),
    );
    expect(painted).toHaveLength(0);
  });

  it("keeps game filters as navigable links", () => {
    renderHome();

    const filters = container.querySelectorAll('[data-testid="pv-game-filter"]');
    expect(filters.length).toBe(games.length + 1);
    expect(Array.from(filters).every((node) => node.tagName === "A")).toBe(true);
    expect(filters[0]?.getAttribute("href")).toBe("/");
  });

  it("shows the empty state when no events match the filter", () => {
    renderHome({ events: [], featuredEvent: undefined, featuredGame: undefined, featuredBracket: [], featuredTeams: [] });

    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.textContent).toContain("Belum ada event publik untuk game ini.");
  });
});
