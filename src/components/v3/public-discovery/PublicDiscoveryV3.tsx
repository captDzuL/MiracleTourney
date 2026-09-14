import React from "react";
import Link from "next/link";
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
  CalendarDays,
  ShieldCheck,
  Users,
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

const copy = {
  id: {
    live: "BERLANGSUNG",
    drawing: "DRAWING RESMI",
    registration: "PENDAFTARAN",
    finished: "SELESAI",
    liveAction: "Ikuti pertandingan yang sedang hidup",
    drawingAction: "Lihat hasil drawing dan jalur menuju juara",
    registrationAction: "Daftarkan tim sebelum slot penuh",
    finishedAction: "Lihat juara, penghargaan, dan hasil akhir",
    overview: "Overview",
    participants: "Peserta",
    schedule: "Jadwal",
    bracket: "Bracket",
    leaderboard: "Leaderboard",
    allEvents: "Lihat semua event",
    otherEvents: "Event lain",
    ongoing: "Berlangsung",
    upcoming: "Akan datang",
    finishedGroup: "Selesai",
    eventCenter: "Event Center",
    centerDescription: "Temukan event yang hidup sekarang, pendaftaran berikutnya, dan arsip hasil resmi.",
    all: "Semua",
    allGames: "Semua game",
    archive: "Arsip selesai",
    empty: "Belum ada event dalam filter ini.",
    error: "Data event belum dapat dimuat. Coba lagi beberapa saat.",
    teams: "tim",
    explore: "Buka event",
  },
  en: {
    live: "LIVE NOW",
    drawing: "OFFICIAL DRAW",
    registration: "REGISTRATION",
    finished: "FINISHED",
    liveAction: "Follow the match happening now",
    drawingAction: "See the official draw and road to the title",
    registrationAction: "Register before the slots fill up",
    finishedAction: "See champions, awards, and final results",
    overview: "Overview",
    participants: "Participants",
    schedule: "Schedule",
    bracket: "Bracket",
    leaderboard: "Leaderboard",
    allEvents: "View all events",
    otherEvents: "Other events",
    ongoing: "Ongoing",
    upcoming: "Upcoming",
    finishedGroup: "Finished",
    eventCenter: "Event Center",
    centerDescription: "Find live events, upcoming registrations, and the official results archive.",
    all: "All",
    allGames: "All games",
    archive: "Finished archive",
    empty: "No events match this filter.",
    error: "Event data is temporarily unavailable. Please try again shortly.",
    teams: "teams",
    explore: "Open event",
  },
} as const;

function stageCopy(entry: PublicDiscoveryEvent, locale: Locale) {
  const t = copy[locale];
  const stage = getPublicDiscoveryStage(entry);
  return {
    label: stage === "ongoing" ? t.live : stage === "drawing" ? t.drawing : stage === "registration" ? t.registration : t.finished,
    action: stage === "ongoing" ? t.liveAction : stage === "drawing" ? t.drawingAction : stage === "registration" ? t.registrationAction : t.finishedAction,
  };
}

function gameName(games: readonly Game[], gameId: string) {
  return games.find((game) => game.id === gameId)?.name ?? gameId;
}

function EventCard({
  entry,
  games,
  locale,
}: {
  entry: PublicDiscoveryEvent;
  games: readonly Game[];
  locale: Locale;
}) {
  const t = copy[locale];
  const stage = stageCopy(entry, locale);
  const href = `/${locale}/events/${entry.event.slug}`;
  return (
    <article className="group grid min-w-0 gap-4 border border-white/15 bg-[#0c1518] p-5 transition hover:border-[#c7ff35]/60 md:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-black tracking-[0.18em]">
          <span className={getPublicDiscoveryStage(entry) === "ongoing" ? "text-[#c7ff35]" : "text-cyan-300"}>{stage.label}</span>
          <span className="text-white/35">/</span>
          <span className="text-white/55">{gameName(games, entry.event.gameId)}</span>
        </div>
        <h3 className="mt-3 break-words text-xl font-black uppercase leading-tight text-[#f4f1e9]">{entry.event.name}</h3>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-white/60">{entry.event.description}</p>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-white/55">
          <span className="inline-flex items-center gap-2"><CalendarDays size={15} />{entry.event.startsAt}</span>
          <span className="inline-flex items-center gap-2"><Users size={15} />{entry.teamCount}/{entry.event.participantCap} {t.teams}</span>
        </div>
      </div>
      <Link href={href} className="miracle-focus-ring inline-flex min-h-11 items-center justify-center gap-2 self-end border border-[#c7ff35] px-4 py-2 text-sm font-black uppercase tracking-wide text-[#c7ff35] transition hover:bg-[#c7ff35] hover:text-[#071012]">
        {t.explore}<ArrowRight aria-hidden="true" size={16} />
      </Link>
    </article>
  );
}

