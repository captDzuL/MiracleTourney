import { CalendarDays, Crown, Plus, Settings, Trophy, Upload, Users } from "lucide-react";

import { getTranslations } from "next-intl/server";



import { Link } from "@/i18n/navigation";

import { redirectToActiveLocale } from "@/i18n/redirect";

import {

  captainAddPlayerAction,

  captainDeletePlayerAction,

  captainRegisterTeamAction,

  captainSaveDraftTeamAction,

  captainSetDisplayCaptainAction,

  captainUpdatePlayerAction,

  captainUploadTeamLogoAction,

} from "@/lib/actions";

import { requireRole } from "@/lib/auth/session";

import { GameArt, StatusBadge } from "@/components/GameArt";

import {

  getCaptainTeams,

  getCertificatesForEvents,

  getEventsByIds,

  getGameForEvent,

  getModeForEvent,

  getOpenRegistrationEventsForCaptain,

  getPlayersForTeams,

  hasTempPassword,

} from "@/lib/platform/repository";

import type { Certificate } from "@/lib/platform/types";

import type { Event, Game, GameMode, Player, Team } from "@/lib/platform/types";

import { ShareCertificateButton } from "@/components/ShareCertificateButton";

import { SubmitButton } from "@/components/submit-button";



type TFn = (key: string, values?: Record<string, string | number>) => string;



const inputClass = "rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100";

const labelClass = "grid gap-2 text-sm font-medium text-slate-700";

const quietButton = "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400";

const primaryButton = "inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-400 px-3.5 py-2.5 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400";

const dangerButton = "inline-flex items-center justify-center rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400";



