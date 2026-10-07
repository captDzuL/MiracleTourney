import React from "react";
import { ArrowRight, ExternalLink } from "lucide-react";

import { PublicV3Action, PublicV3CompactEventIdentity, PublicV3EmptyState, PublicV3Eyebrow, PublicV3SectionHeading } from "@/components/v3/public-discovery/PublicV3Primitives";
import { PublicV3Frame } from "@/components/v3/public-discovery/PublicV3Frame";
import { publicV3LocalizedHref, type PublicV3EventViewModel, type PublicV3Locale } from "@/lib/events/public-v3-types";
import { PublicV3EventHero } from "./PublicV3EventHero";
import { PublicV3EventNavigation } from "./PublicV3EventNavigation";
import { RegistrationOverview } from "./lifecycle/RegistrationOverview";
import { DrawingOverview } from "./lifecycle/DrawingOverview";
import { OngoingOverview } from "./lifecycle/OngoingOverview";
import { FinishedOverview } from "./lifecycle/FinishedOverview";

const copy = {
  id: {
    home: "Beranda",
    events: "Event Center",
    login: "Masuk",
    error: "Data event belum dapat dimuat",
    errorHint: "Coba lagi nanti. Tidak ada data contoh yang ditampilkan ketika pembacaan event gagal.",
    organizer: "Kepercayaan organizer",
    verified: "Organizer terverifikasi",
    unverified: "Organizer belum terverifikasi",
    official: "Sumber data",
    authoritative: "Lifecycle resmi",
    compatible: "Kompatibel dari data tersimpan",
    updates: "Pengumuman resmi",
    noUpdates: "Belum ada pengumuman resmi yang diterbitkan.",
    essentials: "Event essentials",
    game: "Game",
    mode: "Mode",
    format: "Format",
    venue: "Lokasi",
    prize: "Hadiah",
    allEvents: "Lihat semua event",
    details: "Buka detail",
    footer: "Kompetisi komunitas multi-game.",
  },
  en: {
    home: "Home",
    events: "Event Center",
    login: "Sign in",
    error: "Event data is unavailable",
    errorHint: "Please try again later. No sample data is shown when the event read fails.",
    organizer: "Organizer trust",
    verified: "Verified organizer",
    unverified: "Organizer not verified",
    official: "Data source",
    authoritative: "Official lifecycle",
    compatible: "Compatible saved data",
    updates: "Official announcements",
    noUpdates: "No official announcements have been published.",
    essentials: "Event essentials",
    game: "Game",
    mode: "Mode",
    format: "Format",
    venue: "Venue",
    prize: "Prize",
    allEvents: "Browse all events",
    details: "Open details",
    footer: "Community multi-game competition.",
  },
} as const;

function lifecycle(view: PublicV3EventViewModel, locale: PublicV3Locale) {
  if (view.mode === "registration") return <RegistrationOverview view={view} locale={locale} />;
  if (view.mode === "drawing") return <DrawingOverview view={view} locale={locale} />;
  if (view.mode === "ongoing") return <OngoingOverview view={view} locale={locale} />;
  return <FinishedOverview view={view} locale={locale} />;
}

function frameCopy(locale: PublicV3Locale) {
  return copy[locale];
}

