import React from "react";

import { positionLabel } from "@/lib/solo/labels";
import type { SoloQuotaSnapshot } from "@/lib/solo/registration-types";

import { SoloSlotMeter } from "./SoloSlotMeter";

type Locale = "id" | "en";

const COPY = {
  id: {
    capacity: "Slot pemain",
    intro: (position: string) => `Pemain daftar sendiri. Setelah pendaftaran tutup, organizer mengacak pemain jadi tim, masing-masing dengan satu ${position}.`,
    prepareTitle: "Yang perlu disiapkan",
    prepare: "IGN, UID, posisi utama, dan nomor WhatsApp.",
    prepareNote: "UID harus unik di event ini. WhatsApp dilihat teman satu tim setelah tim dikunci.",
    steps: ["Buat akun pemain", "Daftar solo dan pilih posisi", "Bayar kalau kamu dapat slot", "Tunggu hasil acak tim"],
  },
  en: {
    capacity: "Player slots",
    intro: (position: string) => `Players sign up alone. After registration closes, the organizer draws the players into teams, each with one ${position}.`,
    prepareTitle: "What to prepare",
    prepare: "IGN, UID, main position and WhatsApp number.",
    prepareNote: "Your UID must be unique in this event. Teammates see your WhatsApp once teams are locked.",
    steps: ["Create a player account", "Join solo and pick your position", "Pay once you hold a slot", "Wait for the team draw"],
  },
} as const;

export const soloSteps = (locale: Locale): readonly string[] => COPY[locale].steps;

/** The capacity block of a solo event page: the draw in one sentence, then how full each group is. */
export function SoloCapacitySection({ locale, requiredPosition, slots, className }: {
  locale: Locale;
  requiredPosition: string;
  slots: SoloQuotaSnapshot | null;
  className: string;
}) {
  const copy = COPY[locale];
  return <section id="participants" className={className}>
    <h2 className="text-xl font-extrabold">{copy.capacity}</h2>
    <p className="mt-1 mb-5 text-sm text-[var(--color-text-muted)]">{copy.intro(positionLabel(requiredPosition, locale))}</p>
    <SoloSlotMeter locale={locale} requiredPosition={requiredPosition} slots={slots} />
  </section>;
}

/** What a player has to have ready, shown where a team event lists its roster needs. */
export function SoloPrepareCard({ locale }: { locale: Locale }) {
  const copy = COPY[locale];
  return <div className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-7">
    <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{copy.prepareTitle}</h2>
    <p className="mt-3 text-2xl font-extrabold">{copy.prepare}</p>
    <p className="mt-2 text-sm text-[var(--color-text-muted)]">{copy.prepareNote}</p>
  </div>;
}
