import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { featureEnabledMock } = vi.hoisted(() => ({ featureEnabledMock: vi.fn() }));

vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: featureEnabledMock }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, string | number>) => {
    const copy: Record<string, string> = {
      sectionTitle: "{name} Participants",
      sectionDescription: "Registered teams.",
      backToEvent: "Back to Event",
      team: "Team",
      tag: "Tag",
      captain: "Captain",
      roster: "Roster",
      rosterPending: "Roster pending",
    };
    return (copy[key] ?? key).replace("{name}", String(values?.name ?? ""));
  }),
}));
vi.mock("@/lib/platform/repository", () => ({
  getPublicEventBySlug: vi.fn().mockResolvedValue({ id: "participants-event", slug: "participants-event", name: "Participants Event" }),
  getTeamsForEvent: vi.fn().mockResolvedValue([]),
  getPlayersForTeams: vi.fn().mockResolvedValue([]),
}));

import { renderParticipantsPage } from "./participants-page";

Object.assign(globalThis, { React });

describe("public participants route", () => {
  beforeEach(() => featureEnabledMock.mockReturnValue(false));

  it("uses the dark V3 route frame when the visual foundation is enabled", async () => {
    featureEnabledMock.mockImplementation((flag: string) => flag === "ui_v3_foundation" || flag === "adaptive_public_event_v3");

    const markup = renderToStaticMarkup(await renderParticipantsPage("participants-event", "en"));

    expect(markup).toContain("miracle-public-v3");
    expect(markup).toContain("mpv3-detail-page");
    expect(markup).not.toContain("pv-section-card");
    expect(markup).not.toContain("bg-white");
  });

  it("preserves the legacy participants composition when the visual foundation is disabled", async () => {
    const markup = renderToStaticMarkup(await renderParticipantsPage("participants-event", "en"));

    expect(markup).toContain("pv-section-card");
    expect(markup).toContain("pv-data-table");
    expect(markup).not.toContain("miracle-public-v3");
  });
});
