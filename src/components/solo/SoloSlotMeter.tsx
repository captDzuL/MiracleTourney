import React from "react";

import { positionLabel } from "@/lib/solo/labels";
import type { SlotCounts, SoloQuotaSnapshot } from "@/lib/solo/registration-types";

const COPY = {
  id: {
    fieldPlayers: "Pemain lapangan",
    filled: (held: number, quota: number) => `${held} dari ${quota} terisi`,
    full: "Penuh",
    queue: (count: number) => `${count} di antrean`,
    queueNote: "Kalau penuh, kamu masuk antrean dan belum perlu bayar.",
    unavailable: "Jumlah slot belum bisa ditampilkan.",
  },
  en: {
    fieldPlayers: "Field players",
    filled: (held: number, quota: number) => `${held} of ${quota} filled`,
    full: "Full",
    queue: (count: number) => `${count} in the queue`,
    queueNote: "If it is full, you join the queue and do not pay yet.",
    unavailable: "Slot counts are not available right now.",
  },
} as const;

type MeterProps = {
  locale: "id" | "en";
  requiredPosition: string;
  slots: SoloQuotaSnapshot | null;
};

function Row({ label, counts, locale }: { label: string; counts: SlotCounts; locale: "id" | "en" }) {
  const copy = COPY[locale];
  const filled = copy.filled(counts.held, counts.quota);
  const percentage = counts.quota > 0 ? Math.min(100, Math.round((counts.held / counts.quota) * 100)) : 0;
  const isFull = counts.held >= counts.quota;
  return <li className="grid gap-2">
    <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
      <span className="font-bold text-[var(--color-text)]">{label}</span>
      <span className="text-[var(--color-text-muted)]">
        {filled}
        {isFull ? <> · <b className="text-[var(--color-brand-cream)]">{copy.full}</b></> : null}
        {counts.queued > 0 ? <> · {copy.queue(counts.queued)}</> : null}
      </span>
    </div>
    <div
      aria-label={`${label}: ${filled}`}
      aria-valuemax={counts.quota}
      aria-valuemin={0}
      aria-valuenow={counts.held}
      className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-subtle)]"
      role="progressbar"
    >
      <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-brand-cyan),var(--color-brand-violet))]" style={{ width: `${percentage}%` }} />
    </div>
  </li>;
}

/** How full the two groups of a solo event are: the required position, and everyone else. */
export function SoloSlotMeter({ locale, requiredPosition, slots }: MeterProps) {
  const copy = COPY[locale];
  if (!slots) return <p className="text-sm text-[var(--color-text-muted)]">{copy.unavailable}</p>;

  const anyFull = slots.required.held >= slots.required.quota || slots.open.held >= slots.open.quota;
  return <div className="grid gap-3" data-solo-slots>
    <ul className="grid gap-4">
      <Row counts={slots.required} label={positionLabel(requiredPosition, locale)} locale={locale} />
      <Row counts={slots.open} label={copy.fieldPlayers} locale={locale} />
    </ul>
    {anyFull ? <p className="text-sm text-[var(--color-text-muted)]">{copy.queueNote}</p> : null}
  </div>;
}
