import { unstable_cache } from "next/cache";
import { BarChart3, CalendarDays, ListTree, Shield, Trophy, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { GameArt, StatusBadge } from "@/components/GameArt";
import { PublicHomeV2 } from "@/components/public-v2/PublicHomeV2";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getDefaultModeLabel } from "@/lib/platform/config";
import { getPublicEvents as getDemoPublicEvents } from "@/lib/platform/demo-store";
import { getAllGames, getBracketPreview, getGameForEvent, getPublicEvents, getTeamsForEvent } from "@/lib/platform/repository";
import type { Event, Game } from "@/lib/platform/types";

const getCachedPublicEvents = unstable_cache(getPublicEvents, ["public-events"], { revalidate: 30 });
const PUBLIC_EVENTS_TIMEOUT_MS = 2_000;

async function getHomepageEvents() {
  try {
    return await Promise.race([
      getCachedPublicEvents(),
      new Promise<Event[]>((resolve) => {
        setTimeout(() => resolve(getDemoPublicEvents()), PUBLIC_EVENTS_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    console.warn("homepage public events fallback", error);
    return getDemoPublicEvents();
  }
}

function ctaHref(event: Event) {
  if (event.status === "Ongoing" && !event.stream?.enabled) return `/events/${event.slug}/bracket` as `/events/${string}/bracket`;
  if (event.status === "Finished") return `/events/${event.slug}/standings` as `/events/${string}/standings`;
  return `/events/${event.slug}` as `/events/${string}`;
}

async function EventCard({
  event,
  game,
  priority = false,
}: {
  event: Event;
  game: Game;
  priority?: boolean;
}) {
  const t = await getTranslations("home");
  const modeLabel = getDefaultModeLabel(event.gameModeId, event.gameId);

  let ctaLabel: string;
  if (event.status === "Ongoing") {
    ctaLabel = event.stream?.enabled ? t("watchStream") : t("viewBracket");
  } else if (event.status === "Finished") {
    ctaLabel = t("viewStandings");
  } else {
    ctaLabel = t("viewEvent");
  }

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative">
        <GameArt gameId={event.gameId} logoUrl={event.logoUrl} entityName={event.name} priority={priority} />
        <StatusBadge status={event.status} />
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5 pt-10">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            {game.name} - {modeLabel}
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
            {t("upToTeams", { cap: event.participantCap, venue: event.venue })}
          </span>
        </div>

        <div className="mt-auto">
          <Link
            href={ctaHref(event)}
            className="block w-full rounded-xl bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            {ctaLabel}
          </Link>
        </div>
      </div>
    </article>
  );
}

export async function HomePageContent({
  searchParams,
}: {
  searchParams?: Promise<{ game?: string }>;
}) {
  const t = await getTranslations("home");
  const resolved = await searchParams;
  const gameFilter = resolved?.game ?? "all";

  const [events, games] = await Promise.all([getHomepageEvents(), Promise.resolve(getAllGames())]);

  const filteredEvents = gameFilter === "all" ? events : events.filter((event) => event.gameId === gameFilter);
  const featuredEvent = filteredEvents[0];
  const featuredGame = featuredEvent ? getGameForEvent(featuredEvent) : null;
  const featuredMode = featuredEvent ? getDefaultModeLabel(featuredEvent.gameModeId, featuredEvent.gameId) : null;
  const [featuredTeams, featuredBracket] = featuredEvent
    ? await Promise.all([
        getTeamsForEvent(featuredEvent.id).catch(() => []),
        getBracketPreview(featuredEvent.id).catch(() => []),
      ])
    : [[], []];
  const featuredTeamName = (teamId: string | null | undefined) =>
    featuredTeams.find((team) => team.id === teamId)?.name ?? "TBD";
  const quickLinks = featuredEvent
    ? [
        { label: t("viewEvent"), href: `/events/${featuredEvent.slug}`, icon: Trophy },
        { label: t("bracketShortcut"), href: `/events/${featuredEvent.slug}/bracket`, icon: ListTree },
        { label: t("participantsShortcut"), href: `/events/${featuredEvent.slug}/participants`, icon: Users },
        { label: t("leaderboardShortcut"), href: `/events/${featuredEvent.slug}/leaderboards`, icon: BarChart3 },
        { label: t("standingsShortcut"), href: `/events/${featuredEvent.slug}/standings`, icon: Shield },
      ]
    : [];

  if (isFeatureEnabled("public_visual_v2")) {
    return (
      <PublicHomeV2
        events={filteredEvents}
        games={games}
        featuredEvent={featuredEvent}
        featuredGame={featuredGame ?? undefined}
        featuredTeams={featuredTeams}
        featuredBracket={featuredBracket}
        gameFilter={gameFilter}
        labels={{
          ongoing: t("statusOngoing"),
          upNext: t("statusUpNext"),
          finished: t("statusFinished"),
          exploreEvent: t("exploreEvent"),
          allEvents: t("allEvents"),
          allGames: t("allGames"),
          teams: t("teamsLabel"),
          eventDrop: t("eventDrop"),
          liveFeed: t("liveFeed"),
          tickerEmpty: t("tickerEmpty"),
          noEvents: t("noEvents"),
          issue: t("issueLabel"),
        }}
      />
    );
  }

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl bg-slate-950 p-6 text-white shadow-xl shadow-blue-950/10 sm:p-8 lg:p-10">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{ background: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 54%, #0f766e 100%)" }}
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-28 opacity-30"
          style={{ background: "linear-gradient(180deg, transparent, rgba(15,23,42,0.8))" }}
        />

        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-end">
          <div className="max-w-2xl">
            <h1 className="text-4xl font-black leading-none tracking-tight text-white sm:text-5xl" style={{ textWrap: "balance" }}>
              {t("headline")}
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-blue-50">{t("description")}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={featuredEvent ? ctaHref(featuredEvent) : "/events"}
                className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
              >
                {featuredEvent ? t("viewDemoEvent") : t("allEvents")}
              </Link>
              <Link
                href="/events"
                className="rounded-full border border-white/25 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                {t("allEvents")}
              </Link>
              <Link
                href="/organizer"
                className="rounded-full border border-white/25 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Buat Turnamen
              </Link>
            </div>
          </div>

          {featuredEvent && featuredGame && (
            <div className="overflow-hidden rounded-2xl bg-white/95 text-slate-950 shadow-2xl shadow-slate-950/30">
              <div className="relative">
                <GameArt gameId={featuredEvent.gameId} logoUrl={featuredEvent.logoUrl} entityName={featuredEvent.name} priority />
                <StatusBadge status={featuredEvent.status} />
              </div>
              <div className="p-5 pt-10">
                <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">{t("featuredEvent")}</p>
                <h2 className="mt-1 text-2xl font-black leading-tight text-slate-950">{featuredEvent.name}</h2>
                <p className="mt-2 text-sm font-medium text-slate-500">
                  {featuredGame.name} - {featuredMode}
                </p>
                <div className="mt-4 grid gap-2 text-sm text-slate-600">
                  <span className="inline-flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-blue-500" />
                    {featuredEvent.startsAt}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <Users className="h-4 w-4 text-blue-500" />
                    {featuredTeams.length}/{featuredEvent.participantCap} teams - {featuredEvent.venue}
                  </span>
                </div>
                <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Arena Preview</p>
                    <p className="text-xs font-semibold text-blue-600">
                      {featuredEvent.prizePoolLabel ?? featuredEvent.organizerName ?? "Miracle Organizer"}
                    </p>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {featuredBracket.slice(0, 3).map((match) => (
                      <div key={match.id} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-xs text-slate-600">
                        <span className="font-semibold text-slate-800">Round {match.round}</span>
                        <span className="truncate">
                          {featuredTeamName(match.homeTeamId)} vs {featuredTeamName(match.awayTeamId)}
                        </span>
                      </div>
                    ))}
                    {featuredBracket.length === 0 ? (
                      <p className="text-xs text-slate-500">Bracket appears here when teams are ready.</p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {featuredEvent && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-slate-950">{t("exploreDemo")}</h2>
              <p className="mt-1 text-sm text-slate-500">{t("quickLinks")}</p>
            </div>
            <p className="max-w-xl text-sm font-medium text-slate-500">
              {t("joinNext")} {t("registrationNote")}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {quickLinks.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href as `/events/${string}`}
                  className="flex min-h-20 items-center gap-3 rounded-2xl bg-white p-4 font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:text-blue-700 hover:shadow-md"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <Icon className="h-5 w-5" />
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {([{ id: "all", name: t("allGames") }, ...games] as { id: string; name: string }[]).map((game) => (
          <Link
            key={game.id}
            href={(game.id === "all" ? "/" : `/?game=${game.id}`) as "/"}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
              gameFilter === game.id
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600"
            }`}
          >
            {game.name}
          </Link>
        ))}

        <span className="ml-auto text-sm text-slate-400">{t("eventCount", { count: filteredEvents.length })}</span>
      </div>

      {filteredEvents.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredEvents.map((event, index) => (
            <EventCard
              key={event.id}
              event={event}
              game={getGameForEvent(event)}
              priority={index === 0}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 py-16 text-center">
          <Trophy className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">{t("noEvents")}</p>
        </div>
      )}
    </div>
  );
}
