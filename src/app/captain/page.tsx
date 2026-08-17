import { CalendarDays, Plus, Settings, Trophy, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { redirectToActiveLocale } from "@/i18n/redirect";
import { captainAddPlayerAction, captainDeletePlayerAction, captainSetDisplayCaptainAction, captainUpdatePlayerAction } from "@/lib/actions";
import { requireRole } from "@/lib/auth/session";
import { GameArt, StatusBadge } from "@/components/GameArt";
import {
  getCaptainTeams,
  getCertificatesForEvents,
  getEventsByIds,
  getGameForEvent,
  getModeForEvent,
  getPlayersForTeams,
  hasTempPassword,
} from "@/lib/platform/repository";
import type { Certificate } from "@/lib/platform/types";
import type { Event, Game, GameMode, Player, Team } from "@/lib/platform/types";
import { ShareCertificateButton } from "@/components/ShareCertificateButton";

type TFn = (key: string, values?: Record<string, string | number>) => string;

const inputClass = "rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100";
const labelClass = "grid gap-2 text-sm font-medium text-slate-700";
const quietButton = "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400";
const primaryButton = "inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-400 px-3.5 py-2.5 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400";
const dangerButton = "inline-flex items-center justify-center rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400";

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

  const [teams, usingTempPassword] = await Promise.all([
    getCaptainTeams(user.id),
    hasTempPassword(user.id),
  ]);
  const teamIds = teams.map((team) => team.id);
  const eventIds = [...new Set(teams.map((team) => team.eventId))];
  const [events, allPlayers, certificatesByEvent] = await Promise.all([
    getEventsByIds(eventIds),
    getPlayersForTeams(teamIds),
    getCertificatesForEvents(eventIds),
  ]);
  const teamsWithPlayers = teams.map((team) => ({
    team,
    players: allPlayers.filter((player) => player.teamId === team.id),
  }));

  const certificates = new Map<string, Certificate | null>(
    teams.map((team) => {
      const cert = certificatesByEvent.get(team.eventId);
      return [team.id, cert?.teamId === team.id ? cert : null] as const;
    }),
  );

  return (
    <div className="space-y-6">
      {usingTempPassword ? (
        <Notice tone="warning">
          {t("tempPasswordWarning")}{" "}
          <Link href="/captain/settings" className="font-semibold underline hover:text-amber-900">
            {t("changeNow")}
          </Link>
        </Notice>
      ) : null}
      {success === "password-changed" ? <Notice tone="success">{t("passwordChanged")}</Notice> : null}
      {success === "player-added" ? <Notice tone="success">{t("playerAdded")}</Notice> : null}
      {success === "player-updated" ? <Notice tone="success">{t("playerUpdated")}</Notice> : null}
      {success === "player-deleted" ? <Notice tone="success">{t("playerDeleted")}</Notice> : null}
      {success === "registered" ? <Notice tone="success">{t("registered")}</Notice> : null}
      {success === "captain-display-updated" ? <Notice tone="success">Tampilan kapten berhasil diperbarui.</Notice> : null}
      {error ? <Notice tone="danger">{decodeURIComponent(error)}</Notice> : null}

      <div className="space-y-8">
        {teamsWithPlayers.map(({ team, players }) => {
          const event = events.find((item) => item.id === team.eventId);
          if (!event) return null;
          const game = getGameForEvent(event);
          const mode = getModeForEvent(event);
          const cert = certificates.get(team.id) ?? null;

          return (
            <div key={team.id} className="space-y-4">
              {cert ? <ChampionCertificateBanner cert={cert} event={event} team={team} /> : null}
              <TeamSection
                team={team}
                event={event}
                game={game}
                mode={mode}
                players={players}
                editPlayerId={editPlayerId}
                confirmDeleteId={confirmDeleteId}
                t={t as TFn}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Notice({ children, tone }: { children: React.ReactNode; tone: "success" | "warning" | "danger" }) {
  const toneClass = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    danger: "border-red-200 bg-red-50 text-red-700",
  }[tone];

  return (
    <div className={`rounded-xl border px-4 py-3 text-sm font-medium shadow-sm ${toneClass}`}>
      {children}
    </div>
  );
}

function ChampionCertificateBanner({ cert, event, team }: { cert: Certificate; event: Event; team: Team }) {
  return (
    <div className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50 shadow-sm">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
            <Trophy className="h-5 w-5" />
          </span>
          <div>
            <p className="font-semibold text-amber-950">Sertifikat Juara Tersedia!</p>
            <p className="text-sm text-amber-800">
              Tim {team.name} adalah Grand Champion {event.name}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={cert.imageUrl}
            download={`certificate-${team.name}.png`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700"
          >
            Download PNG
          </a>
          <ShareCertificateButton imageUrl={cert.imageUrl} teamName={team.name} eventName={event.name} />
        </div>
      </div>
      <div className="border-t border-amber-200 px-4 py-2.5">
        <p className="text-xs font-medium text-amber-800">
          Bagikan ke Instagram Story, TikTok, atau WhatsApp dengan tombol Share di atas. Resolusi: 1080x1920 (9:16)
        </p>
      </div>
    </div>
  );
}

function avatarTone(position: string) {
  if (position === "Guard") return "bg-cyan-100 text-cyan-800";
  if (position === "Forward" || position === "Midfielder") return "bg-emerald-100 text-emerald-800";
  return "bg-slate-100 text-slate-800";
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
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
      <div className="relative border-b border-slate-200">
        <GameArt gameId={game.id} entityName={team.name} />
        <StatusBadge status={event.status} />
      </div>

      <div className="space-y-6 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-500">
              {game.name} - {mode.name}
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-950">{team.name}</h2>
            <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1.5 ring-1 ring-slate-200">
                <CalendarDays className="h-4 w-4 text-cyan-600" /> {event.startsAt}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1.5 ring-1 ring-slate-200">
                <Users className="h-4 w-4 text-cyan-600" /> {event.venue}
              </span>
            </div>
            <Link href="/captain/stats" className={primaryButton}>
              {t("submitStats")}
            </Link>
          </div>
          <Link
            href="/captain/settings"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
            title={t("accountSettings")}
          >
            <Settings className="h-4 w-4" />
          </Link>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-950">
            {t("roster", { count: players.length })}
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {players.map((player) => {
              if (confirmDeleteId === player.id) {
                return <DeletePlayerCard key={player.id} player={player} t={t} />;
              }

              if (editPlayerId === player.id) {
                return <EditPlayerForm key={player.id} mode={mode} player={player} t={t} />;
              }

              return <PlayerCard key={player.id} player={player} t={t} />;
            })}
            <a
              href="#add-player-form"
              className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-4 text-slate-500 transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700"
            >
              <Plus className="h-5 w-5" />
              <span className="text-sm font-medium">{t("addPlayerAnchor")}</span>
            </a>
          </div>
        </div>

        {players.length > 0 && (
          <details className="rounded-xl border border-slate-200 bg-slate-50">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-cyan-700 hover:text-cyan-900">
              Ganti tampilan kapten
            </summary>
            <div className="border-t border-slate-200 px-4 pb-4 pt-3">
              <form action={captainSetDisplayCaptainAction} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="teamId" value={team.id} />
                <label className={`${labelClass} flex-1 min-w-40`}>
                  Pemain yang ditampilkan sebagai kapten
                  <select className={inputClass} name="displayName" defaultValue={team.captainName ?? ""}>
                    {players.map((p) => (
                      <option key={p.id} value={p.displayName}>{p.displayName}</option>
                    ))}
                  </select>
                </label>
                <button type="submit" className={quietButton}>Simpan</button>
              </form>
              <p className="mt-2 text-xs text-slate-400">
                Nama ini tampil di halaman peserta publik. Akun kapten tidak berubah.
              </p>
            </div>
          </details>
        )}

        <form id="add-player-form" action={captainAddPlayerAction} className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <input type="hidden" name="teamId" value={team.id} />
          <input type="hidden" name="eventId" value={team.eventId} />
          <h3 className="text-sm font-semibold text-slate-950">{t("addPlayerTitle")}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelClass}>
              {t("displayName")}
              <input className={inputClass} name="displayName" placeholder={t("displayNamePlaceholder")} />
            </label>
            <label className={labelClass}>
              {t("nickname")}
              <input className={inputClass} name="nickname" placeholder={t("nicknamePlaceholder")} />
            </label>
            <label className={labelClass}>
              {t("position")}
              <select className={inputClass} name="position" defaultValue={mode.positions[0]}>
                {mode.positions.map((pos) => (
                  <option key={pos} value={pos}>{pos}</option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              {t("jersey")} <span className="text-slate-400">{t("jerseyOptional")}</span>
              <input className={inputClass} name="jerseyNumber" type="number" min={1} max={99} placeholder="10" />
            </label>
          </div>
          <div>
            <button className={primaryButton} type="submit">
              {t("addPlayerSubmit")}
            </button>
          </div>
        </form>
      </div>
    </article>
  );
}

function DeletePlayerCard({ player, t }: { player: Player; t: TFn }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-center">
      <p className="text-sm font-semibold text-red-700">{t("deleteConfirm", { name: player.displayName })}</p>
      <form action={captainDeletePlayerAction}>
        <input type="hidden" name="playerId" value={player.id} />
        <button type="submit" className={dangerButton}>
          {t("confirmDelete")}
        </button>
      </form>
      <Link href="/captain" className="text-sm font-medium text-slate-600 hover:text-slate-900">
        {t("cancelAction")}
      </Link>
    </div>
  );
}

function EditPlayerForm({ mode, player, t }: { mode: GameMode; player: Player; t: TFn }) {
  return (
    <form
      action={captainUpdatePlayerAction}
      className="col-span-2 rounded-xl border border-cyan-200 bg-cyan-50 p-4 sm:col-span-3"
    >
      <input type="hidden" name="playerId" value={player.id} />
      <p className="mb-3 text-sm font-semibold text-cyan-900">{t("editPlayerTitle", { name: player.displayName })}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          {t("displayName")}
          <input className={inputClass} name="displayName" defaultValue={player.displayName} required />
        </label>
        <label className={labelClass}>
          {t("nickname")}
          <input className={inputClass} name="nickname" defaultValue={player.nickname} required />
        </label>
        <label className={labelClass}>
          {t("position")}
          <select className={inputClass} name="position" defaultValue={player.position}>
            {mode.positions.map((pos) => (
              <option key={pos} value={pos}>{pos}</option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          {t("jersey")}
          <input
            className={inputClass}
            name="jerseyNumber"
            type="number"
            min={1}
            max={99}
            defaultValue={player.jerseyNumber ?? ""}
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" className={primaryButton}>
          {t("save")}
        </button>
        <Link href="/captain" className={quietButton}>
          {t("cancelAction")}
        </Link>
      </div>
    </form>
  );
}

function PlayerCard({ player, t }: { player: Player; t: TFn }) {
  return (
    <div className="relative rounded-xl border border-slate-200 bg-slate-50 p-4">
      {player.jerseyNumber != null ? (
        <span className="absolute right-3 top-3 rounded-full bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">
          #{player.jerseyNumber}
        </span>
      ) : null}
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg text-sm font-semibold ${avatarTone(player.position)}`}>
        {player.nickname.slice(0, 2).toUpperCase()}
      </div>
      <p className="truncate text-sm font-semibold text-slate-950">{player.displayName}</p>
      <span className="mt-2 inline-block rounded-full bg-cyan-100 px-2.5 py-1 text-xs font-medium text-cyan-800">
        {player.nickname}
      </span>
      <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {player.position}
      </p>
      <div className="mt-3 flex gap-2">
        <Link href={`/captain?edit=${player.id}`} className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 hover:text-slate-900">
          {t("edit")}
        </Link>
        <Link href={`/captain?confirm=${player.id}`} className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 hover:text-red-700">
          {t("delete")}
        </Link>
      </div>
    </div>
  );
}
