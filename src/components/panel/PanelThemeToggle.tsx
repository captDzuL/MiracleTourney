"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import {
  DEFAULT_PANEL_THEME_MODE,
  PANEL_THEME_ATTRIBUTE,
  PANEL_THEME_CHANGE_EVENT,
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

export function PanelThemeToggle({ variant = "legacy" }: { variant?: "legacy" | "v3" }) {
  const t = useTranslations("panelTheme");
  const [mode, setMode] = useState<PanelThemeMode>(DEFAULT_PANEL_THEME_MODE);
  const [hydrated, setHydrated] = useState(false);
  const v3 = variant === "v3";

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

  function choose(next: PanelThemeMode) {
    setMode(next);
    let persisted = false;
    try {
      window.localStorage.setItem(PANEL_THEME_STORAGE_KEY, next);
      persisted = true;
    } catch {
      // Preference simply will not persist; the current page still switches.
    }
    document.documentElement.setAttribute(
      PANEL_THEME_ATTRIBUTE,
      resolvePanelTheme(next, window.matchMedia(PREFERS_DARK_QUERY).matches),
    );
    if (persisted) window.dispatchEvent(new Event(PANEL_THEME_CHANGE_EVENT));
  }

  return (
    <div
      className={v3
        ? "inline-flex items-center gap-0.5 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-0.5"
        : "inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5"}
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
              v3
                ? "miracle-focus-ring inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors"
                : "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
              v3
                ? active
                  ? "bg-[var(--color-surface-selected)] text-[var(--color-text)]"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
                : active
                  ? "bg-slate-900 text-white"
                  : "text-slate-500 hover:text-slate-800",
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
