import Link from "next/link";
import { ArrowRight, CalendarDays, Medal, Shield, Video } from "lucide-react";

import { Pill, Section, StatCard } from "@/components/ui";
import { getEvents, getGameForEvent } from "@/lib/platform/demo-store";

export default function HomePage() {
  const events = getEvents();
  const highlighted = events.slice(0, 2);

  return (
    <div className="space-y-8">
      <section className="grid gap-6 rounded-[2rem] border border-cyan-400/15 bg-slate-950/40 p-8 lg:grid-cols-[1.4fr_0.9fr]">
        <div className="space-y-5">
          <Pill tone="success">Next.js MVP web platform</Pill>
          <div className="space-y-3">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Run multiple esports-style tournament events from one responsive control panel.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-300">
              Miracle FC League now has a public event hub, captain roster management, admin operations, bracket generation,
              league standings, player leaderboards, and event-level live stream support.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="rounded-full bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950" href="/events">
              Explore events
            </Link>
            <Link className="rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/5" href="/login">
              Enter captain/admin demo
            </Link>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <StatCard label="Game support" value="2" hint="Kuroko Street Rival 3v3 + Flashpeak 5v5" />
          <StatCard label="Competition modes" value="2" hint="Single elimination and full league standings" />
          <StatCard label="Role model" value="3" hint="Public viewer, captain, and admin" />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Why this MVP works" description="Built around clarity, speed, and future scale.">
          <div className="space-y-4 text-sm text-slate-300">
            <div className="flex gap-3">
              <Shield className="mt-0.5 h-4 w-4 text-cyan-300" />
              <p>One event = one game mode, so every bracket, roster, and leaderboard stays understandable.</p>
            </div>
            <div className="flex gap-3">
              <Medal className="mt-0.5 h-4 w-4 text-cyan-300" />
              <p>Game-specific player stats keep Kuroko and Flashpeak feeling distinct without fragmenting the platform.</p>
            </div>
            <div className="flex gap-3">
              <Video className="mt-0.5 h-4 w-4 text-cyan-300" />
              <p>Live stream support stays lightweight by linking or embedding only at the event level.</p>
            </div>
          </div>
        </Section>

        <Section title="Highlighted events" description="Pulled from the public event hub." className="lg:col-span-2">
          <div className="grid gap-4 md:grid-cols-2">
            {highlighted.map((event) => {
              const game = getGameForEvent(event);
              return (
                <Link
                  key={event.id}
                  href={`/events/${event.slug}`}
                  className="rounded-2xl border border-white/8 bg-white/5 p-5 transition hover:border-cyan-400/30 hover:bg-white/7"
                >
                  <div className="flex items-center justify-between">
                    <Pill>{game.name}</Pill>
                    {event.stream?.enabled && event.stream.isLive ? <Pill tone="live">Live now</Pill> : null}
                  </div>
                  <h3 className="mt-4 text-xl font-semibold text-white">{event.name}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{event.description}</p>
                  <div className="mt-4 flex items-center justify-between text-sm text-slate-300">
                    <span className="inline-flex items-center gap-2">
                      <CalendarDays className="h-4 w-4" />
                      {event.startsAt}
                    </span>
                    <span className="inline-flex items-center gap-2 font-medium text-cyan-300">
                      Open event
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </Section>
      </div>
    </div>
  );
}
