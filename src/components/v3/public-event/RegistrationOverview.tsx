import React from "react";
import type { AdaptivePublicEventViewModel } from "@/lib/events/adaptive-public-event";
import type { AdaptiveEventCopy } from "./PublicEventHero";

function date(value: string | null, locale: "id" | "en", timezone: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", {
    dateStyle: "long", timeStyle: "short", timeZone: timezone,
  }).format(new Date(value));
}

export function RegistrationOverview({ view, locale, copy }: {
  view: AdaptivePublicEventViewModel;
  locale: "id" | "en";
  copy: AdaptiveEventCopy;
}) {
  const percentage = Math.min(100, Math.round((view.registration.occupiedSlots / view.registration.participantCap) * 100));
  const roster = copy.rosterValue.replace("{min}", String(view.registration.minimumRoster)).replace("{max}", String(view.registration.maximumRoster));
  const feeLabel = view.registration.feeLabel
    || (view.registration.feeRequired ? copy.feePaid : copy.feeFree);

  return <div className="grid gap-6">
    <section id="summary" className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-7">
      <h2 className="text-xl font-extrabold">{copy.registrationPeriod}</h2>
      <dl className="mt-5 grid gap-4 sm:grid-cols-2">
        <div><dt className="text-sm text-[var(--color-text-muted)]">{copy.opens}</dt><dd className="mt-1 font-bold">{date(view.registration.opensAt, locale, view.event.timezone)}</dd></div>
        <div><dt className="text-sm text-[var(--color-text-muted)]">{copy.closes}</dt><dd className="mt-1 font-bold">{date(view.registration.closesAt, locale, view.event.timezone)}</dd></div>
      </dl>
    </section>

    <section id="participants" className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-xl font-extrabold">{copy.capacity}</h2><p className="mt-1 text-sm text-[var(--color-text-muted)]">{copy.teamCount.replace("{occupied}", String(view.registration.occupiedSlots)).replace("{cap}", String(view.registration.participantCap))}</p></div>
        <p className="text-2xl font-extrabold text-[var(--color-brand-cyan)]">{view.registration.remainingSlots}</p>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-[var(--color-surface-subtle)]" role="progressbar" aria-valuemin={0} aria-valuemax={view.registration.participantCap} aria-valuenow={view.registration.occupiedSlots}>
        <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-brand-cyan),var(--color-brand-violet))]" style={{ width: `${percentage}%` }} />
      </div>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
        <div><dt className="text-[var(--color-text-muted)]">{copy.activeTeams}</dt><dd className="mt-1 font-bold">{view.registration.activeTeamCount}</dd></div>
        {view.registration.pendingReviewCount > 0 ? <div><dt className="text-[var(--color-text-muted)]">{copy.pendingReview}</dt><dd className="mt-1 font-bold">{view.registration.pendingReviewCount}</dd></div> : null}
        <div><dt className="text-[var(--color-text-muted)]">{copy.remaining}</dt><dd className="mt-1 font-bold">{view.registration.remainingSlots}</dd></div>
      </dl>
    </section>

    <section id="requirements" className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-7">
        <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{copy.fee}</h2>
        <p className="mt-3 text-2xl font-extrabold text-[var(--color-brand-cream)]">{feeLabel}</p>
      </div>
      <div className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-7">
        <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{copy.roster}</h2>
        <p className="mt-3 text-2xl font-extrabold">{roster}</p>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">{copy.uidIgn}</p>
      </div>
    </section>

    <section className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-7">
      <h2 className="text-xl font-extrabold">{copy.howToTitle}</h2>
      <ol className="mt-5 grid gap-3 sm:grid-cols-2">
        {copy.steps.map((step, index) => <li key={step} className="flex min-h-16 items-center gap-3 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--color-brand-violet)] text-sm font-extrabold text-white">{index + 1}</span>
          <span className="font-bold">{step}</span>
        </li>)}
      </ol>
    </section>

    <section className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-7">
      <h2 className="text-xl font-extrabold">{copy.description}</h2>
      <p className="mt-4 whitespace-pre-line text-sm leading-7 text-[var(--color-text-muted)]">{view.event.description}</p>
    </section>
  </div>;
}