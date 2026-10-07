import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AdaptivePhaseEventPage } from "./AdaptivePhaseEventPage";
import type { PublicDrawingEventViewModel, PublicFinishedEventViewModel } from "@/lib/events/adaptive-public-phases";

const shared = {
  event: { id: "event-1", slug: "miracle-cup", name: "Miracle Cup", description: "Event", timezone: "Asia/Jakarta", format: "single_elimination" },
  organizer: { name: "Flash Peak Organizer", verified: true },
  facts: { startsAt: "2026-09-20T02:00:00.000Z", venue: "Arena", prize: "Rp5.000.000", participants: 12, participantCap: 16 },
  navigation: { overview: true, participants: true, schedule: true, bracket: true, leaderboard: true },
};

describe("adaptive drawing/finished pages", () => {
  it("shows published bracket during drawing with permanent contextual routes", () => {
    const view: PublicDrawingEventViewModel = {
      mode: "drawing",
      ...shared,
      statusExplanation: "Drawing resmi telah diterbitkan.",
      cta: { label: "Lihat bracket", href: "/id/events/miracle-cup/bracket" },
      drawing: { published: true, seeds: [{ teamId: "team-b", teamName: "Beta", seed: 1 }] },
      matches: [{ id: "m1", roundLabel: "Round 1", home: "Beta", away: "TBD", status: "scheduled", homeScore: null, awayScore: null, start: null, room: null, bestOf: 3 }],
      schedule: null,
      standings: [],
    };
    const html = renderToStaticMarkup(<AdaptivePhaseEventPage view={view} locale="id" />);
    expect(html).toContain("Drawing resmi");
    expect(html).toContain("Beta");
    expect(html).toContain("TBD");
    for (const route of ["participants", "schedule", "bracket", "leaderboards"]) expect(html).toContain(`/id/events/miracle-cup/${route}`);
  });

  it("replaces player spotlight with all four individual awards and certificate links", () => {
    const awards: PublicFinishedEventViewModel["awards"] = [
      ["mvp", "Nyx"], ["top_scorer", "Vok"], ["top_defender", "Aegis"], ["top_assist", "Orbit"],
    ].map(([type, recipientName], index) => ({
      type: type as PublicFinishedEventViewModel["awards"][number]["type"],
      recipientId: `p${index}`,
      recipientName,
      teamId: "team",
      teamName: "Garuda Nova",
      reason: null,
      certificate: index === 0 ? { publishedUrl: "/certificates/mvp.png", verificationCode: "VERIFY-MVP" } : null,
    }));
    const view: PublicFinishedEventViewModel = {
      mode: "finished",
      ...shared,
      statusExplanation: "Hasil akhir resmi.",
      cta: { label: "Leaderboard akhir", href: "/id/events/miracle-cup/leaderboards" },
      certificates: { status: "published", publishedCount: 7, expectedCount: 7 },
      podium: [{ rank: 1, teamId: "team", teamName: "Garuda Nova", certificate: { publishedUrl: "/certificates/champion.png", verificationCode: "VERIFY-CHAMPION" } }],
      awards,
      matches: [],
      standings: [],
    };
    const html = renderToStaticMarkup(<AdaptivePhaseEventPage view={view} locale="id" />);
    for (const label of ["MVP of Tournament", "Top Scorer", "Top Defender", "Top Assist"]) expect(html).toContain(label);
    expect(html).toContain("Nyx");
    expect(html).toContain('href="/certificates/mvp.png"');
    expect(html).toContain("/id/certificates/verify/VERIFY-MVP");
    expect(html).toContain('href="/certificates/champion.png"');
    expect(html).toContain("Tujuh certificate resmi telah diterbitkan.");
  });

  it("shows an explicit preparation state and no certificate links until the complete current set is published", () => {
    const view: PublicFinishedEventViewModel = {
      mode: "finished",
      ...shared,
      statusExplanation: "Hasil akhir resmi.",
      cta: { label: "Leaderboard akhir", href: "/id/events/miracle-cup/leaderboards" },
      certificates: { status: "preparing", publishedCount: 0, expectedCount: 7 },
      podium: [{ rank: 1, teamId: "team", teamName: "Garuda Nova", certificate: null }],
      awards: [],
      matches: [],
      standings: [],
    };
    const html = renderToStaticMarkup(<AdaptivePhaseEventPage view={view} locale="id" />);
    expect(html).toContain("Certificate sedang disiapkan organizer");
    expect(html).not.toContain("Lihat certificate tim");
  });
});
