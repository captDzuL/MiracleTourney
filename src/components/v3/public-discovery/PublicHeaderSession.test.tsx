// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Game } from "@/lib/platform/types";

vi.mock("@/lib/session-actions", () => ({ logoutAction: vi.fn() }));
vi.mock("@/components/ShareButton", () => ({ ShareButton: () => null }));
vi.mock("@/components/v3/public-event/RegistrationEntryCta", () => ({ RegistrationEntryCta: () => null }));

import { PublicDiscoveryHomeV3 } from "./PublicDiscoveryV3";
import { EventDirectory } from "./EventDirectory";
import { PublicV3EventPage } from "@/components/v3/public-event/PublicV3EventPage";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

/**
 * The home page, the event directory and the event overview each render their
 * own PublicV3Frame, so none of them inherit the session-aware app shell. These
 * tests pin that every one of them still reflects who is signed in.
 */
const games = [{ id: "game-flashpeak", slug: "flashpeak", name: "Flashpeak" }] as Game[];

const surfaces = {
  "home page": { render: () => <PublicDiscoveryHomeV3 locale="id" entries={[]} games={games} gameFilter="all" loadState="ready" featuredView={null} />, publicLink: "Semua event" },
  "event directory": { render: () => <EventDirectory locale="id" entries={[]} games={games} filters={{ game: "all", status: "all" }} loadState="ready" />, publicLink: "Semua event" },
  "event overview": { render: () => <PublicV3EventPage view={null} locale="id" error />, publicLink: "Event Center" },
} as const;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const fetchMock = vi.fn();

function signedInAs(user: { name: string; role: string; pendingCount: number } | null) {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ user }) });
}

function header() {
  return container.querySelector("header") as HTMLElement;
}

function headerLink(name: string) {
  return Array.from(header().querySelectorAll("a")).find((anchor) => anchor.textContent?.trim() === name) ?? null;
}

describe.each(Object.entries(surfaces))("%s header", (_name, { render: surface, publicLink }) => {
  beforeEach(async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  async function render() {
    await act(async () => {
      root.render(surface());
    });
  }

  it("offers login to a visitor who is not signed in", async () => {
    signedInAs(null);
    await render();
    expect(headerLink("Masuk")?.getAttribute("href")).toBe("/id/login");
  });

  it("does not offer login to a signed-in captain and shows the captain links instead", async () => {
    signedInAs({ name: "Rendi", role: "captain", pendingCount: 0 });
    await render();
    expect(headerLink("Masuk")).toBeNull();
    expect(headerLink("Kapten")?.getAttribute("href")).toBe("/id/captain");
    expect(headerLink("Statistik Match")?.getAttribute("href")).toBe("/id/captain/stats");
    expect(header().querySelector("form button")?.textContent).toContain("Rendi");
  });

  it("shows the organizer workspace to a signed-in organizer", async () => {
    signedInAs({ name: "Sinta", role: "organizer", pendingCount: 0 });
    await render();
    expect(headerLink("Masuk")).toBeNull();
    expect(headerLink("Organizer")?.getAttribute("href")).toBe("/id/organizer");
    expect(headerLink("Kapten")).toBeNull();
  });

  it("shows the admin area with the pending count to a signed-in admin", async () => {
    signedInAs({ name: "Dzul", role: "platform_admin", pendingCount: 2 });
    await render();
    expect(headerLink("Masuk")).toBeNull();
    expect(headerLink("Admin (2)")?.getAttribute("href")).toBe("/id/admin");
  });

  it("keeps the public navigation next to the session links", async () => {
    signedInAs({ name: "Rendi", role: "captain", pendingCount: 0 });
    await render();
    expect(headerLink("Beranda")).not.toBeNull();
    expect(headerLink(publicLink)).not.toBeNull();
  });
});
