import { unstable_cache } from "next/cache";
import Link from "next/link";
import { CalendarDays, Trophy, Users } from "lucide-react";

import { getAllGames, getGameForEvent, getPublicEvents } from "@/lib/platform/repository";
import type { Event, Game } from "@/lib/platform/types";
import { GameArt, StatusBadge } from "@/components/GameArt";

const getCachedPublicEvents = unstable_cache(getPublicEvents, ["public-events"], { revalidate: 30 });


function ctaLabel(event: Event) {
  if (event.status === "Ongoing") return event.stream?.enabled ? "Watch Stream" : "View Bracket";
  if (event.status === "Finished") return "View Standings";
  return "View Event";
}

function ctaHref(event: Event) {
  if (event.status === "Ongoing" && !event.stream?.enabled) return `/events/${event.slug}/bracket` as `/events/${string}/bracket`;
  if (event.status === "Finished") return `/events/${event.slug}/standings` as `/events/${string}/standings`;
  return `/events/${event.slug}` as `/events/${string}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EventCard({ event, game, priority = false }: { event: Event; game: Game; priority?: boolean }) {
  const mode = game.id === "game-kuroko" ? "3v3" : "5v5";

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative">
        <GameArt gameId={event.gameId} logoUrl={event.logoUrl} entityName={event.name} priority={priority} />
        <StatusBadge status={event.status} />
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5 pt-10">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            {game.name} · {mode}
          </p>
          <h2 className="mt-1 text-lg font-bold leading-snug text-slate-900">{event.name}</h2>
        </div>

        <div className="grid gap-2 text-sm text-slate-500">
          <span className="inline-flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-blue-400" />
            {event.startsAt}
          </span>
          <span className="inline-flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-400" />
            Up to {event.participantCap} teams · {event.venue}
          </span>
        </div>

        <div className="mt-auto">
          <Link
            href={ctaHref(event)}
            className="block w-full rounded-xl bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            {ctaLabel(event)}
          </Link>
        </div>
      </div>
    </article>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<{ game?: string }>;
}) {
  const resolved = await searchParams;
  const gameFilter = resolved?.game ?? "all";

  const [events, games] = await Promise.all([getCachedPublicEvents(), Promise.resolve(getAllGames())]);

  const filteredEvents =
    gameFilter === "all" ? events : events.filter((e) => e.gameId === gameFilter);

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl p-8 sm:p-10" style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 60%, #312e81 100%)" }}>
        {/* Background geometry */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full" style={{ background: "rgba(255,255,255,0.04)" }} />
          <div className="absolute bottom-0 right-24 h-48 w-48 rounded-full" style={{ background: "rgba(255,255,255,0.03)" }} />
          <div className="absolute left-1/2 top-4 h-px w-96 -translate-x-1/2" style={{ background: "rgba(255,255,255,0.08)" }} />
        </div>

        <div className="relative max-w-2xl">
          <span className="inline-block rounded-full border border-blue-300/30 bg-blue-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-blue-200">
            Season 1 · Miracle FC
          </span>
          <h1 className="mt-4 text-4xl font-black leading-none tracking-tight text-white sm:text-5xl" style={{ textWrap: "balance" }}>
            Discover Your Next Victory
          </h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-blue-100">
            Compete in Kuroko no Basket and Flashpeak tournaments — from open brackets to season finals, your journey starts here.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
            >
              Register Your Team
            </Link>
            <Link
              href="/events"
              className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              All Events
            </Link>
          </div>
        </div>
      </section>

      {/* Filter tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {([{ id: "all", name: "All Games" }, ...games] as { id: string; name: string }[]).map((g) => (
          <Link
            key={g.id}
            href={(g.id === "all" ? "/" : `/?game=${g.id}`) as "/"}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
              gameFilter === g.id
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600"
            }`}
          >
            {g.name}
          </Link>
        ))}

        <span className="ml-auto text-sm text-slate-400">
          {filteredEvents.length} {filteredEvents.length === 1 ? "event" : "events"}
        </span>
      </div>

      {/* Event grid */}
      {filteredEvents.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredEvents.map((event, i) => (
            <EventCard key={event.id} event={event} game={getGameForEvent(event)} priority={i === 0} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 py-16 text-center">
          <Trophy className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">No public events yet for this game.</p>
        </div>
      )}
    </div>
  );
}
