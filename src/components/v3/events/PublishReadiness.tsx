"use client";

import { useState, useTransition } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";

import { publishEventV3Action } from "@/lib/actions/event-v3-actions";
import type { PublishReadiness as PublishReadinessResult } from "@/lib/events/publish-readiness";

type PublishReadinessProps = {
  eventId?: string;
  publishEvent?: typeof publishEventV3Action;
  readiness: PublishReadinessResult;
};

const sectionLabels = {
  identity: "Identity",
  schedule: "Schedule",
  registration: "Registration",
  organizer: "Organizer contact",
} as const;

const blockerLabels: Record<string, string> = {
  name: "Add an event name",
  slug: "Add a public URL slug",
  description: "Add an event description",
  gameId: "Choose a game",
  gameModeId: "Choose a game mode",
  format_config: "Choose a competition format",
  format_config_mismatch: "Re-select the competition format",
  group_allocation: "Adjust group and qualifier counts",
  registrationOpensAt: "Set registration opening time",
  registrationClosesAt: "Set registration closing time",
  registration_date_order: "Place registration closing after opening",
  eventStartsAt: "Set the event start time",
  timezone: "Choose a timezone",
  venue: "Add a venue or online location",
  registrationFeeRequired: "Choose whether registration is paid",
  registration_fee_amount: "Add the registration fee amount",
  organizer_contact: "Add an organizer contact channel",
};

export function PublishReadiness({ eventId, publishEvent = publishEventV3Action, readiness }: PublishReadinessProps) {
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const grouped = Object.entries(sectionLabels).map(([section, label]) => ({
    section,
    label,
    items: readiness.incomplete.filter((item) => item.section === section),
  })).filter((group) => group.items.length);

  function publish() {
    if (!eventId || !readiness.ready) return;
    setResultMessage(null);
    startTransition(async () => {
      try {
        const result = await publishEvent({ eventId });
        if (result.status === "published" || result.status === "already_published") setResultMessage("Published");
        else if (result.status === "blocked") setResultMessage("Event details changed. Review the remaining requirements.");
        else setResultMessage("Publication could not be completed. Refresh and try again.");
      } catch {
        setResultMessage("Publication failed. Try again.");
      }
    });
  }

  return <section aria-labelledby="publish-heading" className="grid gap-4">
    <div className="flex items-start gap-3">
      {readiness.ready
        ? <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 text-[var(--color-success)]" />
        : <AlertCircle aria-hidden="true" className="mt-0.5 h-5 w-5 text-[var(--color-warning)]" />}
      <div>
        <h2 className="font-extrabold text-[var(--color-text)]" id="publish-heading">
          {readiness.ready ? "Ready to publish" : "Complete before publishing"}
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-subtle)]">
          {readiness.ready ? "All required event information is complete." : `${readiness.incomplete.length} required item${readiness.incomplete.length === 1 ? "" : "s"} remaining.`}
        </p>
      </div>
    </div>
    {grouped.map((group) => <div key={group.section}>
      <h3 className="text-xs font-extrabold uppercase text-[var(--color-text-muted)]">{group.label}</h3>
      <ul className="mt-2 grid gap-1 text-sm text-[var(--color-text)]">
        {group.items.map((item) => <li key={`${item.field}:${item.code}`}>
          <a className="underline decoration-[var(--color-border-strong)] underline-offset-4" href={`#section-${group.section}`}>
            {blockerLabels[item.code] ?? "Complete this required field"}
          </a>
        </li>)}
      </ul>
    </div>)}
    {readiness.notices.some((notice) => notice.code === "schedule_overlap") && <p className="text-sm text-[var(--color-text-subtle)]">
      Another event is scheduled on the same WIB day. This does not block publishing.
    </p>}
    <button
      className="min-h-11 rounded-[var(--radius-control)] bg-[var(--color-action)] px-4 text-sm font-extrabold text-[var(--color-action-text)] disabled:cursor-not-allowed disabled:opacity-50"
      disabled={!readiness.ready || !eventId || pending}
      onClick={publish}
      type="button"
    >Publish event</button>
    {resultMessage && <p aria-live="polite" role="status" className="text-sm font-semibold text-[var(--color-text)]">{resultMessage}</p>}
  </section>;
}