export function PublicV3EventPage({ view, locale, error = false }: { view: PublicV3EventViewModel | null; locale: PublicV3Locale; error?: boolean }) {
  const t = frameCopy(locale);
  const globalNavigation = [
    { href: publicV3LocalizedHref("/")[locale], label: t.home },
    { href: publicV3LocalizedHref("/events")[locale], label: t.events },
    ...(view ? [{ href: view.identity.routes.overview.hrefByLocale[locale], label: view.identity.title, active: true }] : []),
  ];
  return <PublicV3Frame
    className="mpv3-event-overview"
    brandHref={publicV3LocalizedHref("/")[locale]}
    homeLabel={t.home}
    skipLabel={locale === "id" ? "Lewati ke konten" : "Skip to content"}
    navigationLabel={locale === "id" ? "Navigasi utama" : "Main navigation"}
    navigation={globalNavigation}
    headerEnd={<PublicV3Action href={publicV3LocalizedHref("/login")[locale]}>{t.login}<ArrowRight aria-hidden="true" /></PublicV3Action>}
    footer={<><span>MIRACLE</span><p>{t.footer}</p></>}
  >
    {view && !error ? <div data-public-v3-event="true" data-public-source={view.source}>
      <nav className="mpv3-directory-breadcrumb" aria-label={locale === "id" ? "Jejak halaman" : "Breadcrumb"}><a href={publicV3LocalizedHref("/")[locale]}>{t.home}</a><span aria-hidden="true">/</span><a href={publicV3LocalizedHref("/events")[locale]}>{t.events}</a><span aria-hidden="true">/</span><span>{view.identity.title}</span></nav>
      <div className="mt-5"><PublicV3EventHero view={view} locale={locale} /></div>
      <PublicV3EventNavigation view={view} locale={locale} />
      <div className="mpv3-two-col mt-2">
        <div className="min-w-0">{lifecycle(view, locale)}</div>
        <aside className="mpv3-stack" aria-label={t.organizer}>
          <section className="mpv3-panel mpv3-panel-pad" data-organizer-trust><PublicV3SectionHeading title={t.organizer} /><PublicV3CompactEventIdentity name={view.organizer.name} eyebrow={view.organizer.verified ? t.verified : t.unverified} monogram={view.organizer.verified ? "✓" : "?"} status={view.organizer.contactHref ? <a className="mpv3-action mpv3-action--text" href={view.organizer.contactHref} target="_blank" rel="noopener noreferrer">{t.details}<ExternalLink aria-hidden="true" size={14} /></a> : null} />{view.organizer.contactValue ? <p className="mt-3 break-words text-sm text-[var(--mpv3-muted)]">{view.organizer.contactValue}</p> : null}</section>
          <section className="mpv3-panel mpv3-panel-pad" data-event-essentials><PublicV3SectionHeading title={t.essentials} /><dl className="grid gap-3 text-sm"><div><dt className="mpv3-muted">{t.game}</dt><dd>{view.identity.game.name}</dd></div><div><dt className="mpv3-muted">{t.mode}</dt><dd>{view.identity.game.modeName}</dd></div><div><dt className="mpv3-muted">{t.format}</dt><dd>{view.identity.format}</dd></div><div><dt className="mpv3-muted">{t.venue}</dt><dd>{view.identity.facts.venue}</dd></div>{view.identity.facts.prize ? <div><dt className="mpv3-muted">{t.prize}</dt><dd>{view.identity.facts.prize}</dd></div> : null}</dl></section>
          <section className="mpv3-panel mpv3-panel-pad" data-public-announcements><PublicV3SectionHeading title={t.updates} />{view.updates.length ? <div className="mpv3-stack">{view.updates.map((update) => <article key={update.id} className="border-t border-[var(--mpv3-border)] pt-3"><h3>{update.title}</h3><p className="mt-2 whitespace-pre-line text-sm">{update.body}</p><time className="mt-2 block text-xs text-[var(--mpv3-muted)]" dateTime={update.publishedAt}>{update.publishedAt}</time></article>)}</div> : <p className="text-sm">{t.noUpdates}</p>}</section>
          <PublicV3Action href={publicV3LocalizedHref("/events")[locale]} variant="text">{t.allEvents}<ArrowRight aria-hidden="true" /></PublicV3Action>
        </aside>
      </div>
    </div> : <div data-public-v3-event="true" data-public-v3-error="true" role="alert" className="mpv3-empty-state"><PublicV3Eyebrow tone="muted">MIRACLE / EVENT</PublicV3Eyebrow><h1 className="mt-4">{t.error}</h1><PublicV3EmptyState title={t.error} description={t.errorHint} /></div>}
  </PublicV3Frame>;
}
