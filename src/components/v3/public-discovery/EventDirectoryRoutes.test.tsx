// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicDiscoveryEvent } from "@/lib/events/public-discovery";

// Run the installed Next cache code with its real request async storage. Only
// database I/O, framework locale context and cache storage are test doubles.
const dependencies = await vi.hoisted(async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks");
  Object.defineProperty(globalThis, "AsyncLocalStorage", { configurable: true, value: AsyncLocalStorage });
  return { read: vi.fn() };
});
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key, getLocale: async () => "en", setRequestLocale: () => undefined }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: () => true }));
vi.mock("@/lib/platform/repository", () => ({ getPublicDiscoveryEvents: dependencies.read, getAllGames: () => [{ id: "game-flashpeak", name: "Flashpeak", slug: "flashpeak" }, { id: "game-other", name: "Other", slug: "other" }], getPublicEvents: vi.fn() }));
import { workAsyncStorage, type WorkStore } from "next/dist/server/app-render/work-async-storage.external";
import LocalizedEventsPage from "@/app/[locale]/events/page";
import EventsPage from "@/app/events/page";

(globalThis as typeof globalThis & { React: typeof React }).React = React;
type Query = { game?: string | string[]; status?: string | string[] };
const populated: PublicDiscoveryEvent[] = [{ event: { id: "event", slug: "event", name: "Real event", gameId: "game-flashpeak", gameModeId: "5v5", format: "Single Elimination", status: "Finished", participantCap: 16, registrationWindow: "", startsAt: "2026-09-18", venue: "Arena", description: "Competition" }, teamCount: 0, phaseStatus: null, hasLiveMatch: false, updatedAt: "2026-09-18" }];
const cache = new Map<string, { value: unknown; saved: number }>();
const incrementalCache = {
  generateSimpleCacheKey: async (key: string) => key,
  get: async (key: string) => { const entry = cache.get(key); return entry ? { value: entry.value, isStale: Date.now() - entry.saved > 30_000 } : null; },
  set: async (key: string, value: unknown) => { cache.set(key, { value, saved: Date.now() }); },
};
const adapters = [
  ["localized", (query: Query) => LocalizedEventsPage({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve(query) })],
  ["compatibility", (query: Query) => EventsPage({ searchParams: Promise.resolve(query) })],
] as const;
async function renderRoute(adapter: typeof adapters[number][1], query: Query = {}) {
  const store = { route: "/en/events", page: "/en/events/page", isStaticGeneration: false, incrementalCache } as unknown as WorkStore;
  const result = await workAsyncStorage.run(store, () => adapter(query));
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(result);
  return { root, result };
}
beforeEach(() => { cache.clear(); dependencies.read.mockReset().mockResolvedValue(populated); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe.each(adapters)("%s Event Center request adapter", (_name, adapter) => {
  it.each(["rejected", "hung"])("suppresses a populated response after the next database read is %s", async (failure) => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await renderRoute(adapter)).root.querySelectorAll("article")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(31_000);
    dependencies.read.mockImplementation(() => failure === "rejected" ? Promise.reject(new Error("database unavailable")) : new Promise(() => undefined));
    const pending = renderRoute(adapter);
    await vi.advanceTimersByTimeAsync(2_000);
    const { root, result } = await pending;
    expect(result.props.loadState).toBe("error");
    expect(root.querySelector('[role="alert"]')?.textContent).toContain("Event data is temporarily unavailable");
    expect(root.querySelectorAll("article")).toHaveLength(0);
    expect([...root.querySelectorAll(".mpv3-directory-counts strong")].map((count) => count.textContent)).toEqual(["\u2014", "\u2014", "\u2014", "\u2014"]);
    expect(root.textContent).not.toContain("Real event");
  });
  it.each([
    { query: { game: ["unknown", "game-flashpeak", "game-other"], status: ["", "finished", "ongoing"] }, game: "Flashpeak", status: "Finished 1", href: "/en/events?game=game-flashpeak&status=finished", cards: 1 },
    { query: { game: "", status: "unknown" }, game: "All games", status: "All 1", href: "/en/events", cards: 1 },
    { query: { game: ["", "unknown"], status: [] }, game: "All games", status: "All 1", href: "/en/events", cards: 1 },
    { query: { game: ["all", "game-flashpeak"], status: ["all", "finished"] }, game: "All games", status: "All 1", href: "/en/events", cards: 1 },
    { query: { game: "game-other", status: "finished" }, game: "Other", status: "Finished 1", href: "/en/events?game=game-other&status=finished", cards: 0 },
  ])("normalizes URL state $query", async ({ query, game, status, href, cards }) => {
    const { root } = await renderRoute(adapter, query);
    expect(root.querySelector('nav[aria-label="Game filters"] a[aria-current="page"]')?.textContent).toBe(game);
    const selected = root.querySelector('nav[aria-label="Status filters"] a[aria-current="page"]');
    expect(selected?.textContent).toBe(status);
    expect(selected?.getAttribute("href")).toBe(href);
    expect(root.querySelectorAll("article")).toHaveLength(cards);
    expect([...root.querySelectorAll("a[href]")].some((link) => /%2C|,/.test(link.getAttribute("href")!))).toBe(false);
  });
});
