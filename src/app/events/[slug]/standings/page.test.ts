import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { featureEnabledMock } = vi.hoisted(() => ({ featureEnabledMock: vi.fn() }));

vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: featureEnabledMock }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, string | number>) => {
    const copy: Record<string, string> = {
      sectionTitle: "{name} Standings",
      sectionDescription: "Standard league scoring.",
      backToEvent: "Back to Event",
      rank: "#",
      team: "Team",
      played: "P",
      win: "W",
      draw: "D",
      loss: "L",
      points: "Pts",
      for: "For",
      against: "Against",
      diff: "Diff",
    };
    return (copy[key] ?? key).replace("{name}", String(values?.name ?? ""));
  }),
}));
vi.mock("@/lib/platform/repository", () => ({
  getPublicEventBySlug: vi.fn().mockResolvedValue({ id: "standings-event", slug: "standings-event", name: "Standings Event" }),
  getTeamStandings: vi.fn().mockResolvedValue([]),
  getTeamsForEvent: vi.fn().mockResolvedValue([]),
}));

import { renderStandingsPage } from "./standings-page";

Object.assign(globalThis, { React });

describe("public standings route", () => {
  beforeEach(() => featureEnabledMock.mockReturnValue(false));

  it("uses the dark V3 route frame when the visual foundation is enabled", async () => {
    featureEnabledMock.mockImplementation((flag: string) => flag === "ui_v3_foundation");

    const markup = renderToStaticMarkup(await renderStandingsPage("standings-event", "en"));

    expect(markup).toContain("miracle-public-v3");
    expect(markup).toContain("mpv3-detail-page");
    expect(markup).toContain("mpv3-table-wrap");
    expect(markup).not.toContain("pv-section-card");
    expect(markup).not.toContain("bg-white");
  });

  it("preserves the legacy standings composition when the visual foundation is disabled", async () => {
    const markup = renderToStaticMarkup(await renderStandingsPage("standings-event", "en"));

    expect(markup).toContain("pv-section-card");
    expect(markup).toContain("pv-data-table");
    expect(markup).not.toContain("miracle-public-v3");
  });
});
