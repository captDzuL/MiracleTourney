import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CalendarDays, ListTree, Trophy, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { LiveStreamCard, Pill, Section, StatCard } from "@/components/ui";
import { getOrderedStatEntries, getStatKeysForMode } from "@/lib/platform/config";
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

function buildEventHref(slug: string, section: "participants" | "bracket" | "standings" | "leaderboards", locale?: "id" | "en") {
  const prefix = locale ? `/${locale}` : "";
  return `${prefix}/events/${slug}/${section}`;
}

export async function renderEventDetailPage(slug: string, locale?: "id" | "en") {
  const t = await getTranslations("eventDetail");
  const fallbackEvent = fallbackEventsBySlug[slug];
  const event = await getPublicEventBySlug(slug).catch(() => fallbackEvent ?? null);

  if (!event) notFound();

  const game = getGameForEvent(event);
  const mode = getModeForEvent(event);
  const trackedStatKeys = getStatKeysForMode(event.gameModeId, event.gameId);
  const [teams, bracket, leaderboard] = await Promise.all([
    getTeamsForEvent(event.id).catch(() => []),
    getBracketPreview(event.id).catch(() => []),
    getLeaderboardForEvent(event.id, event.gameId).catch(() => []),
  ]);
  const liveView = event.stream?.enabled ? getLiveStreamPresentation(event.stream.url) : null;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50 px-5 py-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Pill>{game.name}</Pill>
              <Pill>{mode.name}</Pill>
              <Pill>{event.format}</Pill>
              <Pill tone={event.stream?.enabled && event.stream.isLive ? "live" : "default"}>
                {event.stream?.enabled && event.stream.isLive ? t("liveNow") : event.status}
              </Pill>
            </div>
            <h1 className="mt-4 text-3xl font-semibold text-slate-950">{event.name}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">{event.description}</p>
          </div>

          <div className="flex flex-wrap gap-2 text-sm text-slate-600 lg:max-w-sm lg:justify-end">
            <EventFact icon={<CalendarDays className="h-4 w-4 text-cyan-600" />}>
              {event.registrationWindow}
            </EventFact>
            <EventFact icon={<Users className="h-4 w-4 text-cyan-600" />}>
              {t("teamCount", { registered: teams.length, cap: event.participantCap })}
            </EventFact>
            <EventFact icon={<Trophy className="h-4 w-4 text-cyan-600" />}>
              {event.venue}
            </EventFact>
          </div>
        </div>

        <div className="grid gap-px bg-slate-200 md:grid-cols-3">
          <div className="bg-white p-4">
            <StatCard
              label={t("bracketStat")}
              value={bracket.length}
              hint={event.format === "Single Elimination" ? t("bracketHint") : t("standingsHint")}
            />
          </div>
          <div className="bg-white p-4">
            <StatCard label={t("standingsStat")} value={mode.positions.length} hint={mode.positions.join(", ")} />
          </div>
          <div className="bg-white p-4">
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
        <Section title={t("quickLinks")} description={t("quickLinksDesc")} className="rounded-xl shadow-none">
          <div className="grid gap-3 text-sm">
            <EventLink href={buildEventHref(event.slug, "participants", locale)}>{t("participants")}</EventLink>
            <EventLink href={buildEventHref(event.slug, "bracket", locale)}>{t("bracketLink")}</EventLink>
            <EventLink href={buildEventHref(event.slug, "standings", locale)}>{t("standingsLink")}</EventLink>
            <EventLink href={buildEventHref(event.slug, "leaderboards", locale)}>{t("leaderboardLink")}</EventLink>
          </div>
        </Section>

        <Section title={t("formatSnapshot")} description={t("formatSnapshotDesc")} className="rounded-xl shadow-none">
          <div className="space-y-3 text-sm text-slate-700">
            <p className="flex items-center gap-2 font-medium text-slate-950">
              <ListTree className="h-4 w-4 text-cyan-600" /> {event.format}
            </p>
            <p>{t("mode", { n: mode.teamSize })}</p>
            <p>{t("rosterLimit", { n: mode.maxRosterSize })}</p>
            <p>{t("trackedStats", { stats: trackedStatKeys.join(", ") })}</p>
          </div>
        </Section>

        <Section title={t("topPerformer")} description={t("topPerformerDesc")} className="rounded-xl shadow-none">
          {leaderboard[0] ? (
            <div className="space-y-2 text-sm text-slate-700">
              <p className="text-lg font-semibold text-slate-950">{leaderboard[0].playerName}</p>
              <p>{leaderboard[0].position} - {leaderboard[0].matchesPlayed} matches</p>
              <p className="font-medium text-cyan-700">
                {getOrderedStatEntries(leaderboard[0].totalStats, event.gameModeId, event.gameId)
                  .slice(0, 3)
                  .map(([key, value]) => `${key}: ${value}`)
                  .join(" - ")}
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">{t("noStats")}</p>
          )}
        </Section>
      </div>
    </div>
  );
}

function EventFact({ children, icon }: { children: React.ReactNode; icon: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 ring-1 ring-slate-200">
      {icon}
      {children}
    </span>
  );
}

function EventLink({ children, href }: { children: React.ReactNode; href: string }) {
  return (
    <Link
      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-700 transition hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-800"
      href={href}
    >
      <span>{children}</span>
      <ArrowRight className="h-4 w-4 shrink-0" />
    </Link>
  );
}
