import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, Users } from "lucide-react";

import { captainAddPlayerAction } from "@/lib/actions";
import { requireRole } from "@/lib/auth/session";
import { GameArt, StatusBadge } from "@/components/GameArt";
import {
  getCaptainTeams,
  getEvents,
  getGameForEvent,
  getModeForEvent,
  getPlayersForTeams,
} from "@/lib/platform/repository";
import type { Event, Game, GameMode, Player, Team } from "@/lib/platform/types";
import { buttonStyles } from "@/components/ui";

export default async function CaptainPage() {
  const user = await requireRole("captain");
  if (!user) redirect("/login");

  const [teams, events] = await Promise.all([getCaptainTeams(user.id), getEvents()]);
  const allPlayers = await getPlayersForTeams(teams.map((t) => t.id));
  const teamsWithPlayers = teams.map((team) => ({
    team,
    players: allPlayers.filter((p) => p.teamId === team.id),
  }));

  return (
    <div className="space-y-8">
      {teamsWithPlayers.map(({ team, players }) => {
        const event = events.find((e) => e.id === team.eventId);
        if (!event) return null;
        const game = getGameForEvent(event);
        const mode = getModeForEvent(event);
        return (
          <TeamSection
            key={team.id}
            team={team}
            event={event}
            game={game}
            mode={mode}
            players={players}
          />
        );
      })}
    </div>
  );
}

function avatarGradient(position: string) {
  if (position === "Guard") return "from-[#1e3a8a] to-[#1d4ed8]";
  if (position === "Forward" || position === "Midfielder") return "from-[#052e16] to-[#14532d]";
  return "from-[#1e293b] to-[#334155]";
}

function TeamSection({
  team,
  event,
  game,
  mode,
  players,
}: {
  team: Team;
  event: Event;
  game: Game;
  mode: GameMode;
  players: Player[];
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="relative">
        <GameArt gameId={game.id} entityName={team.name} />
        <StatusBadge status={event.status} />
      </div>

      <div className="space-y-6 p-5 pt-10">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            {game.name} · {mode.name}
          </p>
          <h2 className="mt-1 text-xl font-black text-slate-900">{team.name}</h2>
          <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4 text-blue-400" /> {event.startsAt}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-4 w-4 text-blue-400" /> {event.venue}
            </span>
          </div>
          <Link
            href={"/captain/stats" as "/captain/stats"}
            className="mt-3 inline-block text-sm font-medium text-cyan-600 hover:text-cyan-500"
          >
            Submit match stats →
          </Link>
        </div>

        {/* Player grid */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-700">
            Roster · {players.length} player{players.length !== 1 ? "s" : ""}
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {players.map((player) => (
              <div key={player.id} className="relative rounded-2xl border border-slate-100 bg-slate-50 p-3">
                {player.jerseyNumber != null && (
                  <span className="absolute right-2 top-2 rounded-full bg-slate-700 px-1.5 py-0.5 text-[10px] font-bold text-slate-200">
                    #{player.jerseyNumber}
                  </span>
                )}
                <div
                  className={`mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${avatarGradient(player.position)} text-sm font-bold text-white`}
                >
                  {player.nickname.slice(0, 2).toUpperCase()}
                </div>
                <p className="truncate text-sm font-semibold text-slate-900">{player.displayName}</p>
                <span className="mt-1 inline-block rounded-full bg-cyan-400/15 px-2 py-0.5 text-xs text-cyan-700">
                  {player.nickname}
                </span>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                  {player.position}
                </p>
              </div>
            ))}
            {/* Anchor card */}
            <a
              href="#add-player-form"
              className="flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-slate-200 p-3 text-slate-400 transition hover:border-blue-300 hover:text-blue-400"
            >
              <span className="text-2xl leading-none">+</span>
              <span className="text-xs">Add player</span>
            </a>
          </div>
        </div>

        {/* Add player form */}
        <form id="add-player-form" action={captainAddPlayerAction} className="grid gap-4">
          <input type="hidden" name="teamId" value={team.id} />
          <input type="hidden" name="eventId" value={team.eventId} />
          <h3 className="text-sm font-semibold text-slate-700">Add player</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm text-slate-600">
              Display name
              <input
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                name="displayName"
                placeholder="Full name"
              />
            </label>
            <label className="grid gap-1.5 text-sm text-slate-600">
              Nickname / IGN
              <input
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                name="nickname"
                placeholder="IGN"
              />
            </label>
            <label className="grid gap-1.5 text-sm text-slate-600">
              Position
              <select
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                name="position"
                defaultValue={mode.positions[0]}
              >
                {mode.positions.map((pos) => (
                  <option key={pos} value={pos}>
                    {pos}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm text-slate-600">
              Jersey # <span className="text-slate-400">(optional)</span>
              <input
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                name="jerseyNumber"
                type="number"
                min={1}
                max={99}
                placeholder="10"
              />
            </label>
          </div>
          <div>
            <button className={`${buttonStyles.primary} text-sm`} type="submit">
              Add player
            </button>
          </div>
        </form>
      </div>
    </article>
  );
}
