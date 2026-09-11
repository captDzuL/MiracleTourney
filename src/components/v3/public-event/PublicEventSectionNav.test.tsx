// @vitest-environment jsdom

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

import { PublicEventSectionNav } from "./PublicEventSectionNav";

const labels = {
  summary: "Ringkasan",
  participants: "Peserta",
  requirements: "Persyaratan",
  organizer: "Organizer",
};

let observerCallback: IntersectionObserverCallback;
const observe = vi.fn();
const disconnect = vi.fn();

class IntersectionObserverStub {
  constructor(callback: IntersectionObserverCallback) {
    observerCallback = callback;
  }
  observe = observe;
  disconnect = disconnect;
  unobserve = vi.fn();
  takeRecords = vi.fn(() => []);
  root = null;
  rootMargin = "";
  thresholds = [];
}

describe("PublicEventSectionNav", () => {
  let container: HTMLDivElement;
  let root: Root;
  let targets: HTMLElement[];
  const scrollIntoView = vi.fn();
  const horizontalScroll = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/id/events/test-event");
    vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    });
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: horizontalScroll,
    });
    targets = Object.keys(labels).map((id) => {
      const target = document.createElement("section");
      target.id = id;
      document.body.append(target);
      return target;
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    targets.forEach((target) => target.remove());
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function renderNav() {
    await act(async () => root.render(<PublicEventSectionNav ariaLabel="Navigasi bagian event" labels={labels} />));
  }

  it("marks Ringkasan as the default current section", async () => {
    await renderNav();

    expect(container.querySelector("nav")?.getAttribute("aria-label")).toBe("Navigasi bagian event");
    expect(container.querySelector("nav")?.innerHTML).toContain("focus-visible:ring-offset-[var(--color-bg)]");
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(container.querySelector('a[href="#summary"]')?.getAttribute("aria-current")).toBe("location");
    expect(container.querySelectorAll('[aria-current="location"]')).toHaveLength(1);
  });

  it("restores a valid section from the initial URL hash", async () => {
    window.history.replaceState({}, "", "/id/events/test-event#participants");
    await renderNav();

    expect(container.querySelector('a[href="#participants"]')?.getAttribute("aria-current")).toBe("location");
  });

  it("activates and highlights the clicked destination while updating the hash", async () => {
    await renderNav();
    const link = container.querySelector<HTMLAnchorElement>('a[href="#requirements"]')!;

    await act(async () => link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));

    expect(link.getAttribute("aria-current")).toBe("location");
    expect(window.location.hash).toBe("#requirements");
    expect(document.getElementById("requirements")?.dataset.sectionHighlighted).toBe("true");
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }));
  });

  it("keeps an explicit click active while the destination scroll settles", async () => {
    await renderNav();
    const requirementsLink = container.querySelector<HTMLAnchorElement>('a[href="#requirements"]')!;
    const summary = document.getElementById("summary")!;

    await act(async () => requirementsLink.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
    await act(async () => observerCallback([
      { isIntersecting: true, target: summary, boundingClientRect: { top: 120 } } as unknown as IntersectionObserverEntry,
    ], {} as IntersectionObserver));

    expect(requirementsLink.getAttribute("aria-current")).toBe("location");
  });

  it("follows the section reported by IntersectionObserver", async () => {
    await renderNav();
    const organizer = document.getElementById("organizer")!;

    await act(async () => observerCallback([
      { isIntersecting: true, target: organizer, boundingClientRect: { top: 120 } } as unknown as IntersectionObserverEntry,
    ], {} as IntersectionObserver));

    expect(container.querySelector('a[href="#organizer"]')?.getAttribute("aria-current")).toBe("location");
  });

  it("restores the destination position when browser history changes the hash", async () => {
    await renderNav();
    scrollIntoView.mockClear();
    window.history.pushState({}, "", "#participants");

    await act(async () => window.dispatchEvent(new PopStateEvent("popstate")));

    expect(container.querySelector('a[href="#participants"]')?.getAttribute("aria-current")).toBe("location");
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
  });
  it("keeps the active item visible inside the horizontal navigation", async () => {
    await renderNav();
    horizontalScroll.mockClear();
    const organizer = document.getElementById("organizer")!;

    await act(async () => observerCallback([
      { isIntersecting: true, target: organizer, boundingClientRect: { top: 120 } } as unknown as IntersectionObserverEntry,
    ], {} as IntersectionObserver));

    expect(horizontalScroll).toHaveBeenCalledWith(expect.objectContaining({ behavior: "auto", left: expect.any(Number) }));
  });
  it("uses immediate scrolling when reduced motion is requested", async () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
    await renderNav();

    await act(async () => container.querySelector<HTMLAnchorElement>('a[href="#participants"]')!
      .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));

    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ behavior: "auto" }));
  });
});
