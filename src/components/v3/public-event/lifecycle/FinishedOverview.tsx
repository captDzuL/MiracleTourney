import React from "react";
import type { PublicV3FinishedEventViewModel, PublicV3Locale } from "@/lib/events/public-v3-types";
import { PublicV3SectionHeading, PublicV3StatusBadge } from "@/components/v3/public-discovery/PublicV3Primitives";
import { PublicV3CompetitionContext } from "../PublicV3CompetitionContext";
import { CertificateGallery } from "./CertificateGallery";
import { FinishedPodium } from "./FinishedPodium";

const copy = {
  id: {
    eyebrow: "PHASE 04 / FINISHED",
    title: "Hasil akhir resmi",
    description: "Podium, klasemen, awards, dan certificate hanya muncul setelah publikasi resmi.",
    bracket: "Bracket",
    viewBracket: "Lihat bracket",
    standings: "Klasemen akhir",
    awards: "Awards resmi",
    certificates: "Certificate resmi",
    certificatesReady: "Certificate lengkap telah diterbitkan.",
    certificatesPreparing: "Certificate sedang disiapkan organizer. Tautan muncul setelah publikasi lengkap diverifikasi.",
    viewCertificate: "Lihat certificate",
    noStandings: "Klasemen akhir belum diterbitkan.",
    noAwards: "Awards belum diterbitkan.",
    tbd: "TBD",
  },
  en: {
    eyebrow: "PHASE 04 / FINISHED",
    title: "Official final results",
    description: "The podium, standings, awards, and certificates appear only after official publication.",
    bracket: "Bracket",
    viewBracket: "View bracket",
    standings: "Final standings",
    awards: "Official awards",
    certificates: "Official certificates",
    certificatesReady: "The complete certificate set is published.",
    certificatesPreparing: "Certificates are being prepared. Links appear after the complete publication is verified.",
    viewCertificate: "View certificate",
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

export function FinishedOverview({ view, locale }: { view: PublicV3FinishedEventViewModel; locale: PublicV3Locale }) {
  const t = copy[locale];
  const showBracketLink = view.navigation.bracket && !/round[_\s-]?robin|league/i.test(view.identity.format);
  return <div className="mpv3-stack" data-lifecycle-overview="finished">
    <section className="mpv3-panel mpv3-panel-pad"><PublicV3SectionHeading eyebrow={t.eyebrow} title={t.title} description={t.description} /></section>
    <FinishedPodium podium={view.podium} locale={locale} />
    {view.standings.length ? <div className="mpv3-panel mpv3-panel-pad"><PublicV3CompetitionContext view={view} locale={locale} standingsOnly /></div> : null}
    {showBracketLink ? <section className="mpv3-panel mpv3-panel-pad"><PublicV3SectionHeading title={t.bracket} /><a className="mpv3-action mpv3-action--cyan" href={view.navigation.targets.bracket.hrefByLocale[locale]} data-bracket-link>{t.viewBracket}</a></section> : null}
    {view.awards.length ? <section className="mpv3-panel mpv3-panel-pad" data-awards="published"><PublicV3SectionHeading title={t.awards} /><div className="grid gap-3 md:grid-cols-2">{view.awards.map((award) => <article key={award.type} className="border border-[var(--mpv3-border)] p-4"><PublicV3StatusBadge status="finished" label={awardLabels[award.type as keyof typeof awardLabels]?.[locale] ?? award.type} /><h3 className="mt-3 break-words font-semibold">{award.recipientName}</h3><p className="mt-1 text-sm text-[var(--mpv3-muted)]">{award.teamName}</p>{award.reason ? <p className="mt-3 text-sm leading-6">{award.reason}</p> : null}{award.certificate ? <a className="mpv3-action mpv3-action--text mt-3" href={award.certificate.publishedUrl} target="_blank" rel="noopener noreferrer">{t.viewCertificate}</a> : null}</article>)}</div></section> : <section className="mpv3-panel mpv3-panel-pad"><PublicV3SectionHeading title={t.awards} /><p className="text-sm">{t.noAwards}</p></section>}
    <section className="mpv3-panel mpv3-panel-pad" data-certificates={view.certificates.status}><PublicV3SectionHeading title={t.certificates} /><p className="text-sm">{view.certificates.isComplete ? t.certificatesReady : t.certificatesPreparing}</p>{view.certificates.isComplete && view.certificates.items.length ? <CertificateGallery items={view.certificates.items} locale={locale} /> : null}</section>
  </div>;
}
