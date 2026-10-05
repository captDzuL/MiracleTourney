import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { featureEnabledMock, drawingEventMock } = vi.hoisted(() => ({ featureEnabledMock: vi.fn(), drawingEventMock: vi.fn() }));

vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: featureEnabledMock }));
vi.mock("@/lib/events/adaptive-public-phases", () => ({
  getPublicDrawingEvent: drawingEventMock,
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
  beforeEach(() => {
    featureEnabledMock.mockReturnValue(false);
    drawingEventMock.mockResolvedValue(null);
  });

  function publishedSchedule() {
    return {
      schedule: { version: 1, publishedAt: null },
      matches: [
        { id: "scheduled", roundLabel: "R1", home: "Alpha", away: "Beta", status: "scheduled", homeScore: null, awayScore: null, start: null, room: null, bestOf: 1 },
        { id: "delayed", roundLabel: "R1", home: "Alpha", away: "Beta", status: "delayed", homeScore: null, awayScore: null, start: null, room: null, bestOf: 1 },
        { id: "postponed", roundLabel: "R1", home: "Alpha", away: "Beta", status: "postponed", homeScore: null, awayScore: null, start: null, room: null, bestOf: 1 },
        { id: "live", roundLabel: "R1", home: "Alpha", away: "Beta", status: "live", homeScore: 1, awayScore: 0, start: null, room: null, bestOf: 1 },
        { id: "completed", roundLabel: "R1", home: "Alpha", away: "Beta", status: "completed", homeScore: 2, awayScore: 1, start: null, room: null, bestOf: 1 },
      ],
    };
  }

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

  it("localizes every non-empty schedule status in the V3 route for Indonesian and English", async () => {
    featureEnabledMock.mockImplementation((flag: string) => flag === "adaptive_public_event_v3" || flag === "ui_v3_foundation");
    drawingEventMock.mockResolvedValue(publishedSchedule());

    const indonesian = renderToStaticMarkup(await renderSchedulePage("schedule-event", "id"));
    const english = renderToStaticMarkup(await renderSchedulePage("schedule-event", "en"));

    for (const label of ["Dijadwalkan", "Tertunda", "Ditunda", "Sedang berlangsung", "Selesai"]) expect(indonesian).toContain(label);
    for (const label of ["Scheduled", "Delayed", "Postponed", "Live", "Completed"]) expect(english).toContain(label);
    expect(indonesian).toContain("miracle-public-v3");
    expect(english).toContain("miracle-public-v3");
  });

  it("preserves the legacy status expression for a non-empty flag-off schedule", async () => {
    featureEnabledMock.mockImplementation((flag: string) => flag === "adaptive_public_event_v3");
    drawingEventMock.mockResolvedValue(publishedSchedule());

    const indonesian = renderToStaticMarkup(await renderSchedulePage("schedule-event", "id"));
    const english = renderToStaticMarkup(await renderSchedulePage("schedule-event", "en"));

    for (const label of ["scheduled", "delayed", "postponed", "Live", "Selesai"]) expect(indonesian).toContain(label);
    for (const label of ["scheduled", "delayed", "postponed", "Live", "Completed"]) expect(english).toContain(label);
    expect(indonesian).not.toContain("Dijadwalkan");
    expect(english).not.toContain("Scheduled");
    expect(indonesian).not.toContain("miracle-public-v3");
    expect(english).not.toContain("miracle-public-v3");
  });
});
