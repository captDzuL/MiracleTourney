import { notFound } from "next/navigation";
import { CalendarDays, ListTree, Trophy, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { LiveStreamCard, Pill, Section, StatCard } from "@/components/ui";
import type { Event } from "@/lib/platform/types";
import {
  getBracketPreview,
  getGameForEvent,
  getLeaderboardForEvent,
  getModeForEvent,
  getPublicEventBySlug,
  getTeamsForEvent,
} from "@/lib/platform/repository";
import { getLiveStreamPresentation } from "@/lib/tournament/engine";

const fallbackEventsBySlug: Record<string, Event> = {
  "miracle-league": {
    id: "fallback-miracle-league",
    slug: "miracle-league",
    name: "Miracle Fast Tour",
    description: "New event created from admin panel.",
    logoUrl: "https://lh3.googleusercontent.com/d/1m01dWpxKA6qXRzfFRrEovFzho1nTnV9B",
    gameId: "game-flashpeak",
    gameModeId: "mode-flashpeak-5v5",
    format: "Single Elimination",
    status: "Ongoing",
    participantCap: 32,
    registrationWindow: "TBD",
    startsAt: "TBD",
    venue: "Online",
  },
  "kuroko-summer-cup": {
    id: "fallback-kuroko-summer-cup",
    slug: "kuroko-summer-cup",
    name: "Kuroko Street Rival Summer Cup",
    description: "Demo tournament for public browsing and testing flows.",
    gameId: "game-kuroko",
    gameModeId: "mode-kuroko-3v3",
    format: "Single Elimination",
    status: "Published",
    participantCap: 8,
    registrationWindow: "Open",
    startsAt: "2026-09-01",
    venue: "Online",
  },
};

export async function renderEventDetailPage(slug: string) {
  const t = await getTranslations("eventDetail");
  const fallbackEvent = fallbackEventsBySlug[slug];
  const event = await getPublicEventBySlug(slug).catch(() => fallbackEvent ?? null);

  if (!event) notFound();

  const game = getGameForEvent(event);
  const mode = getModeForEvent(event);
  const [teams, bracket, leaderboard] = await Promise.all([
    getTeamsForEvent(event.id).catch(() => []),
    getBracketPreview(event.id).catch(() => []),
    getLeaderboardForEvent(event.id, event.gameId).catch(() => []),
  ]);
  const liveView = event.stream?.enabled ? getLiveStreamPresentation(event.stream.url) : null;

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-white/10 bg-slate-900/70 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Pill>{game.name}</Pill>
          <Pill>{mode.name}</Pill>
          <Pill>{event.format}</Pill>
          <Pill tone={event.stream?.enabled && event.stream.isLive ? "live" : "default"}>
            {event.stream?.enabled && event.stream.isLive ? t("liveNow") : event.status}
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
                {t("teamCount", { registered: teams.length, cap: event.participantCap })}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-2">
                <Trophy className="h-4 w-4 text-cyan-300" />
                {event.venue}
              </span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            <StatCard
              label={t("bracketStat")}
              value={bracket.length}
              hint={event.format === "Single Elimination" ? t("bracketHint") : t("standingsHint")}
            />
            <StatCard label={t("standingsStat")} value={mode.positions.length} hint={mode.positions.join(", ")} />
            <StatCard label={t("leaderboardStat")} value={leaderboard.length} hint={t("leaderboardHint")} />
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
        <Section title={t("quickLinks")} description={t("quickLinksDesc")}>
          <div className="grid gap-3 text-sm">
            <Link className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3 hover:bg-white/8" href={`/events/${event.slug}/participants`}>
              {t("participants")}
            </Link>
            <Link className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3 hover:bg-white/8" href={`/events/${event.slug}/bracket`}>
              {t("bracketLink")}
            </Link>
            <Link className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3 hover:bg-white/8" href={`/events/${event.slug}/standings`}>
              {t("standingsLink")}
            </Link>
            <Link className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3 hover:bg-white/8" href={`/events/${event.slug}/leaderboards`}>
              {t("leaderboardLink")}
            </Link>
          </div>
        </Section>

        <Section title={t("formatSnapshot")} description={t("formatSnapshotDesc")}>
          <div className="space-y-3 text-sm text-slate-300">
            <p className="flex items-center gap-2"><ListTree className="h-4 w-4 text-cyan-300" /> {event.format}</p>
            <p>{t("mode", { n: mode.teamSize })}</p>
            <p>{t("rosterLimit", { n: mode.maxRosterSize })}</p>
            <p>{t("trackedStats", { stats: mode.statKeys.join(", ") })}</p>
          </div>
        </Section>

        <Section title={t("topPerformer")} description={t("topPerformerDesc")}>
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
            <p className="text-sm text-slate-400">{t("noStats")}</p>
          )}
        </Section>
      </div>
    </div>
  );
}
