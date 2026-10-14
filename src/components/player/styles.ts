/** Shared look of the player area. The panel pages around it use the same plain white cards and cyan accents. */
export const card = "rounded-xl border border-slate-200 bg-white p-5 shadow-sm";
export const muted = "text-sm text-slate-500";
export const linkButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400";
export const primaryButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-cyan-400 px-3.5 py-2.5 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400";
export const field =
  "min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100";

/** How a stage is drawn: the badge colours. Good news is green, a task is amber, bad news is red. */
export const TONES = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  action: "bg-amber-50 text-amber-800 ring-amber-200",
  good: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  bad: "bg-red-50 text-red-700 ring-red-200",
  info: "bg-cyan-50 text-cyan-800 ring-cyan-200",
} as const;

export type Tone = keyof typeof TONES;
