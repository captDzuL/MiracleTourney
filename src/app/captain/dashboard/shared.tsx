// Class names and small pieces shared by the captain dashboard sections.
// Moved out of page.tsx without changes (refactor Phase 4, 4b-captain).

import { gameModes } from "@/lib/platform/config";

export type TFn = (key: string, values?: Record<string, string | number>) => string;

// A draft team has no event yet, so it has no game mode; offer every known position (position is optional free text).
export const DRAFT_POSITION_OPTIONS = [...new Set(gameModes.flatMap((mode) => mode.positions))];

export const inputClass = "rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100";

export const labelClass = "grid gap-2 text-sm font-medium text-slate-700";

export const quietButton = "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400";

export const primaryButton = "inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-400 px-3.5 py-2.5 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400";

export const dangerButton = "inline-flex items-center justify-center rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400";

export function Notice({ children, tone }: { children: React.ReactNode; tone: "success" | "warning" | "danger" }) {
  const toneClass = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    danger: "border-red-200 bg-red-50 text-red-700",
  }[tone];

  return (
    <div className={`rounded-xl border px-4 py-3 text-sm font-medium shadow-sm ${toneClass}`}>
      {children}
    </div>
  );
}

export function avatarTone(position?: string) {

  if (position === "Guard") return "bg-cyan-100 text-cyan-800";

  if (position === "Forward" || position === "Midfielder") return "bg-emerald-100 text-emerald-800";

  return "bg-slate-100 text-slate-800";

}
