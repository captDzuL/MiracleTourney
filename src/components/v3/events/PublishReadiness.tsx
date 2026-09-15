"use client";
import { getEventEditorTranslator } from "./event-editor-translations";

import { useState, useTransition } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";

import { publishEventV3Action } from "@/lib/actions/event-v3-actions";
import type { PublishReadiness as PublishReadinessResult } from "@/lib/events/publish-readiness";

type PublishReadinessProps = {
  locale?: "id" | "en";
  eventId?: string;
  publishEvent?: typeof publishEventV3Action;
  readiness: PublishReadinessResult;
  organizerSection?: "organizer" | "review";
};

export function PublishReadiness({ locale = "en", eventId, publishEvent = publishEventV3Action, readiness, organizerSection = "organizer" }: PublishReadinessProps) {
  const t = getEventEditorTranslator(locale);
const sectionLabels = {
  identity: t("readinessIdentity"),
  schedule: t("readinessSchedule"),
  registration: t("readinessRegistration"),
  organizer: t("readinessContact"),
} as const;

const blockerLabels: Record<string, string> = {
  name: t("requiredName"),
  slug: t("requiredSlug"),
  description: t("requiredDescription"),
  gameId: t("requiredGame"),
  gameModeId: t("requiredMode"),
  format_config: t("requiredFormat"),
  format_config_mismatch: t("requiredFormatMismatch"),
  group_allocation: t("requiredGroups"),
  registrationOpensAt: t("requiredOpens"),
  registrationClosesAt: t("requiredCloses"),
  registration_date_order: t("requiredOrder"),
  eventStartsAt: t("requiredStarts"),
  timezone: t("requiredTimezone"),
  venue: t("requiredVenue"),
  registrationFeeRequired: t("requiredPaid"),
  registration_fee_amount: t("requiredFee"),
  organizer_contact: t("requiredContact"),
};


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
        if (result.status === "published" || result.status === "already_published") setResultMessage(t("published"));
        else if (result.status === "blocked") setResultMessage(t("publicationChanged"));
        else setResultMessage(t("publicationRetry"));
      } catch {
        setResultMessage(t("publicationFailed"));
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
          {readiness.ready ? t("readyToPublish") : t("completeBeforePublish")}
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-subtle)]">
          {readiness.ready ? t("allComplete") : t("remaining", { count: readiness.incomplete.length })}
        </p>
      </div>
    </div>
    {grouped.map((group) => <div key={group.section}>
      <h3 className="text-xs font-extrabold uppercase text-[var(--color-text-muted)]">{group.label}</h3>
      <ul className="mt-2 grid gap-1 text-sm text-[var(--color-text)]">
        {group.items.map((item) => <li key={`${item.field}:${item.code}`}>
          <a className="underline decoration-[var(--color-border-strong)] underline-offset-4" href={`#section-${group.section === "organizer" ? organizerSection : group.section}`}>
            {blockerLabels[item.code] ?? t("requiredField")}
          </a>
        </li>)}
      </ul>
    </div>)}
    {readiness.notices.some((notice) => notice.code === "schedule_overlap") && <p className="text-sm text-[var(--color-text-subtle)]">
      {t("scheduleOverlap")}
    </p>}
    <button
      className="min-h-11 rounded-[var(--radius-control)] bg-[var(--color-action)] px-4 text-sm font-extrabold text-[var(--color-action-text)] disabled:cursor-not-allowed disabled:opacity-50"
      disabled={!readiness.ready || !eventId || pending}
      onClick={publish}
      type="button"
    >{t("publishEvent")}</button>
    {resultMessage && <p aria-live="polite" role="status" className="text-sm font-semibold text-[var(--color-text)]">{resultMessage}</p>}
  </section>;
}
