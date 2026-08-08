import { unstable_cache } from "next/cache";
import Image from "next/image";
import { CalendarDays, Trophy, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { Pill, Section } from "@/components/ui";
import type { Event } from "@/lib/platform/types";
import { getGameForEvent, getPublicEvents } from "@/lib/platform/repository";

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

export default async function EventsPage() {
  const t = await getTranslations("events");
  const events = await getCachedPublicEvents().catch(() => fallbackEvents);

  return (
    <Section title={t("title")} description={t("description")}>
      <div className="grid gap-4">
        {events.map((event) => {
          const game = getGameForEvent(event);
          return (
            <Link
              key={event.id}
              href={`/events/${event.slug}`}
              className="grid gap-5 rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:border-cyan-300 hover:bg-white md:grid-cols-[minmax(0,1fr)_220px]"
            >
              <div>
                <div className="grid gap-4 md:grid-cols-[120px_minmax(0,1fr)]">
                  <div className="grid gap-3">
                    <div className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-white text-slate-400 shadow-sm">
                      {event.logoUrl ? (
                        <Image
                          src={event.logoUrl}
                          alt={`${event.name} logo`}
                          width={120}
                          height={120}
                          className="h-full w-full object-contain"
                          priority
                        />
                      ) : (
                        <div className="text-center">
                          <p className="text-lg font-semibold text-slate-700">{getInitials(event.name) || "EV"}</p>
                        </div>
                      )}
                    </div>
                    <div className={`flex min-h-[72px] items-end rounded-2xl border border-slate-200 bg-gradient-to-br ${game.accent} p-3`}>
                      <div>
                        <p className="mt-1 text-sm font-medium text-slate-900">{game.name}</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill>{game.name}</Pill>
                      <Pill>{event.format}</Pill>
                      <Pill tone={event.status === "Ongoing" ? "live" : "default"}>{event.status}</Pill>
                    </div>
                    <h2 className="mt-4 text-2xl font-semibold text-slate-900">{event.name}</h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{event.description}</p>
                  </div>
                </div>
              </div>
              <div className="grid gap-3 text-sm text-slate-500 md:content-start md:justify-items-end">
                <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:w-full">
                  <span className="inline-flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-cyan-500" />
                    {event.startsAt}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <Users className="h-4 w-4 text-cyan-500" />
                    {t("capTeams", { n: event.participantCap })}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-cyan-500" />
                    {event.venue}
                  </span>
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
