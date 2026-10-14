/**
 * The two heroes that read the ordinary public view (event page and home page) used to say "Daftarkan tim"
 * for every event. A solo event says "Daftar solo", and never opens the captain dialog.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./CaptainLoginDialog", () => ({ CaptainLoginDialog: ({ triggerLabel }: { triggerLabel: string }) => <button>CAPTAIN-DIALOG {triggerLabel}</button> }));
vi.mock("@/components/v3/public-discovery/EventPosterStage", () => ({ EventPosterStage: () => null }));

import { FeaturedEventHero } from "@/components/v3/public-discovery/FeaturedEventHero";
import { projectCompatiblePublicV3Event, projectPublicHomeFeaturedEvent } from "@/lib/events/public-v3-read";
import { PublicV3EventHero } from "./PublicV3EventHero";

Object.assign(globalThis, { React });

const event = {
  id: "event-1", slug: "solo-cup", name: "Solo Cup", description: "A solo event",
  gameId: "game-flashpeak", gameModeId: "mode-flashpeak-5v5", format: "Single Elimination", status: "Published",
  participantCap: 8, timezone: "Asia/Jakarta", venue: "Arena", organizerName: "Organizer", organizerVerified: true,
  registrationOpensAt: new Date("2026-10-01T00:00:00.000Z"), registrationClosesAt: new Date("2026-10-20T00:00:00.000Z"),
  eventStartsAt: new Date("2026-10-25T00:00:00.000Z"),
};
const now = new Date("2026-10-14T00:00:00.000Z");
const project = (entryMode: "team" | "solo") => projectCompatiblePublicV3Event({ now, event: { ...event, entryMode } });

const hero = (entryMode: "team" | "solo", locale: "id" | "en" = "id") =>
  renderToStaticMarkup(<PublicV3EventHero view={project(entryMode)} locale={locale} />);
const featured = (entryMode: "team" | "solo", locale: "id" | "en" = "id") => {
  const view = projectPublicHomeFeaturedEvent(project(entryMode));
  return renderToStaticMarkup(<FeaturedEventHero view={view} locale={locale} />);
};

afterEach(() => vi.unstubAllEnvs());

describe("the event page hero", () => {
  it("still asks a team event for a team, through the captain dialog", () => {
    const html = hero("team");
    expect(html).toContain("CAPTAIN-DIALOG Daftarkan tim");
    expect(html).not.toContain("Daftar solo");
  });

  it("asks a solo event for a solo registration and sends the visitor to the ordinary login page", () => {
    vi.stubEnv("FEATURE_FLAG_SOLO_TOURNAMENT_V1", "true");
    const html = hero("solo");
    expect(html).toContain("Daftar solo");
    expect(html).not.toContain("CAPTAIN-DIALOG");
    expect(html).toContain(`href="/id/login?returnTo=${encodeURIComponent("/id/events/solo-cup/register")}"`);
  });

  it("speaks English for a solo event", () => {
    vi.stubEnv("FEATURE_FLAG_SOLO_TOURNAMENT_V1", "true");
    const html = hero("solo", "en");
    expect(html).toContain("Join solo");
    expect(html).not.toContain("Register a team");
  });

  it("shows a switched-off button, not a link to a missing page, when the solo flag is off", () => {
    vi.stubEnv("FEATURE_FLAG_SOLO_TOURNAMENT_V1", "");
    const html = hero("solo");
    expect(html).toContain("Pendaftaran belum tersedia");
    expect(html).toMatch(/<button[^>]*disabled/);
    expect(html).not.toContain("/events/solo-cup/register");
  });
});

describe("the home page hero", () => {
  it("says Daftarkan tim for a team event and Daftar solo for a solo event", () => {
    expect(featured("team")).toContain("Daftarkan tim");
    vi.stubEnv("FEATURE_FLAG_SOLO_TOURNAMENT_V1", "true");
    const html = featured("solo");
    expect(html).toContain("Daftar solo");
    expect(html).not.toContain("Daftarkan tim");
    expect(featured("solo", "en")).toContain("Join solo");
  });

  it("says the registration is not available for a solo event while the flag is off", () => {
    vi.stubEnv("FEATURE_FLAG_SOLO_TOURNAMENT_V1", "");
    const html = featured("solo");
    expect(html).not.toContain("Daftar solo");
    expect(html).toContain("Pendaftaran belum tersedia");
  });
});
