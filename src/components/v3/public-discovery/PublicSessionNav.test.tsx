// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session-actions", () => ({ logoutAction: vi.fn() }));

import { PublicSessionNav } from "./PublicSessionNav";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

type MeUser = { name: string; role: string; pendingCount: number };

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const fetchMock = vi.fn();

function respondWith(user: MeUser | null) {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ user }) });
}

async function render(locale: "id" | "en" = "id") {
  await act(async () => {
    root.render(<PublicSessionNav locale={locale} />);
  });
}

function link(name: string) {
  return Array.from(container.querySelectorAll("a")).find((anchor) => anchor.textContent?.trim() === name) ?? null;
}

describe("PublicSessionNav", () => {
  beforeEach(() => {
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

  it("asks /api/me without caching so a stale response never hides a fresh login", async () => {
    respondWith(null);
    await render();
    expect(fetchMock).toHaveBeenCalledWith("/api/me", expect.objectContaining({ cache: "no-store" }));
  });

  it("shows neither login nor logout while the session is still loading", async () => {
    fetchMock.mockReturnValue(new Promise(() => undefined));
    await render();
    expect(link("Masuk")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });

  it("shows the localized login link when nobody is signed in", async () => {
    respondWith(null);
    await render("id");
    expect(link("Masuk")?.getAttribute("href")).toBe("/id/login");
  });

  it("uses English copy and the English login route for the en locale", async () => {
    respondWith(null);
    await render("en");
    expect(link("Sign in")?.getAttribute("href")).toBe("/en/login");
    expect(link("Masuk")).toBeNull();
  });

  it("falls back to the login link when /api/me answers with an error status", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    await render();
    expect(link("Masuk")?.getAttribute("href")).toBe("/id/login");
  });

  it("falls back to the login link when /api/me cannot be reached", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    await render();
    expect(link("Masuk")?.getAttribute("href")).toBe("/id/login");
  });

  describe("captain", () => {
    beforeEach(() => respondWith({ name: "Rendi", role: "captain", pendingCount: 0 }));

    it("links to the captain area and match stats instead of login", async () => {
      await render();
      expect(link("Kapten")?.getAttribute("href")).toBe("/id/captain");
      expect(link("Statistik Match")?.getAttribute("href")).toBe("/id/captain/stats");
      expect(link("Masuk")).toBeNull();
    });

    it("does not offer the admin or organizer areas", async () => {
      await render();
      expect(link("Admin")).toBeNull();
      expect(link("Organizer")).toBeNull();
    });

    it("offers a logout button labelled with the account name", async () => {
      await render();
      const logout = container.querySelector("form button");
      expect(logout?.getAttribute("aria-label")).toBe("Keluar");
      expect(logout?.textContent).toContain("Rendi");
    });

    it("localizes the captain links for the en locale", async () => {
      await render("en");
      expect(link("Captain")?.getAttribute("href")).toBe("/en/captain");
      expect(link("Match stats")?.getAttribute("href")).toBe("/en/captain/stats");
      expect(container.querySelector("form button")?.getAttribute("aria-label")).toBe("Sign out");
    });
  });

  describe("organizer", () => {
    beforeEach(() => respondWith({ name: "Sinta", role: "organizer", pendingCount: 0 }));

    it("links to the organizer workspace and not to the captain area", async () => {
      await render();
      expect(link("Organizer")?.getAttribute("href")).toBe("/id/organizer");
      expect(link("Kapten")).toBeNull();
      expect(link("Statistik Match")).toBeNull();
      expect(link("Masuk")).toBeNull();
    });

    it("offers a logout button labelled with the account name", async () => {
      await render();
      expect(container.querySelector("form button")?.textContent).toContain("Sinta");
    });
  });

  describe.each(["admin", "platform_admin"])("%s", (role) => {
    it("links to the admin area and not to the captain area", async () => {
      respondWith({ name: "Dzul", role, pendingCount: 0 });
      await render();
      expect(link("Admin")?.getAttribute("href")).toBe("/id/admin");
      expect(link("Kapten")).toBeNull();
      expect(link("Masuk")).toBeNull();
    });

    it("shows how many stat submissions are waiting", async () => {
      respondWith({ name: "Dzul", role, pendingCount: 3 });
      await render();
      expect(link("Admin (3)")?.getAttribute("href")).toBe("/id/admin");
    });

    it("shows no count when nothing is waiting", async () => {
      respondWith({ name: "Dzul", role, pendingCount: 0 });
      await render();
      expect(link("Admin")).not.toBeNull();
      expect(link("Admin (0)")).toBeNull();
    });
  });

  it("stops waiting for the session once the page is left", async () => {
    fetchMock.mockReturnValue(new Promise(() => undefined));
    await render();
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    await act(async () => root.unmount());
    expect(signal.aborted).toBe(true);
    root = createRoot(container);
  });
});
