import { unstable_cache } from "next/cache";
import Link from "next/link";
import { CalendarDays, Trophy, Users } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Pill, Section } from "@/components/ui";
import type { Event } from "@/lib/platform/types";
import { getAllGames, getGameForEvent, getModeForEvent, getPublicEvents, getTeamsForEvent } from "@/lib/platform/repository";
import { getEventBackgroundUrl } from "@/lib/platform/visuals";

const getCachedPublicEvents = unstable_cache(getPublicEvents, ["public-events"], { revalidate: 30 });
const fallbackEvents: Event[] = [
  {
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
];

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams?: Promise<{ game?: string; status?: string }>;
}) {
  const t = await getTranslations("events");
  const locale = await getLocale().catch(() => undefined);
  const params = await searchParams;
  const gameFilter = params?.game ?? "all";
  const statusFilter = params?.status ?? "all";
  const [eventsRaw, games] = await Promise.all([
    getCachedPublicEvents().catch(() => fallbackEvents),
    Promise.resolve(getAllGames()),
  ]);
  const events = eventsRaw.filter((event) => {
    const gameMatches = gameFilter === "all" || event.gameId === gameFilter;
    const statusMatches = statusFilter === "all" || event.status.toLowerCase().replaceAll(" ", "-") === statusFilter;
    return gameMatches && statusMatches;
  });
  const teamsByEvent = new Map(
    await Promise.all(events.map(async (event) => [event.id, await getTeamsForEvent(event.id).catch(() => [])] as const)),
  );
  const statuses = [
    { id: "all", label: "Semua" },
    { id: "published", label: "Buka Pendaftaran" },
    { id: "ongoing", label: "Berlangsung" },
    { id: "finished", label: "Selesai" },
  ];

  function href(next: { game?: string; status?: string }) {
    const query = new URLSearchParams();
    const game = next.game ?? gameFilter;
    const status = next.status ?? statusFilter;
    if (game !== "all") query.set("game", game);
    if (status !== "all") query.set("status", status);
    const qs = query.toString();
    const base = locale === "id" || locale === "en" ? `/${locale}/events` : "/events";
    return qs ? `${base}?${qs}` : base;
  }

  return (
    <Section title={t("title")} description={t("description")}>
      <div className="mb-5 grid gap-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {statuses.map((status) => (
            <Link
              key={status.id}
              href={href({ status: status.id })}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                statusFilter === status.id
                  ? "border-cyan-400 bg-cyan-400 text-cyan-950"
                  : "border-slate-200 bg-white text-slate-600 hover:border-cyan-300 hover:text-cyan-700"
              }`}
            >
              {status.label}
            </Link>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[{ id: "all", name: "Semua Game" }, ...games].map((game) => (
            <Link
              key={game.id}
              href={href({ game: game.id })}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                gameFilter === game.id
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900"
              }`}
            >
              {game.name}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-4">
        {events.map((event) => {
          const game = getGameForEvent(event);
          const mode = getModeForEvent(event);
          const teams = teamsByEvent.get(event.id) ?? [];
          const backgroundUrl = getEventBackgroundUrl(event);
          return (
            <Link
              key={event.id}
              href={`/events/${event.slug}`}
              className="group relative grid gap-5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 p-5 text-white shadow-sm transition hover:border-cyan-300 hover:shadow-[0_24px_70px_rgba(15,23,42,0.18)] md:grid-cols-[minmax(0,1fr)_220px]"
              style={backgroundUrl ? { backgroundImage: `url(${backgroundUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-slate-950/88 via-slate-950/62 to-slate-950/20 transition group-hover:from-slate-950/82" />
              <div className="absolute inset-0 bg-slate-950/20" />
              <div className="relative">
                <div className="grid gap-4 md:grid-cols-[120px_minmax(0,1fr)]">
                  <div className="grid gap-3">
                    <div className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-white/35 bg-white/92 text-slate-500 shadow-sm">
                      {event.logoUrl ? (
                        <img
                          src={event.logoUrl}
                          alt={`${event.name} logo`}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <div className="text-center">
                          <p className="text-lg font-semibold text-slate-700">{getInitials(event.name) || "EV"}</p>
                        </div>
                      )}
                    </div>
                    <div className={`flex min-h-[72px] items-end rounded-2xl border border-white/20 bg-gradient-to-br ${game.accent} p-3 backdrop-blur-sm`}>
                      <div>
                        <p className="mt-1 text-sm font-medium text-white">{game.name}</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill>{game.name}</Pill>
                      <Pill>{mode.teamSize}v{mode.teamSize}</Pill>
                      <Pill>{event.format}</Pill>
                      <Pill tone={event.status === "Ongoing" ? "live" : "default"}>{event.status}</Pill>
                      {event.organizerVerified ? <Pill tone="success">Verified Organizer</Pill> : null}
                    </div>
                    <h2 className="mt-4 text-2xl font-semibold text-white">{event.name}</h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200">{event.description}</p>
                    <p className="mt-3 text-sm font-medium text-slate-100">
                      Organizer: {event.organizerName ?? "Miracle Organizer"}
                    </p>
                  </div>
                </div>
              </div>
              <div className="relative grid gap-3 text-sm text-slate-100 md:content-start md:justify-items-end">
                <div className="grid gap-3 rounded-2xl border border-white/25 bg-white/92 p-4 text-slate-600 shadow-sm backdrop-blur md:w-full">
                  <span className="inline-flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-cyan-500" />
                    {event.startsAt}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <Users className="h-4 w-4 text-cyan-500" />
                    {teams.length}/{event.participantCap} tim
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-cyan-500" />
                    {event.prizePoolLabel ?? event.venue}
                  </span>
                  {event.registrationFeeLabel ? (
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      {event.registrationFeeLabel}
                    </span>
                  ) : null}
                </div>
              </div>
            </Link>
          );
        })}
        {events.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
            {t("noEvents")}
          </div>
        ) : null}
      </div>
    </Section>
  );
}
