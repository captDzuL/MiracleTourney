import React from "react";

import type { SlotCounts } from "@/lib/solo/registration-types";

const COPY = {
  id: {
    title: "Tim belum dibentuk",
    body: "Tim dibentuk lewat acak setelah pendaftaran ditutup. Daftar pemain muncul di sini setelah tim dikunci.",
    filled: (held: number, quota: number) => `${held} dari ${quota} slot pemain terisi`,
    queue: (count: number) => `${count} di antrean`,
  },
  en: {
    title: "Teams are not formed yet",
    body: "Teams are formed by a random draw after registration closes. The players appear here once the teams are locked.",
    filled: (held: number, quota: number) => `${held} of ${quota} player slots filled`,
    queue: (count: number) => `${count} in the queue`,
  },
} as const;

/** Shown on the public participants page of a solo event until its teams exist. Lists no names. */
export function SoloPendingTeamsNote({ locale, totals }: { locale: "id" | "en"; totals: SlotCounts | null }) {
  const copy = COPY[locale];
  return <div className="grid gap-2 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-7" data-solo-pending-teams>
    <h2 className="text-xl font-extrabold">{copy.title}</h2>
    <p className="text-sm text-[var(--color-text-muted)]">{copy.body}</p>
    {totals ? <p className="text-sm font-bold text-[var(--color-brand-cyan)]">
      {copy.filled(totals.held, totals.quota)}{totals.queued > 0 ? ` · ${copy.queue(totals.queued)}` : ""}
    </p> : null}
  </div>;
}
