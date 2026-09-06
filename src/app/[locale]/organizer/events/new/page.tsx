import { notFound } from "next/navigation";

import { redirectToActiveLocale } from "@/i18n/redirect";
import { requireAnyRole } from "@/lib/auth/session";
import { createEventV3Action } from "@/lib/actions/event-v3-actions";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getGameModes } from "@/lib/platform/repository";

const inputClass = "min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[var(--color-text)]";
const labelClass = "grid gap-2 text-sm font-bold text-[var(--color-text)]";

export default async function NewEventPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if ((locale !== "id" && locale !== "en") || !isFeatureEnabled("organizer_workspace_v3")) notFound();

  const user = await requireAnyRole(["organizer", "platform_admin", "admin"]);
  if (!user) return redirectToActiveLocale("/login");
  const gameModes = getGameModes();
  const competitionOperationsEnabled = isFeatureEnabled("competition_operations_v3");
  const formatOptions = [
    ["single_elimination", "Single Elimination", "One loss eliminates a team; third-place match included."],
    ...(competitionOperationsEnabled ? [
      ["double_elimination", "Double Elimination", "Upper and lower brackets give teams a second chance."],
      ["round_robin", "Round Robin", "Every team competes in one shared standings table."],
      ["group_playoffs", "Group + Playoffs", "Group standings seed a final elimination bracket."],
    ] : []),
  ];

  return <main className="mx-auto grid min-h-[70vh] w-full max-w-5xl content-center gap-8 px-4 py-10 min-[700px]:px-8">
    <header className="max-w-2xl">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-brand-cream)]">Private draft</p>
      <h1 className="mt-3 text-3xl font-extrabold text-[var(--color-text)]">Create a new event</h1>
      <p className="mt-3 text-[var(--color-text-subtle)]">Start with the event identity and competition shape. Dates, registration, visuals, preview, and publication follow in the workspace.</p>
    </header>
    <form action={createEventV3Action} className="grid gap-6 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 min-[700px]:p-7">
      <input name="locale" type="hidden" value={locale} />
      <div className="grid gap-4 min-[700px]:grid-cols-2">
        <label className={labelClass}>Event name<input autoComplete="off" className={inputClass} minLength={3} name="name" placeholder="Miracle Community Cup" required /></label>
        <label className={labelClass}>Public URL slug<input autoComplete="off" className={inputClass} minLength={3} name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="miracle-community-cup" required /></label>
        <label className={labelClass}>Game mode<select className={inputClass} defaultValue={gameModes[0]?.id} name="gameModeId" required>{gameModes.map((mode) => <option key={mode.id} value={mode.id}>{mode.name}</option>)}</select></label>
        <label className={labelClass}>Participant capacity<select className={inputClass} defaultValue="16" name="participantCap">{[8, 12, 16, 24, 32, 64, 128, 256].map((cap) => <option key={cap} value={cap}>{cap} teams</option>)}</select></label>
      </div>
      <fieldset className="grid gap-3">
        <legend className="text-sm font-bold text-[var(--color-text)]">Competition format</legend>
        <div className="grid gap-3 min-[700px]:grid-cols-2">
          {formatOptions.map(([value, title, description], index) => <label className="grid cursor-pointer grid-cols-[auto_1fr] gap-x-3 gap-y-1 border border-[var(--color-border)] p-4" key={value}>
            <input className="row-span-2 mt-1" defaultChecked={index === 0} name="formatKind" required type="radio" value={value} />
            <span className="font-extrabold text-[var(--color-text)]">{title}</span>
            <span className="text-sm text-[var(--color-text-subtle)]">{description}</span>
          </label>)}
        </div>
      </fieldset>
      <div className="flex justify-end border-t border-[var(--color-border)] pt-5">
        <button className="min-h-11 bg-[var(--color-brand-violet)] px-5 font-extrabold text-white" type="submit">Create private draft</button>
      </div>
    </form>
  </main>;
}
