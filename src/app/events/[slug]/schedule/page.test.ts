import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { featureEnabledMock } = vi.hoisted(() => ({ featureEnabledMock: vi.fn() }));

vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: featureEnabledMock }));
vi.mock("@/lib/events/adaptive-public-phases", () => ({
  getPublicDrawingEvent: vi.fn().mockResolvedValue(null),
  getPublicFinishedEvent: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/events/public-ongoing", () => ({ getPublicOngoingEvent: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/platform/repository", () => ({
  getPublicEventBySlug: vi.fn().mockResolvedValue({ id: "schedule-event", slug: "schedule-event", name: "Schedule Event", status: "Published" }),
  getMatchesForEvent: vi.fn().mockResolvedValue([]),
  getTeamsForEvent: vi.fn().mockResolvedValue([]),
  getEventRoundConfigs: vi.fn().mockResolvedValue([]),
}));

import { renderSchedulePage } from "./schedule-page-content";

Object.assign(globalThis, { React });

describe("public schedule route", () => {
  beforeEach(() => featureEnabledMock.mockReturnValue(false));

  it("uses adaptive public phase readers and the filterable WIB schedule board", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "./schedule-page-content.tsx"), "utf8");
    expect(source).toContain("getPublicDrawingEvent");
    expect(source).toContain("getPublicOngoingEvent");
    expect(source).toContain("getPublicFinishedEvent");
    expect(source).toContain("PublicScheduleBoard");
  });

  it("keeps localized and unlocalized schedule routes dynamic", () => {
    const publicRoute = fs.readFileSync(path.resolve(__dirname, "./page.tsx"), "utf8");
    const localizedRoute = fs.readFileSync(path.resolve(__dirname, "../../../[locale]/events/[slug]/schedule/page.tsx"), "utf8");
    expect(publicRoute).toContain('export const dynamic = "force-dynamic"');
    expect(localizedRoute).toContain('export const dynamic = "force-dynamic"');
  });

  it("uses the dark V3 route frame when the visual foundation is enabled", async () => {
    featureEnabledMock.mockImplementation((flag: string) => flag === "ui_v3_foundation");

    const markup = renderToStaticMarkup(await renderSchedulePage("schedule-event", "en"));

    expect(markup).toContain("miracle-public-v3");
    expect(markup).toContain("mpv3-detail-page");
    expect(markup).not.toContain("pv-section-card");
    expect(markup).not.toContain("bg-white");
  });

  it("preserves the legacy schedule composition when the visual foundation is disabled", async () => {
    const markup = renderToStaticMarkup(await renderSchedulePage("schedule-event", "en"));

    expect(markup).toContain("pv-section-card");
    expect(markup).not.toContain("miracle-public-v3");
  });
});
