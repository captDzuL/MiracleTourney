import { CalendarDays, Clock, CreditCard, Crown, Plus, Settings, Trophy, Upload, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { redirectToActiveLocale } from "@/i18n/redirect";
import { captainAddPlayerAction, captainDeletePlayerAction, captainRegisterTeamAction, captainSetDisplayCaptainAction, captainUpdatePlayerAction, captainUploadPaymentProofAction } from "@/lib/actions";
import { requireRole } from "@/lib/auth/session";
import { GameArt, StatusBadge } from "@/components/GameArt";
import {
  getCaptainTeams,
  getCertificatesForEvents,
  getEventsByIds,
  getGameForEvent,
  getModeForEvent,
  getCaptainRegistrationRequests,
  getOpenRegistrationEventsForCaptain,
  getPaymentSettings,
  getPlayersForTeams,
  hasTempPassword,
} from "@/lib/platform/repository";
import type { Certificate } from "@/lib/platform/types";
import type { Event, Game, GameMode, PaymentSettings, Player, Team, TeamRegistrationRequest } from "@/lib/platform/types";
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
  const rosterSignals = new Set(["player-added", "player-updated", "player-deleted", "captain-display-updated"]);
  const activeTab = params?.tab === "roster" || editPlayerId || confirmDeleteId || (success && rosterSignals.has(success)) ? "roster" : "registration";

  const [teams, usingTempPassword, openRegistrationEvents, paymentRequests, paymentSettings] = await Promise.all([
    getCaptainTeams(user.id),
    hasTempPassword(user.id),
    getOpenRegistrationEventsForCaptain(user.id),
    getCaptainRegistrationRequests(user.id),
    getPaymentSettings(),
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
      {success === "team-created" ? <Notice tone="success">{t("teamCreated")}</Notice> : null}
      {success === "payment-pending" ? <Notice tone="success">{t("paymentPending")}</Notice> : null}
      {success === "payment-proof-uploaded" ? <Notice tone="success">{t("paymentProofUploaded")}</Notice> : null}
      {success === "captain-display-updated" ? <Notice tone="success">Tampilan kapten berhasil diperbarui.</Notice> : null}
      {error ? <Notice tone="danger">{decodeURIComponent(error)}</Notice> : null}

      <CaptainDashboardTabs activeTab={activeTab} t={t as TFn} />

      {activeTab === "registration" ? (
        <div className="grid gap-6">
          <OpenRegistrationSection events={openRegistrationEvents} t={t as TFn} />
          <PaymentRequestsSection requests={paymentRequests} paymentSettings={paymentSettings} t={t as TFn} />
        </div>
      ) : (
        <RosterManagementSection
          teamsWithPlayers={teamsWithPlayers}
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
  events,
  certificates,
  editPlayerId,
  confirmDeleteId,
  t,
}: {
  teamsWithPlayers: Array<{ team: Team; players: Player[] }>;
  events: Event[];
  certificates: Map<string, Certificate | null>;
  editPlayerId?: string;
  confirmDeleteId?: string;
  t: TFn;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">{t("rosterManagementTitle")}</h2>
        <p className="mt-1 text-sm text-slate-500">{t("rosterManagementDescription")}</p>
      </div>
      {teamsWithPlayers.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 shadow-sm">
          {t("noRegisteredTeams")}
        </p>
      ) : (
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
function OpenRegistrationSection({ events, t }: { events: Array<Event & { registeredTeams: number }>; t: TFn }) {
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
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-slate-950">{event.name}</p>
                <p className="mt-1 text-sm text-slate-500">{event.startsAt} · {event.venue}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-cyan-700">
                  {t("eventCapacity", { registered: event.registeredTeams, cap: event.participantCap })}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
                <label className={labelClass}>
                  {t("teamName")}
                  <input className={inputClass} name="name" placeholder={t("teamNamePlaceholder")} minLength={2} required />
                </label>
                <label className={labelClass}>
                  {t("teamTag")}
                  <input className={`${inputClass} uppercase`} name="tag" placeholder={t("teamTagPlaceholder")} minLength={2} maxLength={4} required />
                </label>
              </div>
              <div className="lg:justify-self-end">
                <SubmitButton className={primaryButton}>{t("registerTeamSubmit")}</SubmitButton>
              </div>
            </form>
          ))}
        </div>
      )}
    </section>
  );
}

function PaymentRequestsSection({ paymentSettings, requests, t }: { paymentSettings: PaymentSettings; requests: TeamRegistrationRequest[]; t: TFn }) {
  if (requests.length === 0) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">{t("paymentRequestsTitle")}</h2>
          <p className="mt-1 text-sm text-slate-500">{t("paymentRequestsDescription")}</p>
        </div>
      </div>
      <div className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-slate-50">
        {requests.map((request) => (
          <div key={request.id} className="grid gap-4 p-4 lg:grid-cols-[minmax(14rem,1fr)_minmax(14rem,0.8fr)_minmax(16rem,24rem)] lg:items-start">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-slate-950">{request.event?.name ?? request.eventId}</p>
              <p className="mt-1 text-sm text-slate-600">{request.teamName} ({request.teamTag})</p>
              <p className="mt-2 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                <Clock className="h-3.5 w-3.5" />
                {t(`paymentStatus_${request.status}`)}
              </p>
              {request.rejectReason ? <p className="mt-2 text-sm text-red-700">{request.rejectReason}</p> : null}
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">
              <p className="flex items-center gap-2 font-semibold text-slate-900"><CreditCard className="h-4 w-4" />{t("paymentInstructionsTitle")}</p>
              {request.event?.registrationFeeLabel ? <p className="mt-2 font-medium text-slate-800">{request.event.registrationFeeLabel}</p> : null}
              {paymentSettings.instructions ? <p className="mt-2 leading-6">{paymentSettings.instructions}</p> : null}
              {paymentSettings.qrisImageUrl ? (
                <img src={paymentSettings.qrisImageUrl} alt="QRIS" className="mt-3 aspect-square w-36 rounded-lg border border-slate-200 bg-white object-contain" />
              ) : (
                <p className="mt-2 text-amber-700">{t("noQrisConfigured")}</p>
              )}
            </div>
            {request.status === "pending_payment" || request.status === "rejected" ? (
              <form action={captainUploadPaymentProofAction} className="grid gap-3">
                <input type="hidden" name="requestId" value={request.id} />
                <label className={labelClass}>
                  {t("paymentProof")}
                  <input className={inputClass} name="paymentProof" type="file" accept="image/png,image/jpeg,image/webp" required />
                </label>
                <SubmitButton className={primaryButton}>
                  <Upload className="h-4 w-4" />
                  {t("uploadPaymentProof")}
                </SubmitButton>
              </form>
            ) : (
              <p className="rounded-lg border border-slate-200 bg-white p-3 text-sm font-medium text-slate-600">{t(`paymentStatus_${request.status}`)}</p>
            )}
          </div>
        ))}
      </div>
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
                  return <EditPlayerForm key={player.id} mode={mode} player={player} t={t} />;
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
      {player.jerseyNumber != null ? (
        <span className="absolute right-3 top-3 rounded-full bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">
          #{player.jerseyNumber}
        </span>
      ) : null}
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
      <p className="truncate text-sm font-semibold text-slate-950">{player.displayName}</p>
      <span className="mt-2 inline-block rounded-full bg-cyan-100 px-2.5 py-1 text-xs font-medium text-cyan-800">
        {player.nickname}
      </span>
      <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {player.position}
      </p>
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
