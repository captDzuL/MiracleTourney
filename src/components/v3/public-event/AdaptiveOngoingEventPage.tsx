"use client";

import React, { useEffect, useState } from "react";
import { Radio, Trophy, Video } from "lucide-react";
import type { PublicOngoingEventViewModel, PublicOngoingMatch } from "@/lib/events/public-ongoing-types";
import { startPublicOngoingPolling } from "@/lib/events/public-ongoing-poll";
import { publicGroupLabel, publicMatchLabel } from "@/lib/events/public-match-label";

const copy = {
  id: { ongoing: "Event berlangsung", live: "Sedang berlangsung", next: "Pertandingan berikutnya", results: "Hasil resmi terbaru", context: "Bagan & klasemen", announcements: "Pengumuman", schedule: "Perubahan jadwal", noLive: "Belum ada pertandingan yang sedang berlangsung", empty: "Belum tersedia", pendingSchedule: "Jadwal menunggu publikasi organizer", updated: "Pembaruan terakhir", offline: "Pembaruan terputus. Menampilkan data terakhir; mencoba kembali otomatis.", leaderboard: "Statistik pemain", watch: "Tonton siaran", qualify: "Teratas {n} lolos", points: "poin", played: "main", tied: "Peringkat masih seri", corrected: "Hasil dikoreksi", statuses: { live: "Live", completed: "Selesai", scheduled: "Terjadwal", delayed: "Tertunda", postponed: "Ditunda" }, brackets: { single: "Eliminasi", upper: "Upper bracket", lower: "Lower bracket", grand_final: "Grand final", third_place: "Perebutan tempat ketiga", round_robin: "Liga" } },
  en: { ongoing: "Event ongoing", live: "Live now", next: "Up next", results: "Recent official results", context: "Bracket & standings", announcements: "Announcements", schedule: "Schedule changes", noLive: "No matches live right now", empty: "Nothing available yet", pendingSchedule: "Schedule awaiting organizer publication", updated: "Last updated", offline: "Updates interrupted. Showing the last available data; retrying automatically.", leaderboard: "Player statistics", watch: "Watch stream", qualify: "Top {n} qualify", points: "points", played: "played", tied: "Ranking still tied", corrected: "Corrected result", statuses: { live: "Live", completed: "Completed", scheduled: "Scheduled", delayed: "Delayed", postponed: "Postponed" }, brackets: { single: "Elimination", upper: "Upper bracket", lower: "Lower bracket", grand_final: "Grand final", third_place: "Third place", round_robin: "League" } },
};
type Copy = typeof copy.en;
const panel = "min-w-0 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6";
const link = "inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-4 py-2 text-sm font-bold transition-colors hover:bg-[var(--color-surface-subtle)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-brand-cyan)] motion-reduce:transition-none";
function date(value: string, locale: "id" | "en", timezone: string) {
  return new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(value));
}
function MatchCard({ match, locale, timezone, t }: { match: PublicOngoingMatch; locale: "id" | "en"; timezone: string; t: Copy }) {
  return <article className="min-w-0 break-words rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4">
    <div className="flex flex-wrap justify-between gap-2 text-sm"><span>{publicMatchLabel(match, locale)} · BO{match.bestOf}</span><span className="font-bold text-[var(--color-brand-cyan)]">{t.statuses[match.status]}</span></div>
    <h3 className="mt-3 text-lg font-bold">{match.home ?? "TBD"} <span className="font-normal text-[var(--color-text-muted)]">vs</span> {match.away ?? "TBD"}</h3>
    {match.resultVersion > 0 ? <p className="mt-2 text-2xl font-bold tabular-nums">{match.homeScore} – {match.awayScore}</p> : null}
    {match.resultVersion > 1 ? <p className="mt-1 text-sm">{t.corrected}</p> : null}
    <p className="mt-3 text-sm text-[var(--color-text-muted)]">{match.room ? `${match.room} · ` : ""}{match.start ? date(match.start, locale, timezone) : match.scheduledLabel ?? t.pendingSchedule}</p>
  </article>;
}
function Matches({ id, title, matches, empty, locale, timezone, t }: { id: string; title: string; matches: PublicOngoingMatch[]; empty: string; locale: "id" | "en"; timezone: string; t: Copy }) {
  return <section id={id} aria-labelledby={`${id}-heading`} className={`${panel} scroll-mt-24`}>
    <h2 id={`${id}-heading`} className="mb-4 text-xl font-bold">{title}</h2>
    {matches.length ? <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">{matches.map(match => <MatchCard key={match.id} match={match} locale={locale} timezone={timezone} t={t} />)}</div> : <p className="text-[var(--color-text-muted)]">{empty}</p>}
  </section>;
}

export function AdaptiveOngoingEventPage({ view, locale }: { view: PublicOngoingEventViewModel; locale: "id" | "en" }) {
  const [state, setState] = useState(view);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setState(view); setFailed(false);
    return startPublicOngoingPolling({ slug: view.event.slug, initial: view, onData: setState, onError: setFailed, onUnavailable: () => window.location.reload() });
  }, [view]);
  const t = copy[locale];
  const timezone = state.event.timezone;
  const bracketGroups = Object.entries(Object.groupBy(state.matches.filter(m => m.bracket !== "round_robin"), m => `${m.phaseId}:${m.bracket}:${m.round}`));
  return <div className="miracle-v3 adaptive-public-event grid min-w-0 gap-6 pb-12 text-[var(--color-text)]">
    <header className={panel}>
      <p className="flex items-center gap-2 text-sm font-bold text-[var(--color-brand-cyan)]"><Radio className="h-4 w-4" aria-hidden />{t.ongoing}</p>
      <h1 className="mt-3 break-words text-3xl font-extrabold sm:text-5xl">{state.event.name}</h1>
      <p className="mt-4 max-w-3xl whitespace-pre-wrap break-words leading-7 text-[var(--color-text-muted)]">{state.event.description}</p>
      <p className="mt-4 text-sm">{t.updated}: <time dateTime={state.lastUpdatedAt}>{date(state.lastUpdatedAt, locale, timezone)}</time> · {timezone}</p>
      <p role="status" aria-atomic="true" className="mt-2 text-sm text-[var(--color-text-muted)]">{failed ? t.offline : `${t.live}: ${state.liveMatches.length}`}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <a className={link} href={`/${locale}${state.leaderboardHref}`}><Trophy className="h-4 w-4" aria-hidden />{t.leaderboard}</a>
        {state.stream ? <a className={link} href={state.stream.url} target="_blank" rel="noopener noreferrer"><Video className="h-4 w-4" aria-hidden />{t.watch}: {state.stream.label}{state.stream.isLive ? " · Live" : ""}</a> : null}
      </div>
    </header>
    <nav aria-label={t.ongoing} className="flex flex-wrap gap-2">{[["ongoing-live", t.live], ["ongoing-next", t.next], ["ongoing-results", t.results], ["ongoing-context", t.context], ["ongoing-announcements", t.announcements]].map(([id, label]) => <a className={link} key={id} href={`#${id}`}>{label}</a>)}</nav>
    <Matches id="ongoing-live" title={t.live} matches={state.liveMatches} empty={t.noLive} locale={locale} timezone={timezone} t={t} />
    <Matches id="ongoing-next" title={t.next} matches={state.nextMatches.slice(0, 12)} empty={t.empty} locale={locale} timezone={timezone} t={t} />
    {state.nextMatches.length > 12 ? <details className={panel}><summary className="miracle-focus-ring min-h-11 cursor-pointer py-2 font-bold">{locale === "id" ? "Jadwal lengkap" : "Full schedule"} ({state.nextMatches.length})</summary><div className="mt-4 grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">{state.nextMatches.map(match => <MatchCard key={match.id} match={match} locale={locale} timezone={timezone} t={t} />)}</div></details> : null}
    <Matches id="ongoing-results" title={t.results} matches={state.recentResults} empty={t.empty} locale={locale} timezone={timezone} t={t} />
    <section id="ongoing-context" aria-labelledby="ongoing-context-heading" className={`${panel} scroll-mt-24`}>
      <h2 id="ongoing-context-heading" className="mb-4 text-xl font-bold">{t.context}</h2>
      <div className="grid min-w-0 gap-5 lg:grid-cols-2">{state.standings.map(table => <section key={`${table.phaseId}:${table.groupId}`} className="min-w-0">
        <h3 className="text-lg font-bold">{table.groupNumber ? publicGroupLabel(table.groupNumber, locale) : t.brackets.round_robin}</h3>
        {table.qualificationCutline ? <p className="mt-2 text-sm text-[var(--color-brand-cyan)]">{t.qualify.replace("{n}", String(table.qualificationCutline))}</p> : null}
        <ol className="mt-3 grid gap-2">{table.rows.map((row, index) => <li key={row.teamId} className={`flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] bg-[var(--color-surface-subtle)] p-3 ${table.qualificationCutline === index ? "border-t-2 border-[var(--color-brand-cyan)]" : ""}`}>
          <span className="min-w-0 break-words font-bold">{row.rank}. {row.name}</span><span className="text-sm tabular-nums">{row.points} {t.points} · {row.played} {t.played}</span>{row.tied ? <span className="w-full text-sm text-[var(--color-text-muted)]">{t.tied}</span> : null}
        </li>)}</ol>
      </section>)}</div>
      <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-2">{bracketGroups.map(([key, matches]) => <section key={key} className="min-w-0"><h3 className="mb-3 text-lg font-bold">{publicMatchLabel(matches![0], locale)}</h3><div className="grid gap-3">{matches!.map(match => <MatchCard key={match.id} match={match} locale={locale} timezone={timezone} t={t} />)}</div></section>)}</div>
      {!state.standings.length && !bracketGroups.length ? <p>{t.empty}</p> : null}
    </section>
    <section className={panel} aria-labelledby="ongoing-schedule-heading"><h2 id="ongoing-schedule-heading" className="mb-4 text-xl font-bold">{t.schedule}</h2>
      {state.schedule?.changes.length ? <ul className="grid gap-3">{state.schedule.changes.map(change => { const match = state.matches.find(m => m.id === change.matchId); return <li key={change.matchId} className="min-w-0 break-words"><p className="font-bold">{match?.home ?? "TBD"} vs {match?.away ?? "TBD"}</p><p>{change.before ? `${date(change.before.start, locale, timezone)} – ${date(change.before.end, locale, timezone)} · ${change.before.room}` : "TBD"} → {change.after ? `${date(change.after.start, locale, timezone)} – ${date(change.after.end, locale, timezone)} · ${change.after.room}` : "TBD"}</p></li>; })}</ul> : <p>{state.schedule ? t.empty : t.pendingSchedule}</p>}
    </section>
    <section id="ongoing-announcements" className={`${panel} scroll-mt-24`} aria-labelledby="ongoing-announcements-heading"><h2 id="ongoing-announcements-heading" className="mb-4 text-xl font-bold">{t.announcements}</h2>
      {state.announcements.length ? <div className="grid gap-4">{state.announcements.map(a => <article key={a.id} className="min-w-0 break-words"><p className={a.urgency === "urgent" ? "font-bold text-[var(--color-brand-cyan)]" : "text-sm text-[var(--color-text-muted)]"}>{a.urgency === "urgent" ? locale === "id" ? "Mendesak" : "Urgent" : a.urgency === "important" ? locale === "id" ? "Penting" : "Important" : locale === "id" ? "Informasi" : "Information"}</p><h3 className="font-bold">{a.title}</h3><p className="mt-2 whitespace-pre-wrap leading-7">{a.body}</p><time className="mt-2 block text-sm text-[var(--color-text-muted)]" dateTime={a.publishedAt}>{date(a.publishedAt, locale, timezone)}</time></article>)}</div> : <p>{t.empty}</p>}
    </section>
  </div>;
}