export default async function CaptainPage({

  searchParams,

}: {

  searchParams?: Promise<{ edit?: string; confirm?: string; success?: string; error?: string; tab?: string }>;

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

  const rosterSignals = new Set(["player-added", "player-updated", "player-deleted", "captain-display-updated", "team-logo-updated"]);

  const activeTab = params?.tab === "roster" || editPlayerId || confirmDeleteId || (success && rosterSignals.has(success)) ? "roster" : "registration";



  const [teams, usingTempPassword, openRegistrationEvents] = await Promise.all([

    getCaptainTeams(user.id),

    hasTempPassword(user.id),

    getOpenRegistrationEventsForCaptain(user.id),

  ]);

  const teamIds = teams.map((team) => team.id);

  const registeredEventIds = teams

    .map((team) => team.eventId)

    .filter((eventId): eventId is string => Boolean(eventId));

  const eventIds = [...new Set(registeredEventIds)];

  const [events, allPlayers, certificatesByEvent] = await Promise.all([

    getEventsByIds(eventIds),

    getPlayersForTeams(teamIds),

    getCertificatesForEvents(eventIds),

  ]);

  const teamsWithPlayers = teams.map((team) => ({

    team,

    players: allPlayers.filter((player) => player.teamId === team.id),

  }));

  const draftTeamWithPlayers = teamsWithPlayers.find(({ team }) => !team.eventId || team.source === "draft") ?? null;



  const certificates = new Map<string, Certificate | null>(

    teams.map((team) => {

      const cert = team.eventId ? certificatesByEvent.get(team.eventId) : null;

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

      {success === "team-created" ? <Notice tone="success">{t("teamCreated")}</Notice> : null}

      {success === "draft-team-saved" ? <Notice tone="success">{t("draftTeamSaved")}</Notice> : null}
      {success === "team-logo-updated" ? <Notice tone="success">{t("teamLogoUpdated")}</Notice> : null}

      {success === "captain-display-updated" ? <Notice tone="success">Tampilan kapten berhasil diperbarui.</Notice> : null}

      {error ? <Notice tone="danger">{decodeURIComponent(error)}</Notice> : null}



      <CaptainDashboardTabs activeTab={activeTab} t={t as TFn} />



      {activeTab === "registration" ? (

        <OpenRegistrationSection

          events={openRegistrationEvents}

          draftTeam={draftTeamWithPlayers?.team ?? null}

          draftPlayerCount={draftTeamWithPlayers?.players.length ?? 0}

          t={t as TFn}

        />

      ) : (

        <RosterManagementSection

          teamsWithPlayers={teamsWithPlayers}

          draftTeamWithPlayers={draftTeamWithPlayers}

          events={events}

          certificates={certificates}

          editPlayerId={editPlayerId}

          confirmDeleteId={confirmDeleteId}

          t={t as TFn}

        />

      )}

    </div>

  );

}





function CaptainDashboardTabs({ activeTab, t }: { activeTab: "registration" | "roster"; t: TFn }) {

  const tabClass = (tab: "registration" | "roster") =>

    `inline-flex items-center justify-center rounded-lg px-3.5 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${

      activeTab === tab

        ? "bg-slate-950 text-white shadow-sm"

        : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"

    }`;



  return (

    <nav aria-label={t("dashboardTabsLabel")} className="flex w-full gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">

      <Link href="/captain?tab=registration" className={tabClass("registration")} aria-current={activeTab === "registration" ? "page" : undefined}>

        {t("registrationTab")}

      </Link>

      <Link href="/captain?tab=roster" className={tabClass("roster")} aria-current={activeTab === "roster" ? "page" : undefined}>

        {t("rosterTab")}

      </Link>

    </nav>

  );

}



function RosterManagementSection({

  teamsWithPlayers,

  draftTeamWithPlayers,

  events,

  certificates,

  editPlayerId,

  confirmDeleteId,

  t,

}: {

  teamsWithPlayers: Array<{ team: Team; players: Player[] }>;

  draftTeamWithPlayers: { team: Team; players: Player[] } | null;

  events: Event[];

  certificates: Map<string, Certificate | null>;

  editPlayerId?: string;

  confirmDeleteId?: string;

  t: TFn;

}) {

  const registeredTeamsWithPlayers = teamsWithPlayers.filter(({ team }) => Boolean(team.eventId));



  return (

    <section className="space-y-4">

      <div>

        <h2 className="text-lg font-semibold text-slate-950">{t("rosterManagementTitle")}</h2>

        <p className="mt-1 text-sm text-slate-500">{t("rosterManagementDescription")}</p>

      </div>



      <DraftTeamForm team={draftTeamWithPlayers?.team ?? null} t={t} />



      {registeredTeamsWithPlayers.length === 0 && !draftTeamWithPlayers ? (

        <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 shadow-sm">

          {t("noRegisteredTeams")}

        </p>

      ) : (

        <div className="space-y-8">

          {draftTeamWithPlayers ? (

            <TeamSection

              team={draftTeamWithPlayers.team}

              players={draftTeamWithPlayers.players}

              editPlayerId={editPlayerId}

              confirmDeleteId={confirmDeleteId}

              t={t}

            />

          ) : null}



          {registeredTeamsWithPlayers.map(({ team, players }) => {

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

                  t={t}

                />

              </div>

            );

          })}

        </div>

      )}

    </section>

  );

}



function DraftTeamForm({ team, t }: { team: Team | null; t: TFn }) {

  return (

    <form action={captainSaveDraftTeamAction} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-[1fr_8rem_auto] sm:items-end">

      <div className="sm:col-span-3">

        <h3 className="text-sm font-semibold text-slate-950">{t("draftTeamTitle")}</h3>

        <p className="mt-1 text-sm text-slate-500">{t("draftTeamDescription")}</p>

      </div>

      <label className={labelClass}>

        {t("teamName")}

        <input className={inputClass} name="name" placeholder={t("teamNamePlaceholder")} minLength={2} defaultValue={team?.name ?? ""} required />

      </label>

      <label className={labelClass}>

        {t("teamTag")}

        <input className={`${inputClass} uppercase`} name="tag" placeholder={t("teamTagPlaceholder")} minLength={2} maxLength={5} defaultValue={team?.tag ?? ""} required />

      </label>

      <SubmitButton className={primaryButton}>{t("saveDraftTeamSubmit")}</SubmitButton>

    </form>

  );

}



function OpenRegistrationSection({

  events,

  draftTeam,

  draftPlayerCount,

  t,

}: {

  events: Array<Event & { registeredTeams: number }>;

  draftTeam: Team | null;

  draftPlayerCount: number;

  t: TFn;

}) {

  return (

    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">

        <div>

          <h2 className="text-lg font-semibold text-slate-950">{t("openRegistrationTitle")}</h2>

          <p className="mt-1 text-sm text-slate-500">{t("openRegistrationDescription")}</p>

        </div>

      </div>



      {events.length === 0 ? (

        <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">

          {t("noOpenRegistration")}

        </p>

      ) : (

        <div className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-slate-50">

          {events.map((event) => (

            <form key={event.id} action={captainRegisterTeamAction} data-registration-list-item="true" className="grid gap-4 p-4 lg:grid-cols-[minmax(12rem,1fr)_minmax(18rem,24rem)_auto] lg:items-end">

              <input type="hidden" name="eventId" value={event.id} />

              {draftTeam ? <input type="hidden" name="draftTeamId" value={draftTeam.id} /> : null}

              <div className="min-w-0">

                <p className="truncate text-base font-semibold text-slate-950">{event.name}</p>

                <p className="mt-1 text-sm text-slate-500">{event.startsAt} - {event.venue}</p>

                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-cyan-700">

                  {t("eventCapacity", { registered: event.registeredTeams, cap: event.participantCap })}

                </p>

              </div>

              {draftTeam ? (

                <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">

                  <p className="font-semibold text-slate-950">{draftTeam.name} · {draftTeam.tag}</p>

                  <p className="mt-1">{t("registrationUsesDraft", { count: draftPlayerCount })}</p>

                </div>

              ) : (

                <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">

                  <label className={labelClass}>

                    {t("teamName")}

                    <input className={inputClass} name="name" placeholder={t("teamNamePlaceholder")} minLength={2} required />

                  </label>

                  <label className={labelClass}>

                    {t("teamTag")}

                    <input className={`${inputClass} uppercase`} name="tag" placeholder={t("teamTagPlaceholder")} minLength={2} maxLength={5} required />

                  </label>

                </div>

              )}

              <div className="lg:justify-self-end">

                {draftTeam && draftPlayerCount === 0 ? (

                  <Link href="/captain?tab=roster" className={quietButton}>{t("completeDraftRosterFirst")}</Link>

                ) : (

                  <SubmitButton className={primaryButton}>{t("registerTeamSubmit")}</SubmitButton>

                )}

              </div>

            </form>

          ))}

        </div>

      )}

    </section>

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



function avatarTone(position?: string) {

  if (position === "Guard") return "bg-cyan-100 text-cyan-800";

  if (position === "Forward" || position === "Midfielder") return "bg-emerald-100 text-emerald-800";

  return "bg-slate-100 text-slate-800";

}



function TeamLogoUploadForm({ team, t }: { team: Team; t: TFn }) {

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

  event?: Event;

  game?: Game;

  mode?: GameMode;

  players: Player[];

  editPlayerId?: string;

  confirmDeleteId?: string;

  t: TFn;

}) {

  const positionOptions = mode?.positions ?? [];



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

              href="/captain/settings"

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

                if (confirmDeleteId === player.id) {

                  return <DeletePlayerCard key={player.id} player={player} t={t} />;

                }

                if (editPlayerId === player.id) {

                  return <EditPlayerForm key={player.id} positionOptions={positionOptions} player={player} t={t} />;

                }

                return (

                  <PlayerCard

                    key={player.id}

                    player={player}

                    team={team}

                    isCaptain={player.displayName === resolvedCaptainName}

                    t={t}

                  />

                );

              });

            })()}

            <a

              href="#add-player-form"

              className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-4 text-slate-500 transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700"

            >

              <Plus className="h-5 w-5" />

              <span className="text-sm font-medium">{t("addPlayerAnchor")}</span>

            </a>

          </div>

        </div>



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



function EditPlayerForm({ positionOptions, player, t }: { positionOptions: string[]; player: Player; t: TFn }) {

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



function PlayerCard({ player, team, isCaptain, t }: { player: Player; team: Team; isCaptain: boolean; t: TFn }) {

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

      <div className="mt-3 flex gap-2">

        <Link href={`/captain?tab=roster&edit=${player.id}`} className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 hover:text-slate-900">

          {t("edit")}

        </Link>

        <Link href={`/captain?tab=roster&confirm=${player.id}`} className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 hover:text-red-700">

          {t("delete")}

        </Link>

      </div>

    </div>

  );

}
