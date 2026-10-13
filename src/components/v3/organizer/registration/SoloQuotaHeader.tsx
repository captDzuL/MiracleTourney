import React from "react";
import { useTranslations } from "next-intl";

import { positionLabel } from "@/lib/solo/labels";
import type { SoloEventSummary } from "@/lib/solo/organizer-read";
import type { SlotCounts } from "@/lib/solo/registration-types";

import { muted, panel } from "./shared";

function Meter({ label, counts }: { label: string; counts: SlotCounts }) {
  const t = useTranslations("registrationWorkspace");
  const percent = counts.quota > 0 ? Math.min(100, Math.round((counts.held / counts.quota) * 100)) : 0;
  return (
    <li className="grid min-w-0 gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <strong className="break-words">{label}</strong>
        <span className={muted}>
          {t("solo.quota.held", { held: counts.held, quota: counts.quota })}
          {counts.queued > 0 ? ` · ${t("solo.quota.queued", { count: counts.queued })}` : ""}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={counts.quota}
        aria-valuenow={counts.held}
        className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-subtle)]"
      >
        <div className="h-full rounded-full bg-[var(--color-brand-cyan)]" style={{ width: `${percent}%` }} />
      </div>
    </li>
  );
}

/** Slots taken and waiting for the required position and for everyone else, shown above every list of a solo event. */
export function SoloQuotaHeader({ locale, summary }: { locale: "id" | "en"; summary: SoloEventSummary }) {
  const t = useTranslations("registrationWorkspace");
  return (
    <section aria-labelledby="solo-quota-title" className={panel}>
      <h2 id="solo-quota-title" style={{ fontFamily: "var(--font-miracle-v3)" }} className="mb-4 text-lg font-extrabold">
        {t("solo.quota.title")}
      </h2>
      <ul className="grid gap-4 sm:grid-cols-2">
        <Meter label={positionLabel(summary.requiredPosition, locale)} counts={summary.quota.required} />
        <Meter label={t("solo.quota.field")} counts={summary.quota.open} />
      </ul>
    </section>
  );
}