function HonestEmpty({ locale, loadState }: { locale: Locale; loadState: LoadState }) {
  const t = copy[locale];
  return (
    <div role={loadState === "error" ? "alert" : "status"} className="border border-dashed border-white/20 bg-[#0c1518] p-8 text-center text-sm text-white/60">
      {loadState === "error" ? t.error : t.empty}
    </div>
  );
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

export function PublicEventsCenterV3({
  locale,
  entries,
  filteredEntries,
  games,
  filters,
  loadState,
}: {
  locale: Locale;
  entries: readonly PublicDiscoveryEvent[];
  filteredEntries: readonly PublicDiscoveryEvent[];
  games: readonly Game[];
  filters: { game: string; status: string };
  loadState: LoadState;
}) {
  const t = copy[locale];
  const groups = groupDiscoveryEvents(filteredEntries);
  const counts = {
    all: entries.length,
    ongoing: entries.filter((entry) => getPublicDiscoveryStage(entry) === "ongoing").length,
    upcoming: entries.filter((entry) => ["drawing", "registration"].includes(getPublicDiscoveryStage(entry))).length,
    finished: entries.filter((entry) => getPublicDiscoveryStage(entry) === "finished").length,
  };
  const href = (next: Partial<typeof filters>) => {
    const selected = { ...filters, ...next };
    const query = new URLSearchParams();
    if (selected.game !== "all") query.set("game", selected.game);
    if (selected.status !== "all") query.set("status", selected.status);
    return `/${locale}/events${query.size ? `?${query}` : ""}`;
  };
  const statusFilters = [
    ["all", t.all],
    ["ongoing", t.ongoing],
    ["upcoming", t.upcoming],
    ["finished", t.finishedGroup],
  ] as const;

  return (
    <div className="grid gap-7 bg-[#071012] text-[#f4f1e9]">
      <header className="border-b border-white/15 py-8">
        <p className="text-xs font-black tracking-[0.22em] text-[#c7ff35]">MIRACLE LEAGUE</p>
        <h1 className="mt-3 text-5xl font-black uppercase tracking-[-0.04em]">{t.eventCenter}</h1>
        <p className="mt-3 max-w-2xl text-white/60">{t.centerDescription}</p>
      </header>
      <nav aria-label={locale === "id" ? "Filter status" : "Status filters"} className="flex gap-2 overflow-x-auto">
        {statusFilters.map(([id, label]) => <Link key={id} href={href({ status: id })} aria-current={filters.status === id ? "page" : undefined} className="miracle-focus-ring inline-flex min-h-11 shrink-0 items-center gap-2 border border-white/20 px-4 text-xs font-black uppercase tracking-wide aria-[current=page]:border-[#c7ff35] aria-[current=page]:bg-[#c7ff35] aria-[current=page]:text-[#071012]">{label}<span>{counts[id]}</span></Link>)}
      </nav>
      <nav aria-label={locale === "id" ? "Filter game" : "Game filters"} className="flex gap-2 overflow-x-auto">
        {[{ id: "all", name: t.allGames }, ...games].map((game) => <Link key={game.id} href={href({ game: game.id })} aria-current={filters.game === game.id ? "page" : undefined} className="miracle-focus-ring inline-flex min-h-11 shrink-0 items-center border border-white/20 px-4 text-xs font-bold uppercase tracking-wide aria-[current=page]:border-cyan-300 aria-[current=page]:text-cyan-300">{game.name}</Link>)}
      </nav>

      {loadState === "error" || !filteredEntries.length ? <HonestEmpty locale={locale} loadState={loadState} /> : null}
      {[
        [t.ongoing, groups.ongoing],
        [t.upcoming, groups.upcoming],
        [t.archive, groups.finished],
      ].map(([label, group]) => {
        const rows = group as PublicDiscoveryEvent[];
        if (!rows.length) return null;
        return <section key={label as string} className="grid gap-3"><h2 className="text-2xl font-black uppercase">{label as string} <span className="text-[#c7ff35]">{rows.length}</span></h2>{rows.map((entry) => <EventCard key={entry.event.id} entry={entry} games={games} locale={locale} />)}</section>;
      })}
    </div>
  );
}
