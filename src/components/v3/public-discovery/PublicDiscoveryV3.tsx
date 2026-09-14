import React from "react";
import { publicV3LocalizedHref, publicV3RouteTarget, resolvePublicV3Route, type PublicV3EventViewModel } from "@/lib/events/public-v3-types";
import { PublicV3Frame } from "./PublicV3Frame";
import { EventPosterStage } from "./EventPosterStage";
import { FeaturedEventHero } from "./FeaturedEventHero";
import { EventPulse } from "./EventPulse";
import { PublicDiscoveryShortcuts } from "./PublicDiscoveryShortcuts";
import { PublicV3Action, PublicV3EmptyState, PublicV3Eyebrow, PublicV3SectionHeading, PublicV3StatusBadge, PublicV3Tabs } from "./PublicV3Primitives";
import { homeCopy, homeDate } from "./home-copy";
import {
  ArrowRight,
  ShieldCheck,
} from "lucide-react";

import {
  chooseFeaturedDiscoveryEvent,
  getPublicDiscoveryStage,
  groupDiscoveryEvents,
  type PublicDiscoveryEvent,
} from "@/lib/events/public-discovery";
import type { Game } from "@/lib/platform/types";

type Locale = "id" | "en";
type LoadState = "ready" | "error";

function gameName(games: readonly Game[], gameId: string) {
  return games.find((game) => game.id === gameId)?.name ?? gameId;
}

export function PublicDiscoveryHomeV3({ locale, entries, games, gameFilter, loadState, featuredView }: {
  locale: Locale; entries: readonly PublicDiscoveryEvent[]; games: readonly Game[];
  gameFilter: string; loadState: LoadState; featuredView?: PublicV3EventViewModel | null;
}) {
  const t = homeCopy[locale];
  const featured = chooseFeaturedDiscoveryEvent(entries);
  const view = featuredView?.identity.id === featured?.event.id ? featuredView : null;
  const groups = groupDiscoveryEvents(entries.filter((entry) => entry.event.id !== view?.identity.id));
  const localized = (path: string) => publicV3LocalizedHref(path)[locale];
  const error = loadState === "error" || Boolean(featured && !view);
  const navigation = [
    { href: localized("/"), label: t.home, active: true },
    ...(view ? [{ href: resolvePublicV3Route(view.identity.routes.overview, locale), label: t.featured }] : []),
    { href: localized("/events"), label: locale === "id" ? "Semua event" : "All events" },
  ];
  return <PublicV3Frame className="mpv3-homepage" brandHref={localized("/")} homeLabel={t.home} skipLabel={t.skip} navigationLabel={t.mainNav} navigation={navigation}
    headerEnd={<PublicV3Action href={localized("/login")}>{t.login}<ArrowRight aria-hidden="true" /></PublicV3Action>}
    footer={<><span>MIRACLE</span><p>{t.footer}</p></>}>
    <div className="mpv3-home-intro"><PublicV3Eyebrow>{t.frontRow}</PublicV3Eyebrow>{view && <span>{view.identity.game.name} / {view.identity.game.modeName}</span>}</div>
    {view ? <>
      <FeaturedEventHero view={view} locale={locale} gameSlug={games.find((game) => game.id === view.identity.game.id)?.slug} />
      <EventPulse view={view} locale={locale} />
      <PublicDiscoveryShortcuts view={view} locale={locale} />
    </> : <div role={error ? "alert" : "status"}><h1 className="mpv3-empty-heading">{t.unavailable}</h1><PublicV3EmptyState title={error ? t.error : t.empty} description={t.footer} /></div>}
    <section className="mpv3-section" aria-labelledby="other-events">
      <PublicV3SectionHeading id="other-events" title={t.other} number="02" action={<PublicV3Action variant="text" href={localized("/events")}>{t.allEvents}<ArrowRight aria-hidden="true" /></PublicV3Action>} />
      <PublicV3Tabs label={t.filters} variant="segmented" items={[{ id: "all", name: t.allGames }, ...games].map((game) => ({ href: localized(game.id === "all" ? "/" : "/?game=" + encodeURIComponent(game.id)), label: game.name, active: gameFilter === game.id }))} />
      {([["ongoing", t.ongoing, groups.ongoing], ["upcoming", t.upcoming, groups.upcoming], ["finished", t.archive, groups.finished]] as const).map(([key, label, rows]) => <section className="mpv3-lifecycle" data-lifecycle={key} key={key}>
        <h3>{label} <span>{rows.length}</span></h3>
        {rows.length ? <div className="mpv3-card-grid">{rows.map((entry) => <HomeEventCard key={entry.event.id} entry={entry} games={games} locale={locale} />)}</div> : <p className="mpv3-group-empty">{t.empty}</p>}
      </section>)}
    </section>
    {view && <aside className="mpv3-home-organizer"><PublicV3Eyebrow tone="muted">{t.organizer}</PublicV3Eyebrow><strong>{view.organizer.name}</strong>{view.organizer.verified && <span><ShieldCheck aria-hidden="true" />{t.verified}</span>}</aside>}
  </PublicV3Frame>;
}

function HomeEventCard({ entry, games, locale }: { entry: PublicDiscoveryEvent; games: readonly Game[]; locale: Locale }) {
  const t = homeCopy[locale];
  const stage = getPublicDiscoveryStage(entry);
  const label = { ongoing: t.ongoing, registration: t.registration, drawing: t.drawing, finished: t.finished }[stage];
  const href = resolvePublicV3Route(publicV3RouteTarget(entry.event.slug, "overview"), locale);
  return <article className="mpv3-event-card">
    <EventPosterStage eventName={entry.event.name} gameSlug={games.find((game) => game.id === entry.event.gameId)?.slug} variant="compact" eyebrow={gameName(games, entry.event.gameId)} />
    <div className="mpv3-event-card-copy"><PublicV3StatusBadge status={stage} label={label} /><h4><a href={href}>{entry.event.name}</a></h4><p>{gameName(games, entry.event.gameId)}</p><p>{homeDate(entry.event.startsAt, locale)}</p><p>{entry.teamCount}{entry.event.participantCap > 0 ? " / " + entry.event.participantCap : ""} {t.teams}</p><PublicV3Action variant="text" href={href}>{t.overview}<ArrowRight aria-hidden="true" /></PublicV3Action></div>
  </article>;
}

// Compatibility export for the unlocalized route and existing discovery consumers.
export { EventDirectory as PublicEventsCenterV3 } from "./EventDirectory";
