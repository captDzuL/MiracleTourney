import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, ListTree, Trophy, Users } from "lucide-react";

import { LiveStreamCard, Pill, Section, StatCard } from "@/components/ui";
import {
  getBracketPreview,
  getGameForEvent,
  getLeaderboardForEvent,
  getModeForEvent,
  getPublicEventBySlug,
  getTeamsForEvent,
} from "@/lib/platform/demo-store";
import { getLiveStreamPresentation } from "@/lib/tournament/engine";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = getPublicEventBySlug(slug);

  if (!event) notFound();

  const game = getGameForEvent(event);
  const mode = getModeForEvent(event);
  const teams = getTeamsForEvent(event.id);
  const bracket = getBracketPreview(event.id);
  const leaderboard = getLeaderboardForEvent(event.id);
  const liveView = event.stream?.enabled ? getLiveStreamPresentation(event.stream.url) : null;

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-white/10 bg-slate-900/70 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Pill>{game.name}</Pill>
          <Pill>{mode.name}</Pill>
          <Pill>{event.format}</Pill>
          <Pill tone={event.stream?.enabled && event.stream.isLive ? "live" : "default"}>
            {event.stream?.enabled && event.stream.isLive ? "Live now" : event.status}
          </Pill>
        </div>
        <div className="mt-5 grid gap-6 lg:grid-cols-[1.35fr_0.85fr]">
          <div>
            <h1 className="text-3xl font-semibold text-white">{event.name}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">{event.description}</p>
            <div className="mt-6 flex flex-wrap gap-3 text-sm text-slate-300">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-2">
                <CalendarDays className="h-4 w-4 text-cyan-300" />
                {event.registrationWindow}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-2">
                <Users className="h-4 w-4 text-cyan-300" />
                {teams.length}/{event.participantCap} registered teams
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-2">
                <Trophy className="h-4 w-4 text-cyan-300" />
                {event.venue}
              </span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            <StatCard
              label="Bracket / fixtures"
              value={bracket.length}
              hint={
                event.format === "Single Elimination"
                  ? "Projected from teams and completed match outcomes"
                  : "Generated from event format"
              }
            />
            <StatCard label="Tracked positions" value={mode.positions.length} hint={mode.positions.join(", ")} />
            <StatCard label="Leaderboard entries" value={leaderboard.length} hint="Aggregated from player match stats" />
          </div>
        </div>
      </section>

      {event.stream?.enabled && liveView ? (
        <LiveStreamCard
          label={event.stream.label}
          watchUrl={event.stream.url}
          embedUrl={liveView.embedUrl}
          shouldEmbed={liveView.shouldEmbed}
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Quick links" description="Public navigation for this event.">
          <div className="grid gap-3 text-sm">
            <Link className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3 hover:bg-white/8" href={`/events/${event.slug}/participants`}>
              Participant list
            </Link>
            <Link className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3 hover:bg-white/8" href={`/events/${event.slug}/bracket`}>
              Bracket / fixtures
            </Link>
            <Link className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3 hover:bg-white/8" href={`/events/${event.slug}/standings`}>
              Standings
            </Link>
            <Link className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3 hover:bg-white/8" href={`/events/${event.slug}/leaderboards`}>
              Player leaderboard
            </Link>
          </div>
        </Section>

        <Section title="Format snapshot" description="How this event is configured.">
          <div className="space-y-3 text-sm text-slate-300">
            <p className="flex items-center gap-2"><ListTree className="h-4 w-4 text-cyan-300" /> {event.format}</p>
            <p>Mode: {mode.teamSize}v{mode.teamSize}</p>
            <p>Roster limit: up to {mode.maxRosterSize} players</p>
            <p>Tracked stats: {mode.statKeys.join(", ")}</p>
          </div>
        </Section>

        <Section title="Top performer" description="Live aggregate preview from match stats.">
          {leaderboard[0] ? (
            <div className="space-y-2 text-sm text-slate-300">
              <p className="text-lg font-semibold text-white">{leaderboard[0].playerName}</p>
              <p>{leaderboard[0].position} · {leaderboard[0].matchesPlayed} matches</p>
              <p className="text-cyan-300">
                {Object.entries(leaderboard[0].totalStats)
                  .slice(0, 3)
                  .map(([key, value]) => `${key}: ${value}`)
                  .join(" · ")}
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              Player stats will appear after roster and match-stat entry is recorded.
            </p>
          )}
        </Section>
      </div>
    </div>
  );
}
