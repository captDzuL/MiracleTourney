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
import { PublicEventsV2 } from "@/components/public-v2/PublicEventsV2";
import { PublicEventDetailV2 } from "@/components/public-v2/PublicEventDetailV2";
import { gameModes, games } from "@/lib/platform/config";

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

const listLabels = {
  title: "Event",
  description: "Semua turnamen publik.",
  allGames: "Semua Game",
  teams: "tim",
  noEvents: "Belum ada event yang cocok.",
  issue: "Event",
  organizer: "Organizer",
};

const statusFilters = [
  { id: "all", label: "Semua" },
  { id: "published", label: "Buka Pendaftaran" },
  { id: "ongoing", label: "Berlangsung" },
  { id: "finished", label: "Selesai" },
];

function listHref(next: { game?: string; status?: string }) {
  const query = new URLSearchParams();
  const game = next.game ?? "all";
  const status = next.status ?? "all";
  if (game !== "all") query.set("game", game);
  if (status !== "all") query.set("status", status);
  const qs = query.toString();
  return qs ? `/events?${qs}` : "/events";
}

describe("PublicEventsV2", () => {
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

  function renderList(overrides: Partial<React.ComponentProps<typeof PublicEventsV2>> = {}) {
    act(() => {
      root.render(
        <PublicEventsV2
          events={[featuredEvent, railEventA]}
          games={games}
          teamsByEvent={new Map([["evt-1", featuredTeams]])}
          filters={{ statuses: statusFilters, activeStatus: "all", activeGame: "all" }}
          href={listHref}
          labels={listLabels}
          {...overrides}
        />,
      );
    });
  }

  it("renders one page level h1 and each event name as real heading text", () => {
    renderList();

    expect(container.querySelectorAll("h1")).toHaveLength(1);

    const rows = container.querySelectorAll('[data-testid="pv-event-row"]');
    expect(rows).toHaveLength(2);

    const names = Array.from(container.querySelectorAll("h2")).map((node) => node.textContent);
    expect(names.some((text) => text?.includes("Dawn Finals"))).toBe(true);
    expect(names.some((text) => text?.includes("Street Clash"))).toBe(true);
  });

  it("paints event artwork through the image pipeline instead of CSS backgrounds", () => {
    renderList();

    const painted = Array.from(container.querySelectorAll<HTMLElement>("[style]")).filter((node) =>
      node.getAttribute("style")?.includes("background-image"),
    );
    expect(painted).toHaveLength(0);
    expect(container.querySelectorAll("img").length).toBeGreaterThanOrEqual(2);
    expect(container.querySelectorAll('img[data-priority="true"]')).toHaveLength(0);
  });

  it("keeps status and game filters as navigable links carrying their query", () => {
    renderList();

    const statusLinks = container.querySelectorAll('[data-testid="pv-status-filter"]');
    expect(statusLinks).toHaveLength(statusFilters.length);
    expect(Array.from(statusLinks).every((node) => node.tagName === "A")).toBe(true);
    expect(Array.from(statusLinks).map((node) => node.getAttribute("href"))).toContain("/events?status=ongoing");

    const gameLinks = container.querySelectorAll('[data-testid="pv-game-filter"]');
    expect(gameLinks).toHaveLength(games.length + 1);
    expect(Array.from(gameLinks).map((node) => node.getAttribute("href"))).toContain("/events?game=game-kuroko");
  });

  it("links every row to its event slug and shows the registered team count", () => {
    renderList();

    const first = container.querySelector('[data-testid="pv-event-row"] a');
    expect(first?.getAttribute("href")).toBe("/events/dawn-finals");
    expect(container.textContent).toContain("4/16");
  });

  it("shows the empty state when nothing matches", () => {
    renderList({ events: [] });

    expect(container.querySelectorAll('[data-testid="pv-event-row"]')).toHaveLength(0);
    expect(container.textContent).toContain("Belum ada event yang cocok.");
  });
});

const detailLabels = {
  liveNow: "LIVE",
  organizer: "Organizer",
  issue: "Event",
  teamCount: "4/16 tim",
  register: "Daftar Event",
  quickLinks: "Navigasi Event",
  participants: "Peserta",
  bracket: "Bagan",
  standings: "Klasemen",
  leaderboards: "Papan Skor",
};

describe("PublicEventDetailV2", () => {
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

  function renderDetail(overrides: Partial<React.ComponentProps<typeof PublicEventDetailV2>> = {}) {
    act(() => {
      root.render(
        <PublicEventDetailV2
          event={featuredEvent}
          game={games.find((game) => game.id === featuredEvent.gameId)!}
          mode={gameModes.find((mode) => mode.id === featuredEvent.gameModeId)!}
          teams={featuredTeams}
          bracket={featuredBracket}
          labels={detailLabels}
          {...overrides}
        >
          <p data-testid="pv-detail-extras">extras slot</p>
        </PublicEventDetailV2>,
      );
    });
  }

  it("renders exactly one semantic h1 with the event name as text", () => {
    renderDetail();

    const headings = container.querySelectorAll("h1");
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toContain("Dawn Finals");
  });

  it("hides the registration call to action when the event has no registration url", () => {
    renderDetail();

    expect(container.querySelector('[data-testid="pv-detail-register"]')).toBeNull();
  });

  it("renders the registration call to action as an external link when a url exists", () => {
    renderDetail({ event: makeEvent({ ...featuredEvent, registrationUrl: "https://forms.example.test/join" }) });

    const cta = container.querySelector('[data-testid="pv-detail-register"]');
    expect(cta?.getAttribute("href")).toBe("https://forms.example.test/join");
    expect(cta?.getAttribute("target")).toBe("_blank");
    expect(cta?.getAttribute("rel")).toContain("noreferrer");
    expect(cta?.textContent).toContain("Daftar Event");
  });

  it("exposes all four event sections as quick links", () => {
    renderDetail();

    const hrefs = Array.from(container.querySelectorAll('[data-testid="pv-detail-quick-link"]')).map((node) =>
      node.getAttribute("href"),
    );
    expect(hrefs).toEqual([
      "/events/dawn-finals/participants",
      "/events/dawn-finals/bracket",
      "/events/dawn-finals/standings",
      "/events/dawn-finals/leaderboards",
    ]);
  });

  it("prefixes quick links with the active locale when one is provided", () => {
    renderDetail({ locale: "id" });

    const first = container.querySelector('[data-testid="pv-detail-quick-link"]');
    expect(first?.getAttribute("href")).toBe("/id/events/dawn-finals/participants");
  });

  it("never paints the hero artwork through a CSS background image", () => {
    renderDetail();

    const painted = Array.from(container.querySelectorAll<HTMLElement>("[style]")).filter((node) =>
      node.getAttribute("style")?.includes("background-image"),
    );
    expect(painted).toHaveLength(0);
    expect(container.querySelectorAll("img").length).toBeGreaterThan(0);
  });

  it("renders the supporting sections passed in as children", () => {
    renderDetail();

    expect(container.querySelector('[data-testid="pv-detail-extras"]')?.textContent).toBe("extras slot");
  });
});
