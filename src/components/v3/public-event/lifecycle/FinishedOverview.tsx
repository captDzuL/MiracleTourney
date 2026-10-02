import React from "react";
import type { PublicV3FinishedEventViewModel, PublicV3Locale, PublicV3Match } from "@/lib/events/public-v3-types";
import { PublicV3EmptyState, PublicV3SectionHeading, PublicV3StatusBadge } from "@/components/v3/public-discovery/PublicV3Primitives";
import { publicV3LocalizedHref } from "@/lib/events/public-v3-types";
import { dateLabel } from "../PublicV3EventHero";

const copy = {
  id: {
    eyebrow: "PHASE 04 / FINISHED",
    title: "Hasil akhir resmi",
    description: "Perjalanan final, podium, awards, dan certificate hanya muncul setelah publikasi resmi.",
    champion: "Champion",
    podium: "Podium akhir",
    journey: "Perjalanan final",
    standings: "Klasemen akhir",
    awards: "Awards resmi",
    certificates: "Certificate resmi",
    certificatesReady: "Certificate lengkap telah diterbitkan.",
    certificatesPreparing: "Certificate sedang disiapkan organizer. Tautan muncul setelah publikasi lengkap diverifikasi.",
    viewCertificate: "Lihat certificate",
    verify: "Verifikasi",
    noChampion: "Champion belum diterbitkan.",
    noPodium: "Podium belum diterbitkan.",
    noJourney: "Perjalanan final belum tersedia.",
    noStandings: "Klasemen akhir belum diterbitkan.",
    noAwards: "Awards belum diterbitkan.",
    tbd: "TBD",
  },
  en: {
    eyebrow: "PHASE 04 / FINISHED",
    title: "Official final results",
    description: "The final journey, podium, awards, and certificates appear only after official publication.",
    champion: "Champion",
    podium: "Final podium",
    journey: "Final journey",
    standings: "Final standings",
    awards: "Official awards",
    certificates: "Official certificates",
    certificatesReady: "The complete certificate set is published.",
    certificatesPreparing: "Certificates are being prepared. Links appear after the complete publication is verified.",
    viewCertificate: "View certificate",
    verify: "Verify",
    noChampion: "The champion has not been published.",
    noPodium: "The podium has not been published.",
    noJourney: "The final journey is not available yet.",
    noStandings: "Final standings have not been published.",
    noAwards: "Awards have not been published.",
    tbd: "TBD",
  },
} as const;

const awardLabels = {
  mvp: { id: "MVP Tournament", en: "MVP Tournament" },
  top_scorer: { id: "Top Scorer", en: "Top Scorer" },
  top_defender: { id: "Top Defender", en: "Top Defender" },
  top_assist: { id: "Top Assist", en: "Top Assist" },
} as const;

function MatchCard({ match, locale, timezone }: { match: PublicV3Match; locale: PublicV3Locale; timezone: string }) {
  return <article className="border border-[var(--mpv3-border)] bg-[var(--mpv3-inset)] p-4"><p className="mpv3-eyebrow">{match.roundLabel}</p><p className="mt-3 break-words font-semibold">{match.home ?? "TBD"} <span className="mpv3-muted">vs</span> {match.away ?? "TBD"}</p>{match.official && match.homeScore !== null && match.awayScore !== null ? <p className="mt-2 text-2xl font-bold tabular-nums">{match.homeScore} – {match.awayScore}</p> : null}<p className="mt-2 text-xs text-[var(--mpv3-muted)]">{match.start ? dateLabel(match.start, locale, timezone) : "TBD"}</p></article>;
}

