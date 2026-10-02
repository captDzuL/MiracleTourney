import React from "react";
import type { PublicV3RegistrationEventViewModel, PublicV3Locale } from "@/lib/events/public-v3-types";
import { PublicV3EmptyState, PublicV3SectionHeading } from "@/components/v3/public-discovery/PublicV3Primitives";
import { dateLabel } from "../PublicV3EventHero";

const copy = {
  id: {
    eyebrow: "PHASE 01 / REGISTRATION",
    title: "Daftar sebelum slot penuh",
    description: "Kapasitas, biaya, dan kebutuhan roster mengikuti data event yang tersimpan.",
    deadline: "Periode pendaftaran",
    opens: "Dibuka",
    closes: "Ditutup",
    capacity: "Kapasitas peserta",
    capacityProgress: "{occupied} dari {cap} slot terisi",
    accepted: "Peserta diterima",
    pending: "Menunggu review",
    remaining: "Slot tersisa",
    fee: "Biaya pendaftaran",
    free: "Gratis",
    paid: "Berbayar",
    roster: "Roster",
    rosterHint: "Minimum {min} dan maksimum {max} pemain",
    agenda: "Agenda",
    agendaHint: "Agenda dan waktu pertandingan diterbitkan setelah drawing resmi.",
    bracket: "Template bracket",
    bracketHint: "Posisi belum ditentukan. Semua slot tetap TBD sampai organizer menerbitkan drawing.",
    tbd: "TBD",
    noDates: "Tanggal belum diterbitkan",
  },
  en: {
    eyebrow: "PHASE 01 / REGISTRATION",
    title: "Register before capacity fills",
    description: "Capacity, fees, and roster requirements come from the saved event record.",
    deadline: "Registration window",
    opens: "Opens",
    closes: "Closes",
    capacity: "Participant capacity",
    capacityProgress: "{occupied} of {cap} slots filled",
    accepted: "Accepted participants",
    pending: "Pending review",
    remaining: "Slots remaining",
    fee: "Registration fee",
    free: "Free",
    paid: "Paid",
    roster: "Roster",
    rosterHint: "Minimum {min} and maximum {max} players",
    agenda: "Agenda",
    agendaHint: "The agenda and match times are published after the official drawing.",
    bracket: "Bracket template",
    bracketHint: "Positions are not assigned yet. Every slot stays TBD until the organizer publishes the drawing.",
    tbd: "TBD",
    noDates: "Dates have not been published",
  },
} as const;

function date(value: string | null, locale: PublicV3Locale, timezone: string, fallback: string) {
  return value ? dateLabel(value, locale, timezone) : fallback;
}

export function RegistrationOverview({ view, locale }: { view: PublicV3RegistrationEventViewModel; locale: PublicV3Locale }) {
  const t = copy[locale];
  const { registration } = view;
  const occupied = registration.occupiedSlots;
  const cap = registration.participantCap;
  const progress = cap > 0 ? Math.min(100, Math.round((occupied / cap) * 100)) : 0;
  const roster = t.rosterHint.replace("{min}", String(registration.minimumRoster)).replace("{max}", String(registration.maximumRoster));
  const fee = registration.feeLabel || (registration.feeRequired ? t.paid : t.free);
  return <div className="mpv3-stack" data-lifecycle-overview="registration">
    <section className="mpv3-section mpv3-panel mpv3-panel-pad">
      <PublicV3SectionHeading eyebrow={t.eyebrow} title={t.title} description={t.description} />
      <div className="mpv3-split">
        <div><p className="mpv3-eyebrow">{t.deadline}</p><dl className="mt-3 grid gap-2 text-sm"><div><dt className="mpv3-muted">{t.opens}</dt><dd>{date(registration.opensAt, locale, view.identity.facts.timezone, t.noDates)}</dd></div><div><dt className="mpv3-muted">{t.closes}</dt><dd>{date(registration.closesAt, locale, view.identity.facts.timezone, t.noDates)}</dd></div></dl></div>
        <div><p className="mpv3-eyebrow">{t.capacity}</p><p className="mt-3 text-3xl font-bold tabular-nums">{occupied} / {cap || t.tbd}</p><p className="mt-1 text-sm">{t.capacityProgress.replace("{occupied}", String(occupied)).replace("{cap}", String(cap || t.tbd))}</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--mpv3-inset)]" role="progressbar" aria-valuemin={0} aria-valuemax={cap} aria-valuenow={occupied}><span className="block h-full rounded-full bg-[var(--mpv3-cyan)]" style={{ width: `${progress}%` }} /></div></div>
      </div>
      <dl className="mt-6 grid gap-4 sm:grid-cols-3"><div><dt className="mpv3-muted">{t.accepted}</dt><dd className="mt-1 text-xl font-bold">{registration.activeTeamCount}</dd></div><div><dt className="mpv3-muted">{t.pending}</dt><dd className="mt-1 text-xl font-bold">{registration.pendingReviewCount}</dd></div><div><dt className="mpv3-muted">{t.remaining}</dt><dd className="mt-1 text-xl font-bold text-[var(--mpv3-cyan)]">{registration.remainingSlots}</dd></div></dl>
    </section>
    <section className="mpv3-split">
      <article className="mpv3-panel mpv3-panel-pad"><p className="mpv3-eyebrow">{t.fee}</p><p className="mt-3 text-2xl font-bold">{fee}</p></article>
      <article className="mpv3-panel mpv3-panel-pad"><p className="mpv3-eyebrow">{t.roster}</p><p className="mt-3 text-2xl font-bold">{registration.minimumRoster}–{registration.maximumRoster}</p><p className="mt-2 text-sm">{roster}</p></article>
    </section>
    <section className="mpv3-split">
      <article className="mpv3-panel mpv3-panel-pad"><PublicV3SectionHeading title={t.agenda} /><p className="text-sm leading-6">{t.agendaHint}</p></article>
      <article className="mpv3-panel mpv3-panel-pad" data-bracket-state="tbd"><PublicV3SectionHeading title={t.bracket} /><p className="text-sm leading-6">{t.bracketHint}</p>{registration.bracket.slots.length ? <ul className="mt-4 grid gap-2">{registration.bracket.slots.map((slot) => <li key={slot.id} className="flex justify-between gap-3 border-t border-[var(--mpv3-border)] pt-3 text-sm"><span>{slot.roundLabel}</span><span>{slot.home} vs {slot.away}</span></li>)}</ul> : <PublicV3EmptyState title={t.tbd} description={t.bracketHint} />}</article>
    </section>
  </div>;
}
