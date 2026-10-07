"use client";

import { useEffect } from "react";

import {
  PANEL_THEME_ATTRIBUTE,
  PANEL_THEME_CHANGE_EVENT,
  PANEL_THEME_STORAGE_KEY,
  PREFERS_DARK_QUERY,
  resolvePanelTheme,
  toPanelThemeMode,
} from "@/lib/theme/panel-theme";

/** Keeps the resolved theme current across public and operator client routes. */
export function PanelThemeSync() {
  useEffect(() => {
    const media = window.matchMedia(PREFERS_DARK_QUERY);
    let removeMediaListener = () => {};

    const synchronize = () => {
      removeMediaListener();
      let stored: string | null = null;
      try {
        stored = window.localStorage.getItem(PANEL_THEME_STORAGE_KEY);
      } catch {
        // Storage can be unavailable; the shared dark default still applies.
      }
      const mode = toPanelThemeMode(stored);
      const apply = () => document.documentElement.setAttribute(
        PANEL_THEME_ATTRIBUTE,
        resolvePanelTheme(mode, media.matches),
      );
      apply();
      if (mode === "system") {
        media.addEventListener("change", apply);
        removeMediaListener = () => media.removeEventListener("change", apply);
      } else {
        removeMediaListener = () => {};
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === PANEL_THEME_STORAGE_KEY) synchronize();
    };
    synchronize();
    window.addEventListener(PANEL_THEME_CHANGE_EVENT, synchronize);
    window.addEventListener("storage", onStorage);
    return () => {
      removeMediaListener();
      window.removeEventListener(PANEL_THEME_CHANGE_EVENT, synchronize);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return null;
}
