// Team section of the captain dashboard: logo, players and the champion certificate banner.
// Moved out of page.tsx without changes (refactor Phase 4, 4b-captain).

import { DRAFT_POSITION_OPTIONS, avatarTone, dangerButton, inputClass, labelClass, primaryButton, quietButton } from "@/app/captain/dashboard/shared";
import type { TFn } from "@/app/captain/dashboard/shared";
import { GameArt, StatusBadge } from "@/components/GameArt";
import { ShareCertificateButton } from "@/components/ShareCertificateButton";
import { SubmitButton } from "@/components/submit-button";
import { Link } from "@/i18n/navigation";
import { captainAddPlayerAction, captainDeletePlayerAction, captainSetDisplayCaptainAction, captainUpdatePlayerAction, captainUploadTeamLogoAction } from "@/lib/actions/team-actions";
import type { Certificate, Event, Game, GameMode, Player, Team } from "@/lib/platform/types";
import { CalendarDays, Crown, Plus, Settings, Trophy, Upload, Users } from "lucide-react";

export function ChampionCertificateBanner({ cert, event, team }: { cert: Certificate; event: Event; team: Team }) {
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

export function TeamLogoUploadForm({ team, t }: { team: Team; t: TFn }) {

  const hintId = `team-logo-hint-${team.id}`;


  return (

    <form action={captainUploadTeamLogoAction} className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:w-72">

      <input type="hidden" name="teamId" value={team.id} />

      <label className="grid gap-1 text-xs font-semibold text-slate-700">

        {t("teamLogo")}

        <input

          className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-100"

          type="file"

          name="teamLogo"

          accept="image/png,image/jpeg,image/webp"

          aria-describedby={hintId}

          required

        />

      </label>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">

        <p id={hintId} className="text-xs leading-5 text-slate-500">{t("teamLogoHint")}</p>

        <SubmitButton className={quietButton} pendingLabel={t("uploadingTeamLogo")}>

          <Upload className="h-4 w-4" aria-hidden="true" />

          {t("uploadTeamLogo")}

        </SubmitButton>

      </div>

    </form>

  );

}

export function TeamSection({

  team,

  event,

  game,

  mode,

  players,
  rosterEditable = true,
  editPlayerId,
  confirmDeleteId,
  t,
}: {

  team: Team;

  event?: Event;

  game?: Game;

  mode?: GameMode;

  players: Player[];
  /** False once the roster is locked: changes then go through an organizer-approved request. */
  rosterEditable?: boolean;
  editPlayerId?: string;
  confirmDeleteId?: string;
  t: TFn;
}) {

  const positionOptions = mode?.positions ?? DRAFT_POSITION_OPTIONS;


  return (

    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">

      <div className="relative border-b border-slate-200">

        <GameArt gameId={game?.id ?? "draft"} logoUrl={team.logoUrl} entityName={team.name} />

        <StatusBadge status={event?.status ?? "Draft"} />

      </div>


      <div className="space-y-6 p-5">

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">

          <div className="min-w-0">

            <p className="text-sm font-medium text-slate-500">

              {event && game && mode ? `${game.name} - ${mode.name}` : t("draftTeamMeta")}

            </p>

            <h2 className="mt-1 text-2xl font-semibold text-slate-950">{team.name}</h2>

            {event ? (

              <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-600">

                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1.5 ring-1 ring-slate-200">

                  <CalendarDays className="h-4 w-4 text-cyan-600" /> {event.startsAt}

                </span>

                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1.5 ring-1 ring-slate-200">

                  <Users className="h-4 w-4 text-cyan-600" /> {event.venue}

                </span>

              </div>

            ) : null}

            {event ? (

              <Link href="/captain/stats" className={primaryButton}>

                {t("submitStats")}

              </Link>

            ) : null}

          </div>

          <div className="flex flex-col gap-3 sm:flex-row lg:items-start">

            <TeamLogoUploadForm team={team} t={t} />

            <Link

              href={(team.source === "solo-draw" ? "/player/settings" : "/captain/settings") as never}

              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"

              title={t("accountSettings")}

            >

              <Settings className="h-4 w-4" />

            </Link>

          </div>

        </div>


        <div>

          <h3 className="mb-3 text-sm font-semibold text-slate-950">

            {t("roster", { count: players.length })}

          </h3>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">

            {(() => {

              const effectiveCaptainName = team.captainName ?? team.captain?.name ?? null;

              const hasMatch = players.some((p) => p.displayName === effectiveCaptainName);

              const resolvedCaptainName =

                !hasMatch && players.length > 0 ? players[0].displayName : effectiveCaptainName;


              return players.map((player) => {

                if (rosterEditable && confirmDeleteId === player.id) {

                  return <DeletePlayerCard key={player.id} player={player} t={t} />;

                }

                if (rosterEditable && editPlayerId === player.id) {

                  return <EditPlayerForm key={player.id} positionOptions={positionOptions} player={player} t={t} />;

                }

                return (

                  <PlayerCard

                    key={player.id}

                    player={player}

                    team={team}

                    isCaptain={player.displayName === resolvedCaptainName}
                    readOnly={!rosterEditable}

                    t={t}

                  />

                );

              });

            })()}

            {rosterEditable ? (
<a

              href="#add-player-form"

              className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-4 text-slate-500 transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700"

            >

              <Plus className="h-5 w-5" />

              <span className="text-sm font-medium">{t("addPlayerAnchor")}</span>

            </a>
) : null}

          </div>

        </div>


        {rosterEditable ? (
<form id="add-player-form" action={captainAddPlayerAction} className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">

          <input type="hidden" name="teamId" value={team.id} />

          {team.eventId ? <input type="hidden" name="eventId" value={team.eventId} /> : null}

          <h3 className="text-sm font-semibold text-slate-950">{t("addPlayerTitle")}</h3>

          <div className="grid gap-3 sm:grid-cols-2">

            <label className={labelClass}>

              {t("uid")} <span className="text-slate-400">{t("requiredField")}</span>

              <input className={inputClass} name="displayName" placeholder={t("uidPlaceholder")} required />

            </label>

            <label className={labelClass}>

              {t("ign")} <span className="text-slate-400">{t("requiredField")}</span>

              <input className={inputClass} name="nickname" placeholder={t("ignPlaceholder")} required />

            </label>

            <label className={labelClass}>

              {t("position")}

              <select className={inputClass} name="position" defaultValue="">

                <option value="">{t("positionOptionalChoice")}</option>

                {positionOptions.map((pos) => (

                  <option key={pos} value={pos}>{pos}</option>

                ))}

              </select>

            </label>

          </div>

          <div>

            <SubmitButton className={primaryButton}>

              {t("addPlayerSubmit")}

            </SubmitButton>

          </div>

        </form>
) : null}

      </div>

    </article>

  );

}

export function DeletePlayerCard({ player, t }: { player: Player; t: TFn }) {

  return (

    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-center">

      <p className="text-sm font-semibold text-red-700">{t("deleteConfirm", { name: player.displayName })}</p>

      <form action={captainDeletePlayerAction}>

        <input type="hidden" name="playerId" value={player.id} />

        <SubmitButton className={dangerButton}>

          {t("confirmDelete")}

        </SubmitButton>

      </form>

      <Link href="/captain?tab=roster" className="text-sm font-medium text-slate-600 hover:text-slate-900">

        {t("cancelAction")}

      </Link>

    </div>

  );

}

export function EditPlayerForm({ positionOptions, player, t }: { positionOptions: string[]; player: Player; t: TFn }) {

  return (

    <form

      action={captainUpdatePlayerAction}

      className="col-span-2 rounded-xl border border-cyan-200 bg-cyan-50 p-4 sm:col-span-3"

    >

      <input type="hidden" name="playerId" value={player.id} />

      <p className="mb-3 text-sm font-semibold text-cyan-900">{t("editPlayerTitle", { name: player.displayName })}</p>

      <div className="grid gap-3 sm:grid-cols-2">

        <label className={labelClass}>

          {t("uid")} <span className="text-slate-400">{t("requiredField")}</span>

          <input className={inputClass} name="displayName" defaultValue={player.displayName} required />

        </label>

        <label className={labelClass}>

          {t("ign")} <span className="text-slate-400">{t("requiredField")}</span>

          <input className={inputClass} name="nickname" defaultValue={player.nickname} required />

        </label>

        <label className={labelClass}>

          {t("position")}

          <select className={inputClass} name="position" defaultValue={player.position}>

            <option value="">{t("positionOptionalChoice")}</option>

            {positionOptions.map((pos) => (

              <option key={pos} value={pos}>{pos}</option>

            ))}

          </select>

        </label>

      </div>

      <div className="mt-3 flex flex-wrap gap-2">

        <SubmitButton className={primaryButton}>

          {t("save")}

        </SubmitButton>

        <Link href="/captain?tab=roster" className={quietButton}>

          {t("cancelAction")}

        </Link>

      </div>

    </form>

  );

}

export function PlayerCard({ player, team, isCaptain, readOnly = false, t }: { player: Player; team: Team; isCaptain: boolean; readOnly?: boolean; t: TFn }) {

  return (

    <div className={`relative rounded-xl border p-4 ${isCaptain ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>

      {isCaptain ? (

        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-amber-900">

          <Crown className="h-3 w-3" aria-hidden="true" /> Kapten

        </span>

      ) : (

        <form action={captainSetDisplayCaptainAction} className="absolute left-3 top-3">

          <input type="hidden" name="teamId" value={team.id} />

          <input type="hidden" name="playerId" value={player.id} />

          <SubmitButton

            title="Jadikan sebagai tampilan kapten di halaman peserta"

            className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-400 transition hover:border-amber-400 hover:bg-amber-50 hover:text-amber-700"

            pendingLabel="..."

          >

            <Crown className="h-3 w-3" aria-hidden="true" /> Jadikan

          </SubmitButton>

        </form>

      )}

      <div className={`mb-3 mt-6 flex h-10 w-10 items-center justify-center rounded-lg text-sm font-semibold ${avatarTone(player.position)}`}>

        {player.nickname.slice(0, 2).toUpperCase()}

      </div>

      <p className="truncate text-sm font-semibold text-slate-950">{player.nickname}</p>

      <span className="mt-2 inline-block rounded-full bg-cyan-100 px-2.5 py-1 text-xs font-medium text-cyan-800">

        {t("uidShort")}: {player.displayName}

      </span>

      {player.position ? (

        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">

          {player.position}

        </p>

      ) : null}

      {readOnly ? null : (
<div className="mt-3 flex gap-2">

        <Link href={`/captain?tab=roster&edit=${player.id}`} className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 hover:text-slate-900">

          {t("edit")}

        </Link>

        <Link href={`/captain?tab=roster&confirm=${player.id}`} className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 hover:text-red-700">

          {t("delete")}

        </Link>

      </div>
)}

    </div>

  );

}
