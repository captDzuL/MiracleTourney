// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PanelThemeSync } from "@/components/panel/PanelThemeSync";
import {
  PANEL_THEME_ATTRIBUTE,
  PANEL_THEME_CHANGE_EVENT,
  PANEL_THEME_STORAGE_KEY,
  PREFERS_DARK_QUERY,
} from "@/lib/theme/panel-theme";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

describe("PanelThemeSync", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let prefersDark = false;
  let mediaListener: (() => void) | undefined;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    window.localStorage.clear();
    document.documentElement.removeAttribute(PANEL_THEME_ATTRIBUTE);
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
      get matches() { return prefersDark; },
      media: query,
      addEventListener: vi.fn((_event: string, listener: () => void) => { mediaListener = listener; }),
      removeEventListener: vi.fn(),
    })));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("keeps system mode synchronized while routes change and reacts to same-tab preference changes", async () => {
    window.localStorage.setItem(PANEL_THEME_STORAGE_KEY, "system");
    await act(async () => root.render(<PanelThemeSync />));
    expect(window.matchMedia).toHaveBeenCalledWith(PREFERS_DARK_QUERY);
    expect(document.documentElement.getAttribute(PANEL_THEME_ATTRIBUTE)).toBe("light");

    prefersDark = true;
    await act(async () => mediaListener?.());
    expect(document.documentElement.getAttribute(PANEL_THEME_ATTRIBUTE)).toBe("dark");

    window.localStorage.setItem(PANEL_THEME_STORAGE_KEY, "light");
    await act(async () => window.dispatchEvent(new Event(PANEL_THEME_CHANGE_EVENT)));
    expect(document.documentElement.getAttribute(PANEL_THEME_ATTRIBUTE)).toBe("light");
  });
});
