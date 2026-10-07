import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { PublicDiscoveryEvent } from "@/lib/events/public-discovery";
import type { Event, Game } from "@/lib/platform/types";
import { PublicDiscoveryHomeV3, PublicEventsCenterV3 } from "./PublicDiscoveryV3";
import { projectCompatiblePublicV3Event } from "@/lib/events/public-v3-read";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function event(slug: string, status: Event["status"], phaseStatus: PublicDiscoveryEvent["phaseStatus"] = null): PublicDiscoveryEvent {
  return {
    event: {
      id: slug,
      slug,
      name: `Miracle ${slug}`,
      description: "Kompetisi komunitas.",
      gameId: "game-flashpeak",
      gameModeId: "mode-flashpeak-5v5",
      format: "Single Elimination",
      status,
      participantCap: 16,
      registrationWindow: "1-10 September 2026",
      startsAt: "12 September 2026",
      venue: "Miracle Arena",
      organizerName: "Miracle Organizer",
      organizerVerified: true,
      prizePoolLabel: "Rp5.000.000",
      registrationFeeRequired: false,
    },
    phaseStatus,
    hasLiveMatch: status === "Ongoing",
    teamCount: 12,
    updatedAt: "2026-09-12T00:00:00.000Z",
  };
}

const games = [{
  id: "game-flashpeak",
  slug: "flashpeak",
  name: "Flashpeak",
  accent: "from-cyan-500 to-violet-700",
  defaultModeId: "mode-flashpeak-5v5",
}] as unknown as Game[];

describe("public discovery V3 presentation", () => {
  it("keeps one strong featured event and exposes every contextual route plus other event groups", () => {
    const html = renderToStaticMarkup(<PublicDiscoveryHomeV3
      locale="id"
      entries={[
        event("live", "Ongoing", "active"),
        event("draw", "Registration Closed", "active"),
        event("open", "Published"),
        event("done", "Finished", "completed"),
      ]}
      games={games}
      gameFilter="all"
      loadState="ready"
      featuredView={projectCompatiblePublicV3Event({ event: event("live", "Ongoing", "active").event })}
    />);

    expect(html).toContain("Miracle live");
    for (const route of ["participants", "schedule", "bracket", "leaderboards"]) {
      expect(html).toContain(`/id/events/live/${route}`);
    }
    expect(html).toContain('href="/id/events/live"');
    expect(html).toContain("Event lain");
    expect(html).toContain("Akan datang");
    expect(html).toContain("Selesai");
    expect(html).toContain('href="/id/events"');
  });

  it("renders an honest discovery error without fixture events", () => {
    const html = renderToStaticMarkup(<PublicDiscoveryHomeV3
      locale="id"
      entries={[]}
      games={games}
      gameFilter="all"
      loadState="error"
    />);
    expect(html).toContain("Data event belum dapat dimuat");
    expect(html).not.toContain("Miracle Fast Tour");
  });

  it("shows Event Center filters, status counts, cards, and a finished archive", () => {
    const entries = [
      event("live", "Ongoing", "active"),
      event("open", "Published"),
      event("done", "Finished", "completed"),
    ];
    const html = renderToStaticMarkup(<PublicEventsCenterV3
      locale="id"
      entries={entries}
      games={games}
      filters={{ game: "all", status: "all" }}
      loadState="ready"
    />);
    expect(html).toContain("Event Center");
    expect(html).toContain("Berlangsung");
    expect(html).toContain("Akan datang");
    expect(html).toContain("Arsip selesai");
    expect(html).toContain("game=game-flashpeak");
    expect(html).toContain("Miracle done");
  });
});
