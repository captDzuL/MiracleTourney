import React from "react";
import type { PublicV3DrawingEventViewModel, PublicV3Locale } from "@/lib/events/public-v3-types";
import { PublicV3EmptyState, PublicV3SectionHeading, PublicV3StatusBadge } from "@/components/v3/public-discovery/PublicV3Primitives";
import { dateLabel } from "../PublicV3EventHero";

const copy = {
  id: {
    eyebrow: "PHASE 02 / DRAWING",
    published: "Drawing resmi sudah terbit",
    pending: "Drawing resmi belum diterbitkan",
    publishedHint: "Seed dan pairing berikut berasal dari publikasi organizer.",
    pendingHint: "Slot masa depan tetap TBD sampai drawing resmi diterbitkan.",
    seeds: "Seed resmi",
    bracket: "Bracket berikutnya",
    schedule: "Jadwal resmi",
    schedulePublished: "Jadwal versi {version} telah diterbitkan.",
    scheduleDate: "Diterbitkan",
    noSchedule: "Jadwal belum diterbitkan organizer.",
    noSeeds: "Seed resmi belum tersedia.",
    noSlots: "Belum ada slot resmi yang diterbitkan.",
    standings: "Standings grup",
    tbd: "TBD",
  },
  en: {
    eyebrow: "PHASE 02 / DRAWING",
    published: "Official drawing is published",
    pending: "Official drawing is not published",
    publishedHint: "These seeds and pairings come from the organizer publication.",
    pendingHint: "Future slots remain TBD until the official drawing is published.",
    seeds: "Official seeds",
    bracket: "Next bracket",
    schedule: "Official schedule",
    schedulePublished: "Schedule version {version} is published.",
    scheduleDate: "Published",
    noSchedule: "The organizer has not published the schedule.",
    noSeeds: "Official seeds are not available yet.",
    noSlots: "No official slots have been published yet.",
    standings: "Group standings",
    tbd: "TBD",
  },
} as const;

export function DrawingOverview({ view, locale }: { view: PublicV3DrawingEventViewModel; locale: PublicV3Locale }) {
  const t = copy[locale];
  const published = view.drawing.published;
  return <div className="mpv3-stack" data-lifecycle-overview="drawing">
    <section className="mpv3-panel mpv3-panel-pad" data-drawing-publication={published ? "published" : "tbd"}>
      <PublicV3SectionHeading eyebrow={t.eyebrow} title={published ? t.published : t.pending} description={published ? t.publishedHint : t.pendingHint} />
      <div className="mpv3-actions"><PublicV3StatusBadge status={published ? "completed" : "drawing"} label={published ? t.published : t.pending} /></div>
    </section>
    <section className="mpv3-panel mpv3-panel-pad">
      <PublicV3SectionHeading title={t.seeds} />
      {view.drawing.seeds.length ? <ol className="grid gap-2 sm:grid-cols-2">{view.drawing.seeds.map((seed) => <li key={seed.teamId} className="flex min-w-0 items-center gap-3 border-t border-[var(--mpv3-border)] pt-3"><span className="text-xl font-bold text-[var(--mpv3-cyan)]">#{seed.seed}</span><span className="break-words font-semibold">{seed.teamName}</span></li>)}</ol> : <PublicV3EmptyState title={t.tbd} description={t.noSeeds} />}
    </section>
    <section className="mpv3-panel mpv3-panel-pad" data-bracket-state={published ? "published" : "tbd"}>
      <PublicV3SectionHeading title={t.bracket} description={published ? undefined : t.pendingHint} />
      {view.drawing.slots.length ? <div className="grid gap-3 md:grid-cols-2">{view.drawing.slots.map((slot) => <article key={slot.id} className="border border-[var(--mpv3-border)] bg-[var(--mpv3-inset)] p-4"><p className="mpv3-eyebrow">{slot.roundLabel}</p><p className="mt-3 break-words font-semibold">{slot.home} <span className="mpv3-muted">vs</span> {slot.away}</p>{slot.official && slot.homeScore !== null && slot.awayScore !== null ? <p className="mt-2 text-xl font-bold tabular-nums">{slot.homeScore} – {slot.awayScore}</p> : <p className="mt-2 text-sm text-[var(--mpv3-muted)]">{t.tbd}</p>}</article>)}</div> : <PublicV3EmptyState title={t.tbd} description={t.noSlots} />}
    </section>
    {view.schedule ? <section className="mpv3-panel mpv3-panel-pad" data-schedule-publication="published"><PublicV3SectionHeading title={t.schedule} /><p className="text-sm">{t.schedulePublished.replace("{version}", String(view.schedule.version))}</p>{view.schedule.publishedAt ? <time className="mt-2 block text-xs text-[var(--mpv3-muted)]" dateTime={view.schedule.publishedAt}>{t.scheduleDate}: {dateLabel(view.schedule.publishedAt, locale, view.identity.facts.timezone)}</time> : null}</section> : null}
    {view.standings.length ? <section className="mpv3-panel mpv3-panel-pad" data-standings="published"><PublicV3SectionHeading title={t.standings} /><div className="mpv3-stack">{view.standings.map((table) => <div key={`${table.phaseId}:${table.groupId ?? "overall"}`} className="mpv3-table-wrap"><table><thead><tr><th>{locale === "id" ? "Tim" : "Team"}</th><th>{locale === "id" ? "Poin" : "Points"}</th></tr></thead><tbody>{table.rows.map((row, index) => <tr key={String(row.teamId ?? row.name ?? index)}><td>{String(row.name ?? row.teamId ?? t.tbd)}</td><td>{String(row.points ?? t.tbd)}</td></tr>)}</tbody></table></div>)}</div></section> : null}
  </div>;
}
