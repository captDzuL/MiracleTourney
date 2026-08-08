import { CalendarDays, Settings, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { redirectToActiveLocale } from "@/i18n/redirect";
import { captainAddPlayerAction, captainDeletePlayerAction, captainUpdatePlayerAction } from "@/lib/actions";
import { requireRole } from "@/lib/auth/session";
import { GameArt, StatusBadge } from "@/components/GameArt";
import {
  getCaptainTeams,
  getEvents,
  getGameForEvent,
  getModeForEvent,
  getPlayersForTeams,
  hasTempPassword,
} from "@/lib/platform/repository";
import type { Event, Game, GameMode, Player, Team } from "@/lib/platform/types";
import { buttonStyles } from "@/components/ui";

type TFn = (key: string, values?: Record<string, string | number>) => string;

export default async function CaptainPage({
  searchParams,
}: {
  searchParams?: Promise<{ edit?: string; confirm?: string; success?: string; error?: string }>;
}) {
  const user = await requireRole("captain");
  if (!user) {
    return redirectToActiveLocale("/login");
  }

  const t = await getTranslations("captain");
  const params = await searchParams;
  const editPlayerId = params?.edit;
  const confirmDeleteId = params?.confirm;
  const success = params?.success;
  const error = params?.error;

  const [teams, events, usingTempPassword] = await Promise.all([
    getCaptainTeams(user.id),
    getEvents(),
    hasTempPassword(user.id),
  ]);
  const allPlayers = await getPlayersForTeams(teams.map((team) => team.id));
  const teamsWithPlayers = teams.map((team) => ({
    team,
    players: allPlayers.filter((p) => p.teamId === team.id),
  }));

  return (
    <div className="space-y-6">
      {usingTempPassword && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {t("tempPasswordWarning")}{" "}
          <Link href="/captain/settings" className="font-semibold underline hover:text-amber-900">
            {t("changeNow")}
          </Link>
        </div>
      )}
      {success === "password-changed" && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {t("passwordChanged")}
        </div>
      )}
      {success === "player-added" && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {t("playerAdded")}
        </div>
      )}
      {success === "player-updated" && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {t("playerUpdated")}
        </div>
      )}
      {success === "player-deleted" && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {t("playerDeleted")}
        </div>
      )}
      {success === "registered" && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {t("registered")}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {decodeURIComponent(error)}
        </div>
      )}

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
              editPlayerId={editPlayerId}
              confirmDeleteId={confirmDeleteId}
              t={t as TFn}
            />
          );
        })}
      </div>
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
  editPlayerId,
  confirmDeleteId,
  t,
}: {
  team: Team;
  event: Event;
  game: Game;
  mode: GameMode;
  players: Player[];
  editPlayerId?: string;
  confirmDeleteId?: string;
  t: TFn;
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="relative">
        <GameArt gameId={game.id} entityName={team.name} />
        <StatusBadge status={event.status} />
      </div>

      <div className="space-y-6 p-5 pt-10">
        <div className="flex items-start justify-between gap-2">
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
              href="/captain/stats"
              className="mt-3 inline-block text-sm font-medium text-cyan-600 hover:text-cyan-500"
            >
              {t("submitStats")}
            </Link>
          </div>
          <Link
            href="/captain/settings"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition hover:border-slate-300 hover:text-slate-600"
            title={t("accountSettings")}
          >
            <Settings className="h-4 w-4" />
          </Link>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-700">
            {t("roster", { count: players.length })}
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {players.map((player) => {
              if (confirmDeleteId === player.id) {
                return (
                  <div
                    key={player.id}
                    className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-center"
                  >
                    <p className="text-xs font-semibold text-red-700">{t("deleteConfirm", { name: player.displayName })}</p>
                    <form action={captainDeletePlayerAction}>
                      <input type="hidden" name="playerId" value={player.id} />
                      <button
                        type="submit"
                        className="rounded-lg bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700"
                      >
                        {t("confirmDelete")}
                      </button>
                    </form>
                    <Link href="/captain" className="text-xs text-slate-500 hover:text-slate-700">
                      {t("cancelAction")}
                    </Link>
                  </div>
                );
              }

              if (editPlayerId === player.id) {
                return (
                  <form
                    key={player.id}
                    action={captainUpdatePlayerAction}
                    className="col-span-2 rounded-2xl border border-blue-200 bg-blue-50 p-3 sm:col-span-3"
                  >
                    <input type="hidden" name="playerId" value={player.id} />
                    <p className="mb-3 text-xs font-semibold text-blue-700">{t("editPlayerTitle", { name: player.displayName })}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="grid gap-1 text-xs text-slate-600">
                        {t("displayName")}
                        <input
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                          name="displayName"
                          defaultValue={player.displayName}
                          required
                        />
                      </label>
                      <label className="grid gap-1 text-xs text-slate-600">
                        {t("nickname")}
                        <input
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                          name="nickname"
                          defaultValue={player.nickname}
                          required
                        />
                      </label>
                      <label className="grid gap-1 text-xs text-slate-600">
                        {t("position")}
                        <select
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                          name="position"
                          defaultValue={player.position}
                        >
                          {mode.positions.map((pos) => (
                            <option key={pos} value={pos}>{pos}</option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1 text-xs text-slate-600">
                        {t("jersey")}
                        <input
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                          name="jerseyNumber"
                          type="number"
                          min={1}
                          max={99}
                          defaultValue={player.jerseyNumber ?? ""}
                        />
                      </label>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="submit"
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        {t("save")}
                      </button>
                      <Link
                        href="/captain"
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        {t("cancelAction")}
                      </Link>
                    </div>
                  </form>
                );
              }

              return (
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
                  <div className="mt-2 flex gap-1.5">
                    <Link
                      href={`/captain?edit=${player.id}`}
                      className="rounded-md px-2 py-0.5 text-[10px] font-medium text-slate-500 hover:bg-slate-200"
                    >
                      {t("edit")}
                    </Link>
                    <Link
                      href={`/captain?confirm=${player.id}`}
                      className="rounded-md px-2 py-0.5 text-[10px] font-medium text-red-400 hover:bg-red-50"
                    >
                      {t("delete")}
                    </Link>
                  </div>
                </div>
              );
            })}
            <a
              href="#add-player-form"
              className="flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-slate-200 p-3 text-slate-400 transition hover:border-blue-300 hover:text-blue-400"
            >
              <span className="text-2xl leading-none">+</span>
              <span className="text-xs">{t("addPlayerAnchor")}</span>
            </a>
          </div>
        </div>

        <form id="add-player-form" action={captainAddPlayerAction} className="grid gap-4">
          <input type="hidden" name="teamId" value={team.id} />
          <input type="hidden" name="eventId" value={team.eventId} />
          <h3 className="text-sm font-semibold text-slate-700">{t("addPlayerTitle")}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm text-slate-600">
              {t("displayName")}
              <input
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                name="displayName"
                placeholder={t("displayNamePlaceholder")}
              />
            </label>
            <label className="grid gap-1.5 text-sm text-slate-600">
              {t("nickname")}
              <input
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                name="nickname"
                placeholder={t("nicknamePlaceholder")}
              />
            </label>
            <label className="grid gap-1.5 text-sm text-slate-600">
              {t("position")}
              <select
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                name="position"
                defaultValue={mode.positions[0]}
              >
                {mode.positions.map((pos) => (
                  <option key={pos} value={pos}>{pos}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm text-slate-600">
              {t("jersey")} <span className="text-slate-400">{t("jerseyOptional")}</span>
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
              {t("addPlayerSubmit")}
            </button>
          </div>
        </form>
      </div>
    </article>
  );
}
