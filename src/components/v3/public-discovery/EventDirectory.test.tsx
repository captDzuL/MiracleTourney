// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PublicDiscoveryEvent } from "@/lib/events/public-discovery";
import type { Game } from "@/lib/platform/types";
import { EventDirectory } from "./EventDirectory";

(globalThis as typeof globalThis & { React: typeof React }).React = React;
const games = [{ id: "game-flashpeak", slug: "flashpeak", name: "Flashpeak" }, { id: "game-other", slug: "other", name: "Other game" }] as Game[];
function entry(slug: string, status: PublicDiscoveryEvent["event"]["status"], gameId = "game-flashpeak"): PublicDiscoveryEvent {
  return { event: { id: slug, slug, name: `Miracle ${slug}`, gameId, gameModeId: "5v5", status, format: "Single Elimination", participantCap: 16, startsAt: "2026-09-18T11:00:00Z", description: "Community competition", venue: "Arena", registrationWindow: "" }, teamCount: 0, hasLiveMatch: false, phaseStatus: null, updatedAt: "2026-09-10T00:00:00Z" };
}
const entries = [entry("old", "Finished"), entry("open", "Published"), entry("z-live", "Ongoing"), entry("draw", "Registration Closed"), { ...entry("a-live", "Ongoing", "game-other"), hasLiveMatch: true }, { ...entry("recent", "Finished"), updatedAt: "2026-09-12T00:00:00Z" }];
function render(options: { items?: PublicDiscoveryEvent[]; locale?: "id" | "en"; game?: string; status?: string; loadState?: "ready" | "error" } = {}) {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(<EventDirectory locale={options.locale ?? "id"} entries={options.items ?? entries} games={games} filters={{ game: options.game ?? "all", status: options.status ?? "all" }} loadState={options.loadState ?? "ready"} />);
  return root;
}
describe("final Event Center directory", () => {
  it("links the header to the deterministic featured event without a second event read", () => {
    const root = render();
    expect(root.querySelector('header nav a[href="/id/events/a-live"]')?.textContent).toBe("Event utama");
    expect(root.querySelector('header nav a[aria-current="page"]')?.getAttribute("href")).toBe("/id/events");
  });
  it("owns one frame and keeps every event in deterministic lifecycle card groups", () => {
    const root = render();
    expect(root.querySelectorAll("header")).toHaveLength(1);
    expect(root.querySelectorAll("main")).toHaveLength(1);
    expect(root.querySelector("h1")?.textContent).toBe("Satu panggung utama.Semua cerita tetap hidup.");
    expect([...root.querySelectorAll("article")].map((card) => card.getAttribute("data-event-id"))).toEqual(["a-live", "z-live", "draw", "open", "recent", "old"]);
    expect(root.querySelectorAll("[data-lifecycle] .mpv3-directory-grid")).toHaveLength(3);
    expect(root.querySelectorAll(".mpv3-poster-stage")).toHaveLength(6);
    expect(root.querySelector('[data-lifecycle="finished"]')?.textContent).toContain("Miracle old");
  });
  it("applies shared URL state while preserving the other selected filter", () => {
    const root = render({ locale: "en", game: "game-flashpeak", status: "upcoming" });
    expect([...root.querySelectorAll("article")].map((card) => card.getAttribute("data-event-id"))).toEqual(["draw", "open"]);
    expect(root.querySelector('nav[aria-label="Status filters"] a[aria-current="page"]')?.getAttribute("href")).toBe("/en/events?game=game-flashpeak&status=upcoming");
    expect(root.querySelector('nav[aria-label="Game filters"] a[aria-current="page"]')?.textContent).toBe("Flashpeak");
    expect(root.querySelector('a[href="/en/events?game=game-other&status=upcoming"]')).not.toBeNull();
    expect(root.querySelector('a[href="/en/events?game=game-flashpeak&status=finished"]')).not.toBeNull();
    expect(root.querySelector('a[href^="/id"]')).toBeNull();
  });
  it("keeps discovery totals independent of selected filters and preserves known zeros", () => {
    const root = render({ status: "finished" });
    expect([...root.querySelectorAll(".mpv3-directory-counts .mpv3-count strong")].map((n) => n.textContent)).toEqual(["6", "2", "2", "2"]);
    expect(root.querySelector('nav[aria-label="Filter status"]')?.textContent).toContain("Selesai 2");
    expect(root.querySelector("article")?.textContent).toContain("0 / 16 tim");
    expect(root.querySelector("article")?.textContent).toContain("Single Elimination");
  });
  it.each(["registration", "drawing"])("supports the %s URL filter even within the upcoming group", (status) => {
    const root = render({ status });
    expect(root.querySelectorAll("article")).toHaveLength(1);
    expect(root.querySelector("article")?.getAttribute("data-event-id")).toBe(status === "drawing" ? "draw" : "open");
    expect(root.querySelector('nav[aria-label="Filter status"] a[aria-current="page"]')?.getAttribute("href")).toBe(`/id/events?status=${status}`);
  });
  it("renders an empty selection with a localized reset and zero group counts", () => {
    const root = render({ game: "game-other", status: "finished" });
    expect(root.querySelectorAll("article")).toHaveLength(0);
    expect(root.querySelector('[role="status"]')?.textContent).toContain("Belum ada event dalam filter ini");
    expect(root.querySelector('[role="status"] a')?.getAttribute("href")).toBe("/id/events");
    expect(root.querySelectorAll("[data-lifecycle]")).toHaveLength(3);
    const empty = render({ items: [] });
    expect([...empty.querySelectorAll(".mpv3-directory-counts strong")].map((n) => n.textContent)).toEqual(["0", "0", "0", "0"]);
  });
  it("suppresses stale cards and unknown counts on errors and offers a retry of this URL", () => {
    const root = render({ loadState: "error", locale: "en", status: "finished" });
    expect(root.querySelector('[role="alert"]')?.textContent).toContain("Event data is temporarily unavailable");
    expect(root.querySelector('[role="alert"] a')?.getAttribute("href")).toBe("/en/events?status=finished");
    expect(root.querySelectorAll("article")).toHaveLength(0);
    expect(root.querySelector(".mpv3-directory-counts")?.textContent).not.toMatch(/[0-9]/);
  });
  it("uses real event imagery before game art and keeps other games on branded typography", () => {
    const poster = entry("poster", "Published"); poster.event.gameImageUrl = "/poster.png";
    const root = render({ items: [poster, entry("brand", "Published", "game-other")] });
    expect(root.querySelector('[data-event-id="poster"] img')?.getAttribute("src")).toBe("/poster.png");
    expect(root.querySelector('[data-event-id="brand"] img')).toBeNull();
    expect(root.querySelector('[data-event-id="brand"] figcaption')?.textContent).toContain("Miracle brand");
  });
});
