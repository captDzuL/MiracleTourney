import React from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  ListTree,
  Radio,
  ShieldCheck,
  Trophy,
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

export function PublicDiscoveryHomeV3({
  locale,
  entries,
  games,
  gameFilter,
  loadState,
}: {
  locale: Locale;
  entries: readonly PublicDiscoveryEvent[];
  games: readonly Game[];
  gameFilter: string;
  loadState: LoadState;
}) {
  const t = copy[locale];
  const featured = chooseFeaturedDiscoveryEvent(entries);
  const otherGroups = groupDiscoveryEvents(entries.filter((entry) => entry.event.id !== featured?.event.id));
  const stage = featured ? stageCopy(featured, locale) : null;
  const base = featured ? `/${locale}/events/${featured.event.slug}` : `/${locale}/events`;
  const shortcuts = featured ? [
    { label: t.overview, href: base, icon: Trophy },
    { label: t.participants, href: `${base}/participants`, icon: Users },
    { label: t.schedule, href: `${base}/schedule`, icon: CalendarDays },
    { label: t.bracket, href: `${base}/bracket`, icon: ListTree },
    { label: t.leaderboard, href: `${base}/leaderboards`, icon: BarChart3 },
  ] : [];

  return (
    <div className="grid gap-8 bg-[#071012] text-[#f4f1e9]">
      {featured ? (
        <>
          <section className="relative isolate min-h-[520px] overflow-hidden border border-white/15 bg-[#0b1519] p-6 sm:p-10 lg:p-14">
            <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_76%_25%,rgba(91,105,255,0.34),transparent_32%),linear-gradient(120deg,rgba(9,22,25,0.98)_12%,rgba(9,22,25,0.78)_55%,rgba(15,24,48,0.9))]" />
            <div className="pointer-events-none absolute -right-16 top-8 -z-10 h-72 w-72 rotate-45 border-[42px] border-violet-400/10" />
            <div className="flex h-full max-w-4xl flex-col justify-end pt-36">
              <p className="flex items-center gap-2 text-xs font-black tracking-[0.22em] text-[#c7ff35]">
                {featured.hasLiveMatch ? <Radio aria-hidden="true" size={16} /> : <ShieldCheck aria-hidden="true" size={16} />}
                {stage?.label} / {gameName(games, featured.event.gameId)}
              </p>
              <h1 className="mt-5 max-w-4xl text-5xl font-black uppercase leading-[0.94] tracking-[-0.045em] sm:text-7xl">{featured.event.name}</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-white/70">{featured.event.description}</p>
              <p className="mt-4 text-sm font-bold text-cyan-200">{stage?.action}</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href={base} className="miracle-focus-ring inline-flex min-h-11 items-center gap-2 bg-[#c7ff35] px-5 py-3 text-sm font-black uppercase text-[#071012]">
                  {t.explore}<ArrowRight aria-hidden="true" size={16} />
                </Link>
                <Link href={`/${locale}/events`} className="miracle-focus-ring inline-flex min-h-11 items-center border border-white/35 px-5 py-3 text-sm font-black uppercase text-white">
                  {t.allEvents}
                </Link>
              </div>
            </div>
            <dl className="absolute inset-x-0 bottom-0 grid grid-cols-2 border-t border-white/15 bg-[#071012]/90 md:grid-cols-4">
              {[
                [locale === "id" ? "Mulai" : "Starts", featured.event.startsAt],
                [locale === "id" ? "Venue" : "Venue", featured.event.venue],
                [locale === "id" ? "Prize pool" : "Prize pool", featured.event.prizePoolLabel ?? "—"],
                [locale === "id" ? "Peserta" : "Teams", `${featured.teamCount}/${featured.event.participantCap}`],
              ].map(([label, value]) => <div key={label} className="border-r border-white/10 p-4"><dt className="text-[10px] font-bold uppercase tracking-widest text-white/45">{label}</dt><dd className="mt-1 text-sm font-bold">{value}</dd></div>)}
            </dl>
          </section>

          <nav aria-label={locale === "id" ? "Navigasi event utama" : "Featured event navigation"} className="grid grid-cols-2 border border-white/15 sm:grid-cols-5">
            {shortcuts.map(({ label, href, icon: Icon }) => <Link key={href} href={href} className="miracle-focus-ring flex min-h-20 items-center gap-3 border-b border-r border-white/10 bg-[#0c1518] px-4 font-bold transition hover:bg-white/5 hover:text-[#c7ff35]"><Icon aria-hidden="true" size={18} />{label}</Link>)}
          </nav>
        </>
      ) : <HonestEmpty locale={locale} loadState={loadState} />}

      <section className="grid gap-5" aria-labelledby="other-events">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-xs font-bold tracking-[0.2em] text-cyan-300">MIRACLE LEAGUE</p><h2 id="other-events" className="mt-2 text-3xl font-black uppercase">{t.otherEvents}</h2></div>
          <Link href={`/${locale}/events`} className="miracle-focus-ring inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#c7ff35]">{t.allEvents}<ArrowRight size={16} /></Link>
        </div>
        {[
          [t.ongoing, otherGroups.ongoing],
          [t.upcoming, otherGroups.upcoming],
          [t.finishedGroup, otherGroups.finished],
        ].map(([label, group]) => {
          const rows = group as PublicDiscoveryEvent[];
          if (!rows.length) return null;
          return <section key={label as string}><h3 className="mb-3 text-sm font-black uppercase tracking-[0.16em] text-white/55">{label as string} <span className="text-[#c7ff35]">{rows.length}</span></h3><div className="grid gap-3">{rows.map((entry) => <EventCard key={entry.event.id} entry={entry} games={games} locale={locale} />)}</div></section>;
        })}
      </section>

      <nav aria-label={locale === "id" ? "Filter game" : "Game filters"} className="flex gap-2 overflow-x-auto pb-2">
        {[{ id: "all", name: t.allGames }, ...games].map((game) => {
          const href = game.id === "all" ? `/${locale}` : `/${locale}?game=${encodeURIComponent(game.id)}`;
          return <Link key={game.id} href={href} aria-current={gameFilter === game.id ? "page" : undefined} className="miracle-focus-ring inline-flex min-h-11 shrink-0 items-center border border-white/20 px-4 text-xs font-bold uppercase tracking-wide aria-[current=page]:border-[#c7ff35] aria-[current=page]:text-[#c7ff35]">{game.name}</Link>;
        })}
      </nav>
    </div>
  );
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
