"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import {
  DEFAULT_PANEL_THEME_MODE,
  PANEL_THEME_ATTRIBUTE,
  PANEL_THEME_MODES,
  PANEL_THEME_STORAGE_KEY,
  PREFERS_DARK_QUERY,
  resolvePanelTheme,
  toPanelThemeMode,
  type PanelThemeMode,
} from "@/lib/theme/panel-theme";

const ICONS: Record<PanelThemeMode, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

export function PanelThemeToggle() {
  const t = useTranslations("panelTheme");

  // The first client render must match the server render, so start on the
  // default and adopt the stored value in an effect.
  const [mode, setMode] = useState<PanelThemeMode>(DEFAULT_PANEL_THEME_MODE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(PANEL_THEME_STORAGE_KEY);
    } catch {
      // Storage can be blocked entirely; the default is still usable.
    }
    setMode(toPanelThemeMode(stored));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    const media = window.matchMedia(PREFERS_DARK_QUERY);
    const apply = () => {
      document.documentElement.setAttribute(
        PANEL_THEME_ATTRIBUTE,
        resolvePanelTheme(mode, media.matches),
      );
    };

    apply();
    if (mode !== "system") return;

    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [hydrated, mode]);

  function choose(next: PanelThemeMode) {
    setMode(next);
    try {
      window.localStorage.setItem(PANEL_THEME_STORAGE_KEY, next);
    } catch {
      // Preference simply will not persist; the current page still switches.
    }
  }

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-0.5"
      role="group"
      aria-label={t("label")}
    >
      {PANEL_THEME_MODES.map((option) => {
        const Icon = ICONS[option];
        const active = hydrated && mode === option;

        return (
          <button
            key={option}
            type="button"
            onClick={() => choose(option)}
            aria-pressed={active}
            title={t(option)}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors miracle-focus-ring",
              active
                ? "bg-[var(--color-surface-selected)] text-[var(--color-text)]"
                : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{t(option)}</span>
          </button>
        );
      })}
    </div>
  );
}
