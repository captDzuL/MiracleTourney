import React from "react";
import type { PublicV3Locale, PublicV3Match, PublicV3OngoingEventViewModel } from "@/lib/events/public-v3-types";
import { PublicV3EmptyState, PublicV3SectionHeading, PublicV3StatusBadge } from "@/components/v3/public-discovery/PublicV3Primitives";
import { dateLabel } from "../PublicV3EventHero";

const copy = {
  id: {
    eyebrow: "PHASE 03 / MATCH DAY",
    title: "Event sedang berlangsung",
    description: "Match live, perubahan jadwal, dan hasil di bawah hanya menampilkan data publik yang sudah tersedia.",
    live: "Live sekarang",
    next: "Pertandingan berikutnya",
    results: "Hasil resmi terbaru",
    schedule: "Perubahan jadwal",
    standings: "Klasemen",
    leaderboard: "Statistik published",
    noLive: "Belum ada pertandingan live",
    noNext: "Pertandingan berikutnya belum dijadwalkan.",
    noResults: "Belum ada hasil resmi yang diterbitkan.",
    noSchedule: "Belum ada perubahan jadwal yang diterbitkan.",
    noStandings: "Klasemen belum diterbitkan.",
    noLeaderboard: "Statistik pemain belum diterbitkan.",
    official: "Resmi",
    scheduled: "Terjadwal",
    delayed: "Tertunda",
    postponed: "Ditunda",
    tbd: "TBD",
    score: "Skor",
  },
  en: {
    eyebrow: "PHASE 03 / MATCH DAY",
    title: "Event is live",
    description: "Live matches, schedule changes, and results below only use public data that has been published.",
    live: "Live now",
    next: "Next match",
    results: "Latest official results",
    schedule: "Schedule changes",
    standings: "Standings",
    leaderboard: "Published statistics",
    noLive: "No live match right now",
    noNext: "The next match has not been scheduled.",
    noResults: "No official results have been published.",
    noSchedule: "No schedule changes have been published.",
    noStandings: "Standings have not been published.",
    noLeaderboard: "Player statistics have not been published.",
    official: "Official",
    scheduled: "Scheduled",
    delayed: "Delayed",
    postponed: "Postponed",
    tbd: "TBD",
    score: "Score",
  },
} as const;

function matchStatus(match: PublicV3Match, locale: PublicV3Locale) {
  const t = copy[locale];
  if (match.status === "live") return t.live;
  if (match.status === "delayed") return t.delayed;
  if (match.status === "postponed") return t.postponed;
  if (match.status === "completed") return t.official;
  return t.scheduled;
}

function MatchCard({ match, locale, timezone }: { match: PublicV3Match; locale: PublicV3Locale; timezone: string }) {
  const t = copy[locale];
  return <article className="min-w-0 border border-[var(--mpv3-border)] bg-[var(--mpv3-inset)] p-4" data-match-status={match.status}>
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="mpv3-eyebrow">{match.roundLabel}</p><PublicV3StatusBadge status={match.status} label={matchStatus(match, locale)} /></div>
    <p className="mt-4 break-words font-semibold">{match.home ?? t.tbd} <span className="mpv3-muted">vs</span> {match.away ?? t.tbd}</p>
    {match.official && match.homeScore !== null && match.awayScore !== null ? <p className="mt-2 text-2xl font-bold tabular-nums" aria-label={t.score}>{match.homeScore} – {match.awayScore}</p> : null}
    <p className="mt-2 text-xs text-[var(--mpv3-muted)]">{match.start ? dateLabel(match.start, locale, timezone) : t.tbd}{match.room ? ` · ${match.room}` : ""}</p>
  </article>;
}

function MatchSection({ title, description, matches, empty, locale, timezone, dataKey }: { title: string; description?: string; matches: PublicV3Match[]; empty: string; locale: PublicV3Locale; timezone: string; dataKey: string }) {
  return <section className="mpv3-panel mpv3-panel-pad" data-match-group={dataKey}><PublicV3SectionHeading title={title} description={description} />{matches.length ? <div className="grid gap-3 md:grid-cols-2">{matches.map((match) => <MatchCard key={match.id} match={match} locale={locale} timezone={timezone} />)}</div> : <PublicV3EmptyState title={empty} description={description ?? empty} />}</section>;
}