export function FinishedOverview({ view, locale }: { view: PublicV3FinishedEventViewModel; locale: PublicV3Locale }) {
  const t = copy[locale];
  const champion = view.podium.find((placement) => placement.rank === 1);
  return <div className="mpv3-stack" data-lifecycle-overview="finished">
    <section className="mpv3-panel mpv3-panel-pad"><PublicV3SectionHeading eyebrow={t.eyebrow} title={t.title} description={t.description} />{champion ? <div className="border border-[var(--mpv3-border)] bg-[var(--mpv3-inset)] p-5" data-champion><PublicV3StatusBadge status="finished" label={t.champion} /><h3 className="mt-3 text-2xl font-bold">{champion.teamName}</h3>{champion.certificate ? <a className="mpv3-action mpv3-action--text mt-3" href={champion.certificate.publishedUrl} target="_blank" rel="noopener noreferrer">{t.viewCertificate}</a> : null}</div> : <PublicV3EmptyState title={t.noChampion} description={t.noPodium} />}</section>
    <section className="mpv3-panel mpv3-panel-pad"><PublicV3SectionHeading title={t.podium} />{view.podium.length ? <ol className="grid gap-3 md:grid-cols-3">{view.podium.map((placement) => <li key={placement.rank} className="border border-[var(--mpv3-border)] p-4"><span className="text-3xl font-bold text-[var(--mpv3-cyan)]">#{placement.rank}</span><p className="mt-2 break-words font-semibold">{placement.teamName}</p>{placement.certificate ? <a className="mpv3-action mpv3-action--text mt-3" href={placement.certificate.publishedUrl} target="_blank" rel="noopener noreferrer">{t.viewCertificate}</a> : null}</li>)}</ol> : <PublicV3EmptyState title={t.noPodium} description={t.noPodium} />}</section>
    <section className="mpv3-panel mpv3-panel-pad"><PublicV3SectionHeading title={t.journey} />{view.matches.length ? <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{view.matches.map((match) => <MatchCard key={match.id} match={match} locale={locale} timezone={view.identity.facts.timezone} />)}</div> : <PublicV3EmptyState title={t.noJourney} description={t.noJourney} />}</section>
    {view.standings.length ? <section className="mpv3-panel mpv3-panel-pad" data-standings="published"><PublicV3SectionHeading title={t.standings} /><div className="mpv3-stack">{view.standings.map((table, index) => <div className="mpv3-table-wrap" key={`${table.phaseId}:${table.groupId ?? index}`}><table><thead><tr><th>{locale === "id" ? "Tim" : "Team"}</th><th>{locale === "id" ? "Poin" : "Points"}</th></tr></thead><tbody>{table.rows.map((row, rowIndex) => <tr key={String(row.teamId ?? row.name ?? rowIndex)}><td>{String(row.name ?? row.teamId ?? t.tbd)}</td><td>{String(row.points ?? t.tbd)}</td></tr>)}</tbody></table></div>)}</div></section> : <section className="mpv3-panel mpv3-panel-pad"><PublicV3SectionHeading title={t.standings} /><p className="text-sm">{t.noStandings}</p></section>}
    {view.awards.length ? <section className="mpv3-panel mpv3-panel-pad" data-awards="published"><PublicV3SectionHeading title={t.awards} /><div className="grid gap-3 md:grid-cols-2">{view.awards.map((award) => <article key={award.type} className="border border-[var(--mpv3-border)] p-4"><PublicV3StatusBadge status="finished" label={awardLabels[award.type as keyof typeof awardLabels]?.[locale] ?? award.type} /><h3 className="mt-3 break-words font-semibold">{award.recipientName}</h3><p className="mt-1 text-sm text-[var(--mpv3-muted)]">{award.teamName}</p>{award.reason ? <p className="mt-3 text-sm leading-6">{award.reason}</p> : null}{award.certificate ? <a className="mpv3-action mpv3-action--text mt-3" href={award.certificate.publishedUrl} target="_blank" rel="noopener noreferrer">{t.viewCertificate}</a> : null}</article>)}</div></section> : <section className="mpv3-panel mpv3-panel-pad"><PublicV3SectionHeading title={t.awards} /><p className="text-sm">{t.noAwards}</p></section>}
    <section className="mpv3-panel mpv3-panel-pad" data-certificates={view.certificates.status}><PublicV3SectionHeading title={t.certificates} /><p className="text-sm">{view.certificates.isComplete ? t.certificatesReady : t.certificatesPreparing}</p>{view.certificates.isComplete && view.certificates.items.length ? <ul className="mt-4 grid gap-2 sm:grid-cols-2">{view.certificates.items.map((certificate) => <li key={certificate.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--mpv3-border)] pt-3"><span className="break-words">{certificate.recipientName}</span><span className="flex flex-wrap gap-3"><a className="mpv3-action mpv3-action--text" href={certificate.publishedUrl} target="_blank" rel="noopener noreferrer">{t.viewCertificate}</a><a className="mpv3-action mpv3-action--text" href={publicV3LocalizedHref(`/certificates/verify/${encodeURIComponent(certificate.verificationCode)}`)[locale]}>{t.verify}</a></span></li>)}</ul> : null}</section>
  </div>;
}
