import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  enabled: false,
  getEventBySlug: vi.fn(),
  getFlashpeakLeaderboardForEvent: vi.fn(),
  getFlashpeakLeaderboardForEventResult: vi.fn(),
  getLeaderboardForEvent: vi.fn(),
  getTeamsForEvent: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, string>) => {
    if (key === "sectionTitle") return `Leaderboard ${values?.name ?? ""}`;
    const copy: Record<string, string> = {
      sectionDescription: "Event-scoped aggregation of personal statistics.",
      backToEvent: "Back to Event",
      player: "Player",
      position: "Position",
      matches: "Matches",
      totals: "Totals",
      eyebrow: "PLAYER STATISTICS",
      tableHeading: "Official player data",
      publishedStats: "Players with stats",
      noStats: "No completed player statistics yet.",
      unavailable: "Leaderboard unavailable",
    };
    return copy[key] ?? key;
  }),
}));
vi.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: (flag: string) => flag === "ui_v3_foundation" && dependencies.enabled,
}));
vi.mock("@/lib/platform/repository", () => ({
  getEventBySlug: dependencies.getEventBySlug,
  getFlashpeakLeaderboardForEvent: dependencies.getFlashpeakLeaderboardForEvent,
  getFlashpeakLeaderboardForEventResult: dependencies.getFlashpeakLeaderboardForEventResult,
  getLeaderboardForEvent: dependencies.getLeaderboardForEvent,
  getTeamsForEvent: dependencies.getTeamsForEvent,
}));
vi.mock("@/components/public-v2/BackToEvent", () => ({
  BackToEvent: ({ label }: { label: string }) => <span>{label}</span>,
}));

import { renderLeaderboardsPage } from "./leaderboards-page";

Object.assign(globalThis, { React });

const event = {
  id: "event-1",
  slug: "cup",
  name: "Flashpeak Cup",
  gameId: "game-flashpeak",
  gameModeId: "mode-flashpeak-5v5",
  status: "Finished",
};

beforeEach(() => {
  dependencies.enabled = false;
  dependencies.getEventBySlug.mockReset();
  dependencies.getFlashpeakLeaderboardForEvent.mockReset();
  dependencies.getFlashpeakLeaderboardForEventResult.mockReset();
  dependencies.getLeaderboardForEvent.mockReset();
  dependencies.getTeamsForEvent.mockReset();
  dependencies.getEventBySlug.mockResolvedValue(event);
});

describe("renderLeaderboardsPage", () => {
  it("uses the V3 public data surface when the visual foundation is enabled", async () => {
    dependencies.enabled = true;
    dependencies.getFlashpeakLeaderboardForEventResult.mockResolvedValue({ status: "empty", entries: [] });

    const html = renderToStaticMarkup(await renderLeaderboardsPage("cup", "en"));

    expect(html).toContain("miracle-public-v3");
    expect(html).toContain("mpv3-section-head");
    expect(html).toContain("No completed player statistics yet.");
    expect(html).not.toContain("pv-section-card");
    expect(dependencies.getFlashpeakLeaderboardForEventResult).toHaveBeenCalledWith("event-1");
  });

  it("preserves the legacy public leaderboard composition when the visual foundation is disabled", async () => {
    dependencies.getFlashpeakLeaderboardForEvent.mockResolvedValue([]);

    const html = renderToStaticMarkup(await renderLeaderboardsPage("cup", "en"));

    expect(html).toContain("pv-section-card");
    expect(html).toContain("No players match the filters.");
    expect(html).not.toContain("No completed player statistics yet.");
    expect(html).not.toContain("miracle-public-v3");
    expect(dependencies.getFlashpeakLeaderboardForEvent).toHaveBeenCalledWith("event-1");
  });

  it("keeps a reader failure visibly distinct from the no-statistics state", async () => {
    dependencies.enabled = true;
    dependencies.getFlashpeakLeaderboardForEventResult.mockResolvedValue({ status: "error", entries: [] });

    const html = renderToStaticMarkup(await renderLeaderboardsPage("cup", "en"));

    expect(html).toContain("Leaderboard unavailable");
    expect(html).not.toContain("No completed player statistics yet.");
  });
});