export function OngoingOverview({ view, locale }: { view: PublicV3OngoingEventViewModel; locale: PublicV3Locale }) {
  const t = copy[locale];
  return <div className="mpv3-stack" data-lifecycle-overview="ongoing">
    <section className="mpv3-panel mpv3-panel-pad"><PublicV3SectionHeading eyebrow={t.eyebrow} title={t.title} description={t.description} />{view.stream ? <a className="mpv3-action mpv3-action--cyan" href={view.stream.url} target="_blank" rel="noopener noreferrer">{view.stream.label}</a> : null}</section>
    <MatchSection title={t.live} matches={view.liveMatches} empty={t.noLive} locale={locale} timezone={view.identity.facts.timezone} dataKey="live" />
    <MatchSection title={t.next} matches={view.nextMatches} empty={t.noNext} locale={locale} timezone={view.identity.facts.timezone} dataKey="next" />
    <MatchSection title={t.results} matches={view.recentResults} empty={t.noResults} locale={locale} timezone={view.identity.facts.timezone} dataKey="results" />
    <section className="mpv3-panel mpv3-panel-pad" data-schedule-changes="published"><PublicV3SectionHeading title={t.schedule} />{view.schedule?.changes.length ? <ul className="grid gap-3">{view.schedule.changes.map((change, index) => { const match = view.matches.find((candidate) => candidate.id === String(change.matchId)); return <li key={String(change.matchId ?? index)} className="border-t border-[var(--mpv3-border)] pt-3 text-sm"><strong>{match?.home ?? t.tbd} vs {match?.away ?? t.tbd}</strong><p className="mt-1 text-[var(--mpv3-muted)]">{String(change.reason ?? (locale === "id" ? "Jadwal diperbarui organizer." : "Schedule updated by the organizer."))}</p></li>; })}</ul> : <PublicV3EmptyState title={t.noSchedule} description={view.schedule ? (locale === "id" ? "Versi jadwal terbaru tidak memiliki perubahan." : "The latest schedule version has no changes.") : t.noSchedule} />}</section>
    {view.standings.length ? <section className="mpv3-panel mpv3-panel-pad" data-standings="published"><PublicV3SectionHeading title={t.standings} /><div className="mpv3-stack">{view.standings.map((table, index) => <div className="mpv3-table-wrap" key={`${String(table.phaseId ?? index)}:${String(table.groupId ?? "overall")}`}><table><thead><tr><th>{locale === "id" ? "Tim" : "Team"}</th><th>{locale === "id" ? "Poin" : "Points"}</th><th>{locale === "id" ? "Main" : "Played"}</th></tr></thead><tbody>{Array.isArray(table.rows) && table.rows.map((row, rowIndex) => <tr key={String(row.teamId ?? row.name ?? rowIndex)}><td>{String(row.name ?? row.teamId ?? t.tbd)}</td><td>{String(row.points ?? t.tbd)}</td><td>{String(row.played ?? t.tbd)}</td></tr>)}</tbody></table></div>)}</div></section> : <section className="mpv3-panel mpv3-panel-pad"><PublicV3SectionHeading title={t.standings} /><p className="text-sm">{t.noStandings}</p></section>}
    {view.leaderboard.length ? <section className="mpv3-panel mpv3-panel-pad" data-leaderboard="published"><PublicV3SectionHeading title={t.leaderboard} /><div className="mpv3-table-wrap"><table><thead><tr><th>{locale === "id" ? "Pemain" : "Player"}</th><th>{locale === "id" ? "Tim" : "Team"}</th><th>Score</th><th>Goal</th><th>Assist</th><th>{locale === "id" ? "Defense" : "Defense"}</th></tr></thead><tbody>{view.leaderboard.map((entry) => <tr key={entry.playerId}><td>{entry.nickname || entry.playerName}</td><td>{entry.teamName || t.tbd}</td><td>{entry.score ?? t.tbd}</td><td>{entry.goal}</td><td>{entry.assist}</td><td>{entry.defense}</td></tr>)}</tbody></table></div></section> : <section className="mpv3-panel mpv3-panel-pad"><PublicV3SectionHeading title={t.leaderboard} /><p className="text-sm">{t.noLeaderboard}</p></section>}
  </div>;
}
