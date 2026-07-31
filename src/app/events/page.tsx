import Link from "next/link";
import { CalendarDays, Trophy, Users } from "lucide-react";

import { Pill, Section } from "@/components/ui";
import { getGameForEvent, getPublicEvents } from "@/lib/platform/demo-store";

export default function EventsPage() {
  const events = getPublicEvents();

  return (
    <Section
      title="Event hub"
      description="Public list of published, ongoing, and archived competition events."
    >
      <div className="grid gap-4">
        {events.map((event) => {
          const game = getGameForEvent(event);
          return (
            <Link
              key={event.id}
              href={`/events/${event.slug}`}
              className="grid gap-4 rounded-2xl border border-white/8 bg-white/5 p-5 transition hover:border-cyan-400/30 md:grid-cols-[1fr_auto]"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Pill>{game.name}</Pill>
                  <Pill>{event.format}</Pill>
                  <Pill tone={event.status === "Ongoing" ? "live" : "default"}>{event.status}</Pill>
                </div>
                <h2 className="mt-4 text-xl font-semibold text-white">{event.name}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{event.description}</p>
              </div>
              <div className="grid gap-3 text-sm text-slate-300">
                <span className="inline-flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-cyan-300" />
                  {event.startsAt}
                </span>
                <span className="inline-flex items-center gap-2">
                  <Users className="h-4 w-4 text-cyan-300" />
                  Cap {event.participantCap} teams
                </span>
                <span className="inline-flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-cyan-300" />
                  {event.venue}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </Section>
  );
}
