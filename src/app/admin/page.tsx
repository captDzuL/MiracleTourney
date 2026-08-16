import {
  BadgeCheck,
  CalendarPlus,
  Check,
  Download,
  Eye,
  FileSpreadsheet,
  ImageUp,
  KeyRound,
  LinkIcon,
  Palette,
  Radio,
  RefreshCw,
  Save,
  Send,
  SlidersHorizontal,
  Upload,
  X,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { redirectToActiveLocale } from "@/i18n/redirect";
import { SubmitButton } from "@/components/submit-button";
import {
  adminApproveStatAction,
  adminAssignCaptainAction,
  adminCreateEventAction,
  adminImportTeamsCsvAction,
  adminRejectStatAction,
  adminSetAccentColorAction,
  adminSetMatchGamesAction,
  adminSetRoundConfigAction,
  adminUpdateEventStatusAction,
  adminUpdateMatchResultAction,
  adminUpdateStreamAction,
  adminUploadEventBackgroundAction,
  adminUploadEventLogoAction,
  adminUploadCharacterArtAction,
  adminUploadTeamLogoAction,
  adminUpdateEventPublicInfoAction,
} from "@/lib/actions";
import { requireAnyRole } from "@/lib/auth/session";
import {
  getBracketManageableMatchesForEvent,
  getCaptainUsersForAdmin,
  getCertificatesForEvents,
  getEventBySlug,
  getEventRoundConfigs,
  getManageableEventsForUser,
  getGameForEvent,
  getGameModes,
  getImportedTeams,
  getLeaderboardForEvent,
  getMatchGames,
  getMatchesForEvent,
  getOrganizerUsers,
  getPendingStatSubmissionCount,
  getPendingStatSubmissions,
  getTeamCountsForEvents,
  getTeamsForEvents,
} from "@/lib/platform/repository";
import { buttonStyles, DataTable, Pill, Section, StatCard } from "@/components/ui";
import { TeamAvatar, TeamIdentity } from "@/components/TeamAvatar";
import { getGameModeDisplayLabel } from "@/lib/platform/config";
import { getEventBackgroundUrl } from "@/lib/platform/visuals";
import { getCaptainDisplayName } from "@/lib/team-display";

import { type AdminPhase, adminPhases, buildAdminPhaseHref, resolveAdminPhase } from "./admin-flow";

export const dynamic = "force-dynamic";

type AdminSearchParams = {
  activeEventId?: string;
  success?: string;
  error?: string;
  count?: string;
  phase?: string;
  matchEventId?: string;
  matchId?: string;
};

type EventItem = Awaited<ReturnType<typeof getManageableEventsForUser>>[number];
type GameModeItem = ReturnType<typeof getGameModes>[number];
type OrganizerItem = Awaited<ReturnType<typeof getOrganizerUsers>>[number];
type TeamItem = Awaited<ReturnType<typeof getTeamsForEvents>> extends Map<string, infer T> ? T extends Array<infer U> ? U : never : never;
type ImportedTeamItem = Awaited<ReturnType<typeof getImportedTeams>>[number] & { eventName: string };
type ManageableEventItem = {
  event: EventItem;
  manageableMatches: Awaited<ReturnType<typeof getBracketManageableMatchesForEvent>>;
};
type MatchItem = ManageableEventItem["manageableMatches"][number];
type RoundConfigItem = Awaited<ReturnType<typeof getEventRoundConfigs>>[number];
type MatchGameItem = Awaited<ReturnType<typeof getMatchGames>>[number];
type PendingSubmissionItem = Awaited<ReturnType<typeof getPendingStatSubmissions>>[number];
type CertificateItem = Awaited<ReturnType<typeof getCertificatesForEvents>> extends Map<string, infer T> ? T : never;

type AdminTranslator = Awaited<ReturnType<typeof getTranslations>>;
type CaptainUser = { id: string; name: string; email: string };

const phaseIcons = {
  prepare: CalendarPlus,
  import: FileSpreadsheet,
  run: Radio,
  review: BadgeCheck,
} satisfies Record<AdminPhase, React.ComponentType<{ className?: string }>>;

const inputClass = "w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100";
const labelClass = "grid min-w-0 gap-2 text-sm font-medium text-slate-700";
const quietButton = "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400";
const primaryButton = "inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-400 px-3.5 py-2.5 text-sm font-semibold text-cyan-950 shadow-sm transition hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400";

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<AdminSearchParams>;
}) {
  const user = await requireAnyRole(["platform_admin", "organizer", "admin"]);
  if (!user) {
    return redirectToActiveLocale("/login");
  }

  const [t, resolvedSearchParams] = await Promise.all([getTranslations("admin"), searchParams]);
  const activePhase = resolveAdminPhase(resolvedSearchParams?.phase);
  const [events, pendingCount, organizerOptions] = await Promise.all([
    getManageableEventsForUser(user),
    getPendingStatSubmissionCount(user),
    user.role === "platform_admin" || user.role === "admin" ? getOrganizerUsers() : Promise.resolve([]),
  ]);
  const gameModes = getGameModes();
  const eventIds = events.map((event) => event.id);
  const [teamCountsByEvent, featuredEventFromSlug] = await Promise.all([
    getTeamCountsForEvents(eventIds),
    getEventBySlug("kuroko-summer-cup"),
  ]);
  const featuredEvent =
    (featuredEventFromSlug && events.some((event) => event.id === featuredEventFromSlug.id) ? featuredEventFromSlug : null)
    ?? events[0];
  const activeEvent =
    events.find((event) => event.id === resolvedSearchParams?.activeEventId)
    ?? featuredEvent
    ?? events[0];

  const needsAllTeams = activePhase === "prepare" || activePhase === "import";
  const needsActiveTeams = activePhase === "run" || activePhase === "review";
  const teamsForEventIds = needsAllTeams || activePhase === "run" ? eventIds : activeEvent && needsActiveTeams ? [activeEvent.id] : [];
  const allTeamsByEvent = await getTeamsForEvents(teamsForEventIds);
  const allTeams = [...allTeamsByEvent.values()].flat();
  const teamName = (teamId: string | undefined) => allTeams.find((team) => team.id === teamId)?.name ?? "TBD";

  const manageableEvents = activePhase === "run"
    ? (await Promise.all(
        events.map(async (event) => ({
          event,
          manageableMatches: (await getBracketManageableMatchesForEvent(event)).filter((match) => match.status !== "Completed"),
        })),
      )).filter(({ manageableMatches }) => manageableMatches.length > 0)
    : [];
  const selectedManageableEventId =
    manageableEvents.find(({ event }) => event.id === resolvedSearchParams?.matchEventId)?.event.id
    ?? manageableEvents.find(({ event }) => event.id === activeEvent?.id)?.event.id
    ?? manageableEvents[0]?.event.id;
  const selectedManageableEvent = manageableEvents.find(({ event }) => event.id === selectedManageableEventId);
  const manageableMatches = selectedManageableEvent?.manageableMatches ?? [];

  const [activeMatches, activeLeaderboard] = activeEvent && (activePhase === "run" || activePhase === "review")
    ? await Promise.all([
        getMatchesForEvent(activeEvent.id),
        getLeaderboardForEvent(activeEvent.id, activeEvent.gameId),
      ])
    : [
        [] as Awaited<ReturnType<typeof getMatchesForEvent>>,
        [] as Awaited<ReturnType<typeof getLeaderboardForEvent>>,
      ];

  const [importedTeamsRaw, captainUsers] = await Promise.all([
    activePhase === "import" ? getImportedTeams(user) : Promise.resolve([]),
    activePhase === "import" ? getCaptainUsersForAdmin() : Promise.resolve([] as CaptainUser[]),
  ]);

  const importedTeams = importedTeamsRaw
    .map((team) => ({
      ...team,
      eventName: events.find((event) => event.id === team.eventId)?.name ?? "Unknown event",
    }))
    .reverse();
  const importedEventIds = new Set(importedTeamsRaw.map((team) => team.eventId));

  const selectedMatchId = resolvedSearchParams?.matchId;
  const [roundConfigs, selectedMatchGames] = await Promise.all([
    activePhase === "run" && selectedManageableEvent ? getEventRoundConfigs(selectedManageableEvent.event.id) : Promise.resolve([]),
    activePhase === "run" && selectedMatchId ? getMatchGames(selectedMatchId) : Promise.resolve([]),
  ]);
  const roundConfigMap = new Map(roundConfigs.map((config) => [config.roundLabel, config.bestOf]));
  const selectedMatch = selectedMatchId ? manageableMatches.find((match) => match.id === selectedMatchId) : undefined;
  const selectedMatchBestOf = selectedMatch ? (roundConfigMap.get(selectedMatch.roundLabel) ?? 1) : 1;

  const [certificatesByEvent, pendingSubmissions] = activePhase === "review"
    ? await Promise.all([getCertificatesForEvents(eventIds), getPendingStatSubmissions(user)])
    : [new Map(eventIds.map((eventId) => [eventId, null as CertificateItem])), [] as PendingSubmissionItem[]];

  const currentQuery = {
    activeEventId: activeEvent?.id,
    matchEventId: selectedManageableEvent?.event.id,
    matchId: selectedMatch?.id,
  };

  return (
    <div className="space-y-6">
      <AdminHeader
        activeEvent={activeEvent}
        activePhase={activePhase}
        activeTeamCount={activeEvent ? (allTeamsByEvent.get(activeEvent.id)?.length ?? 0) : 0}
        activeTeamFallbackCount={activeEvent ? (teamCountsByEvent.get(activeEvent.id) ?? 0) : 0}
        events={events}
        pendingCount={pendingCount}
        t={t}
        userName={user.name}
      />

      {resolvedSearchParams?.success || resolvedSearchParams?.error ? (
        <ActionFeedback
          count={resolvedSearchParams.count}
          error={resolvedSearchParams.error}
          success={resolvedSearchParams.success}
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <AdminPhaseRail
          activeEvent={activeEvent}
          activePhase={activePhase}
          events={events}
          pendingCount={pendingCount}
          query={currentQuery}
          t={t}
        />

        <div className="min-w-0 space-y-6">
          {activePhase === "prepare" ? (
            <PrepareEventPhase
              activeEvent={activeEvent}
              allTeamsByEvent={allTeamsByEvent}
              events={events}
              gameModes={gameModes}
              organizerOptions={organizerOptions}
              t={t}
              userRole={user.role}
            />
          ) : null}

          {activePhase === "import" ? (
            <ImportRegistrationPhase
              allTeamsByEvent={allTeamsByEvent}
              captainUsers={captainUsers}
              events={events}
              importedEventIds={importedEventIds}
              importedTeams={importedTeams}
              t={t}
            />
          ) : null}

          {activePhase === "run" ? (
            <RunMatchDayPhase
              manageableEvents={manageableEvents}
              manageableMatches={manageableMatches}
              roundConfigMap={roundConfigMap}
              roundConfigs={roundConfigs}
              selectedManageableEvent={selectedManageableEvent}
              selectedMatch={selectedMatch}
              selectedMatchBestOf={selectedMatchBestOf}
              selectedMatchGames={selectedMatchGames}
              t={t}
              teamName={teamName}
            />
          ) : null}

          {activePhase === "review" ? (
            <ReviewPublishPhase
              certificatesByEvent={certificatesByEvent}
              events={events}
              pendingCount={pendingCount}
              pendingSubmissions={pendingSubmissions}
              t={t}
            />
          ) : null}

          <OperationsOverview
            activeEvent={activeEvent}
            activeMatches={activeMatches}
            activeLeaderboardCount={activeLeaderboard.length}
            allTeamsByEvent={allTeamsByEvent}
            teamCountsByEvent={teamCountsByEvent}
            events={events}
            t={t}
          />
        </div>
      </div>
    </div>
  );
}

function AdminHeader({
  activeEvent,
  activePhase,
  activeTeamFallbackCount,
  activeTeamCount,
  events,
  pendingCount,
  t,
  userName,
}: {
  activeEvent: EventItem | undefined;
  activePhase: AdminPhase;
  activeTeamFallbackCount: number;
  activeTeamCount: number;
  events: EventItem[];
  pendingCount: number;
  t: AdminTranslator;
  userName: string;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
      <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{t("title")}</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">{t("consoleTitle", { name: userName })}</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">{t("consoleDescription")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusChip tone="info">{t(`phaseShort.${activePhase}`)}</StatusChip>
          <StatusChip tone="success">{activeEvent?.name ?? t("noActiveEvent")}</StatusChip>
          <StatusChip tone={pendingCount > 0 ? "warning" : "default"}>
            {t("pendingReviews", { count: pendingCount })}
          </StatusChip>
        </div>
      </div>
      <div className="grid gap-px bg-slate-200 md:grid-cols-4">
        <HeaderMetric label={t("trackedEvents")} value={events.length} hint={t("trackedEventsHint")} />
        <HeaderMetric label={t("activeTeams")} value={activeTeamCount || activeTeamFallbackCount} hint={t("activeTeamsHint")} />
        <HeaderMetric label={t("activeEventStatus")} value={activeEvent?.status ?? "-"} hint={t("activeEventStatusHint")} />
        <HeaderMetric label={t("activeGame")} value={activeEvent ? getGameForEvent(activeEvent).name : "-"} hint={t("activeGameHint")} />
      </div>
    </section>
  );
}

function HeaderMetric({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

const SUCCESS_MESSAGES: Record<string, string> = {
  "teams-imported": "Tim berhasil diimpor",
  "event-status-updated": "Status event berhasil diperbarui",
  "captain-assigned": "Kapten berhasil ditugaskan",
  "team-deleted": "Tim berhasil dihapus",
  "event-archived": "Event berhasil diarsipkan",
  "user-deactivated": "Pengguna berhasil dinonaktifkan",
};

function ActionFeedback({ count, error, success }: { count?: string; error?: string; success?: string }) {
  if (success) {
    const message = SUCCESS_MESSAGES[success] ?? success.replaceAll("-", " ");
    return (
      <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        {message}{count ? ` (${count} tim).` : "."}
      </p>
    );
  }
  if (error) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 whitespace-pre-wrap">
        {error}
      </p>
    );
  }
  return null;
}

function AdminPhaseRail({
  activeEvent,
  activePhase,
  events,
  pendingCount,
  query,
  t,
}: {
  activeEvent: EventItem | undefined;
  activePhase: AdminPhase;
  events: EventItem[];
  pendingCount: number;
  query: Parameters<typeof buildAdminPhaseHref>[1];
  t: AdminTranslator;
}) {
  return (
    <aside className="h-fit rounded-xl border border-slate-200 bg-white p-3 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
      <p className="px-2 pb-2 text-xs font-semibold uppercase text-slate-500">{t("organizerPhase")}</p>
      <nav className="grid gap-1" aria-label={t("organizerPhase")}>
        {adminPhases.map((phase) => {
          const Icon = phaseIcons[phase];
          const isActive = phase === activePhase;
          return (
            <a
              key={phase}
              href={buildAdminPhaseHref(phase, query)}
              className={`grid gap-1 rounded-lg border px-3 py-3 transition ${
                isActive
                  ? "border-slate-300 bg-slate-50 text-slate-950"
                  : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50"
              }`}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0 text-cyan-600" />
                  <span className="truncate text-sm font-semibold">{t(`phases.${phase}.title`)}</span>
                </span>
                {phase === "review" && pendingCount > 0 ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                    {pendingCount}
                  </span>
                ) : null}
              </span>
              <span className="pl-6 text-xs text-slate-500">{t(`phases.${phase}.description`)}</span>
            </a>
          );
        })}
      </nav>

      <form action="" className="mt-4 border-t border-slate-200 pt-4">
        <input type="hidden" name="phase" value={activePhase} />
        <label className={labelClass}>
          {t("activeEvent")}
          <select className={inputClass} name="activeEventId" defaultValue={activeEvent?.id}>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </select>
        </label>
        <button className={`${quietButton} mt-3 w-full`} type="submit">
          <RefreshCw className="h-4 w-4" />
          {t("switchEvent")}
        </button>
      </form>

      <div className="mt-4 border-t border-slate-200 pt-4">
        <p className="px-2 pb-2 text-xs font-semibold uppercase text-slate-500">{t("nextAction")}</p>
        <div className="rounded-lg border border-cyan-100 bg-cyan-50 p-3">
          <p className="text-sm font-semibold text-slate-950">{t(`nextActionByPhase.${activePhase}.title`)}</p>
          <p className="mt-1 text-xs text-slate-600">{t(`nextActionByPhase.${activePhase}.description`)}</p>
        </div>
      </div>
    </aside>
  );
}

function PrepareEventPhase({
  activeEvent,
  allTeamsByEvent,
  events,
  gameModes,
  organizerOptions,
  t,
  userRole,
}: {
  activeEvent: EventItem | undefined;
  allTeamsByEvent: Map<string, TeamItem[]>;
  events: EventItem[];
  gameModes: GameModeItem[];
  organizerOptions: OrganizerItem[];
  t: AdminTranslator;
  userRole: string;
}) {
  return (
    <PhaseSection
      action={
        <a className={quietButton} href={activeEvent ? `../events/${activeEvent.slug}` : "../events"}>
          <Eye className="h-4 w-4" />
          {t("previewPublicPage")}
        </a>
      }
      description={t("prepareDescription")}
      title={t("prepareTitle")}
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
        <Section title={t("createEventTitle")} description={t("createEventDescription")} className="rounded-xl shadow-none">
          <form action={adminCreateEventAction} className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className={labelClass}>
                {t("eventNameLabel")}
                <input className={inputClass} name="name" placeholder="Flashpeak Mid-Season Cup" />
              </label>
              <label className={labelClass}>
                {t("slugLabel")}
                <input className={inputClass} name="slug" placeholder="flashpeak-mid-season-cup" />
              </label>
              {userRole === "platform_admin" || userRole === "admin" ? (
                <label className={labelClass}>
                  {t("createEventOrganizerLabel")}
                  <select className={inputClass} name="organizerUserId" defaultValue="">
                    <option value="">{t("createEventOrganizerPlaceholder")}</option>
                    {organizerOptions.map((organizer) => (
                      <option key={organizer.id} value={organizer.id}>
                        {organizer.name} - {organizer.email}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className={labelClass}>
                {t("gameModeLabel")}
                <select className={inputClass} name="gameModeId" defaultValue={gameModes[0]?.id}>
                  {gameModes.map((mode) => (
                    <option key={mode.id} value={mode.id}>
                      {getGameModeDisplayLabel(mode.id)}
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                {t("formatLabel")}
                <select className={inputClass} name="format" defaultValue="Single Elimination">
                  <option value="Single Elimination">Single Elimination</option>
                  <option value="League">League</option>
                </select>
              </label>
              <label className={labelClass}>
                {t("capLabel")}
                <select className={inputClass} name="participantCap" defaultValue="8">
                  {["8", "12", "16", "24", "32", "64", "128", "256"].map((cap) => (
                    <option key={cap} value={cap}>
                      {cap}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button className={primaryButton} type="submit">
              <CalendarPlus className="h-4 w-4" />
              {t("createEventSubmit")}
            </button>
          </form>
        </Section>

        <div className="grid gap-6">
          <Section title={t("statusTitle")} description={t("statusDescription")} className="rounded-xl shadow-none">
            {activeEvent ? (
              <form action={adminUpdateEventStatusAction} className="grid gap-4">
                <label className={labelClass}>
                  {t("eventLabel")}
                  <select className={inputClass} name="eventId" defaultValue={activeEvent.id}>
                    <EventOptions events={[activeEvent]} />
                  </select>
                </label>
                <label className={labelClass}>
                  {t("statusLabel")}
                  <select className={inputClass} name="status" defaultValue={activeEvent.status}>
                    {["Draft", "Published", "Registration Closed", "Ongoing", "Finished"].map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
                <SubmitButton className={quietButton}>
                  <Send className="h-4 w-4" />
                  {t("saveStatus")}
                </SubmitButton>
              </form>
            ) : (
              <p className="text-sm text-slate-500">{t("noEventsImport")}</p>
            )}
          </Section>

          <Section title={t("streamTitle")} description={t("streamDescription")} className="rounded-xl shadow-none">
            {activeEvent ? (
              <form action={adminUpdateStreamAction} className="grid gap-4">
                <input type="hidden" name="eventId" value={activeEvent.id} />
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {t("targetEvent")}: <span className="font-semibold text-slate-950">{activeEvent.name}</span>
                </p>
                <label className={labelClass}>
                  {t("streamLabel")}
                  <input className={inputClass} name="label" defaultValue={activeEvent.stream?.label ?? "Semifinal broadcast"} />
                </label>
                <label className={labelClass}>
                  {t("streamUrl")}
                  <input className={inputClass} name="url" defaultValue={activeEvent.stream?.url ?? "https://www.youtube.com/watch?v=dQw4w9WgXcQ"} />
                </label>
                <button className={quietButton} type="submit">
                  <LinkIcon className="h-4 w-4" />
                  {t("saveStream")}
                </button>
              </form>
            ) : (
              <p className="text-sm text-slate-500">{t("noEventsStream")}</p>
            )}
          </Section>
        </div>
      </div>
      <PublicListingSettingsSection events={events} t={t} />
      <BrandAssetsSection allTeamsByEvent={allTeamsByEvent} events={events} t={t} />
    </PhaseSection>
  );
}

function PublicListingSettingsSection({
  events,
  t,
}: {
  events: EventItem[];
  t: AdminTranslator;
}) {
  return (
    <Section title="Public Listing Settings" description="Atur info yang tampil di card event depan dan halaman detail publik." className="rounded-xl shadow-none">
      {events.length ? (
        <div className="grid gap-4">
          {events.map((event) => (
            <details key={event.id} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">{event.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {event.startsAt} - {event.prizePoolLabel ?? event.venue}
                  </p>
                </div>
                <StatusChip tone={event.registrationFeeLabel || event.registrationUrl ? "info" : "default"}>
                  {event.registrationFeeLabel ? event.registrationFeeLabel : "Listing info"}
                </StatusChip>
              </summary>

              <form action={adminUpdateEventPublicInfoAction} className="grid gap-4 border-t border-slate-200 bg-white p-4">
                <input type="hidden" name="eventId" value={event.id} />
                <label className={labelClass}>
                  Deskripsi event
                  <textarea
                    className={`${inputClass} min-h-28 resize-y leading-6`}
                    name="description"
                    defaultValue={event.description}
                    maxLength={500}
                    minLength={10}
                  />
                </label>
                <div className="grid gap-4 md:grid-cols-3">
                  <label className={labelClass}>
                    Jadwal pendaftaran
                    <input className={inputClass} name="registrationWindow" defaultValue={event.registrationWindow} maxLength={120} minLength={2} />
                  </label>
                  <label className={labelClass}>
                    Tanggal mulai
                    <input className={inputClass} name="startsAt" defaultValue={event.startsAt} maxLength={120} minLength={2} />
                  </label>
                  <label className={labelClass}>
                    Venue
                    <input className={inputClass} name="venue" defaultValue={event.venue} maxLength={120} minLength={2} />
                  </label>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <label className={labelClass}>
                    Hadiah pemenang
                    <input className={inputClass} name="prizePoolLabel" defaultValue={event.prizePoolLabel ?? ""} maxLength={80} placeholder="Rp3.000.000" />
                  </label>
                  <label className={labelClass}>
                    Biaya registrasi
                    <input className={inputClass} name="registrationFeeLabel" defaultValue={event.registrationFeeLabel ?? ""} maxLength={80} placeholder="Rp20.000 / team" />
                  </label>
                  <label className={labelClass}>
                    Link pendaftaran
                    <input className={inputClass} name="registrationUrl" defaultValue={event.registrationUrl ?? ""} placeholder="https://..." />
                  </label>
                </div>
                <div className="flex justify-end">
                  <button className={quietButton} type="submit">
                    <Save className="h-4 w-4" />
                    Simpan public info
                  </button>
                </div>
              </form>
            </details>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">{t("noEventsImport")}</p>
      )}
    </Section>
  );
}

function BrandAssetsSection({
  allTeamsByEvent,
  events,
  t,
}: {
  allTeamsByEvent: Map<string, TeamItem[]>;
  events: EventItem[];
  t: AdminTranslator;
}) {
  return (
    <Section title="Brand Assets" description="Upload logo event, background event, dan logo team untuk kartu publik dan halaman turnamen." className="rounded-xl shadow-none">
      {events.length ? (
        <div className="grid gap-4">
          {events.map((event) => {
            const teams = allTeamsByEvent.get(event.id) ?? [];
            const backgroundUrl = getEventBackgroundUrl(event);

            return (
              <details key={event.id} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-900">
                      {backgroundUrl ? (
                        <img src={backgroundUrl} alt="" className="h-full w-full object-cover" />
                      ) : null}
                      <div className="absolute inset-0 bg-slate-950/35" />
                      <div className="absolute bottom-1 left-1">
                        <TeamAvatar logoText={event.name.slice(0, 2).toUpperCase()} logoUrl={event.logoUrl} name={event.name} size="sm" />
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">{event.name}</p>
                      <p className="text-xs text-slate-500">{getGameForEvent(event).name} - {teams.length}/{event.participantCap} teams</p>
                    </div>
                  </div>
                  <StatusChip tone={event.logoUrl && backgroundUrl ? "success" : "default"}>
                    {event.logoUrl && backgroundUrl ? "Ready" : "Needs assets"}
                  </StatusChip>
                </summary>

                <div className="grid gap-5 border-t border-slate-200 bg-white p-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                  <div className="grid gap-4">
                    <form action={adminUploadEventLogoAction} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <input type="hidden" name="eventId" value={event.id} />
                      <div className="flex items-center gap-3">
                        <TeamAvatar logoText={event.name.slice(0, 2).toUpperCase()} logoUrl={event.logoUrl} name={event.name} size="lg" />
                        <div>
                          <p className="text-sm font-semibold text-slate-950">Event logo</p>
                          <p className="text-xs text-slate-500">PNG, JPG, atau WebP. Maks 2 MB.</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <input type="file" name="eventLogo" accept="image/png,image/webp,image/jpeg" className={`${inputClass} flex-1 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-slate-700`} />
                        <button className={quietButton} type="submit">
                          <ImageUp className="h-4 w-4" />
                          Upload
                        </button>
                      </div>
                    </form>

                    <form action={adminUploadEventBackgroundAction} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <input type="hidden" name="eventId" value={event.id} />
                      <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-900">
                        {backgroundUrl ? (
                          <img src={backgroundUrl} alt={`${event.name} background preview`} className="aspect-video w-full object-cover" />
                        ) : (
                          <div className="flex aspect-video items-center justify-center text-sm text-slate-400">No background</div>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-950">Event background</p>
                        <p className="text-xs text-slate-500">Disarankan 16:9. PNG, JPG, atau WebP. Maks 5 MB.</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <input type="file" name="eventBackground" accept="image/png,image/webp,image/jpeg" className={`${inputClass} flex-1 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-slate-700`} />
                        <button className={quietButton} type="submit">
                          <ImageUp className="h-4 w-4" />
                          Upload
                        </button>
                      </div>
                    </form>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">Team logos</p>
                        <p className="text-xs text-slate-500">Organizer mengelola logo semua team di event ini.</p>
                      </div>
                      <StatusChip tone="default">{teams.length} teams</StatusChip>
                    </div>
                    <div className="grid max-h-[30rem] gap-2 overflow-y-auto pr-1">
                      {teams.length ? teams.map((team) => (
                        <form key={team.id} action={adminUploadTeamLogoAction} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-[minmax(10rem,1fr)_minmax(14rem,1fr)_auto] md:items-center">
                          <input type="hidden" name="teamId" value={team.id} />
                          <TeamIdentity logoText={team.logoText} logoUrl={team.logoUrl} name={team.name} meta={team.tag} />
                          <input type="file" name="teamLogo" accept="image/png,image/webp,image/jpeg" className={`${inputClass} min-w-0 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-slate-700`} />
                          <button className={quietButton} type="submit">
                            <ImageUp className="h-4 w-4" />
                            Upload
                          </button>
                        </form>
                      )) : (
                        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">Belum ada team di event ini.</p>
                      )}
                    </div>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-slate-500">{t("noEventsImport")}</p>
      )}
    </Section>
  );
}

function ImportRegistrationPhase({
  allTeamsByEvent,
  captainUsers,
  events,
  importedEventIds,
  importedTeams,
  t,
}: {
  allTeamsByEvent: Map<string, TeamItem[]>;
  captainUsers: CaptainUser[];
  events: EventItem[];
  importedEventIds: Set<string>;
  importedTeams: ImportedTeamItem[];
  t: AdminTranslator;
}) {
  return (
    <PhaseSection
      action={
        <a className={quietButton} href="/templates/team-import-template.csv">
          <Download className="h-4 w-4" />
          {t("downloadTemplate")}
        </a>
      }
      description={t("importDescription")}
      title={t("importWorkspaceTitle")}
    >
      <div className="grid min-w-0 gap-5">
        <Section title={t("importTitle")} description={t("importHelp")} className="min-w-0 overflow-hidden rounded-xl shadow-none">
          <form action={adminImportTeamsCsvAction} className="grid min-w-0 gap-4 lg:grid-cols-[minmax(22rem,1fr)_minmax(12rem,16rem)] lg:items-end">
            <div className="grid min-w-0 gap-3">
              <label className={labelClass}>
                {t("csvFile")}
                <input
                  className={`${inputClass} block w-full min-w-0 max-w-full overflow-hidden file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200`}
                  name="csv"
                  type="file"
                  accept=".csv,text/csv"
                />
              </label>
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                {t("requiredColumns")}:{" "}
                <span className="mono inline-block max-w-full break-all text-slate-900">
                  event_slug,team_name,team_tag,captain_name,captain_contact
                </span>
              </p>
            </div>
            <SubmitButton className={`${primaryButton} min-h-11 w-full self-stretch px-5`}>
              <Upload className="h-4 w-4" />
              {t("importSubmit")}
            </SubmitButton>
          </form>
        </Section>

        <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(24rem,0.9fr)_minmax(32rem,1.1fr)]">
          <Section title={t("importSlugsTitle")} description={t("importSlugsDescription")} className="min-w-0 overflow-hidden rounded-xl shadow-none">
            <DataTable
              columns={[t("eventLabel"), "event_slug", t("statusLabel"), t("teamsLabel"), ""]}
              minTableWidth="44rem"
              rows={events.map((event) => [
                <span key={`${event.id}-name`} className="font-medium text-slate-800">{event.name}</span>,
                <span key={`${event.id}-slug`} className="mono block max-w-40 break-all text-xs text-slate-700">{event.slug}</span>,
                <Pill key={`${event.id}-import-status`} tone={event.status === "Ongoing" ? "live" : "default"}>
                  {event.status}
                </Pill>,
                allTeamsByEvent.get(event.id)?.length ?? 0,
                importedEventIds.has(event.id) ? (
                  <a
                    key={`${event.id}-creds`}
                    className="inline-flex min-w-max items-center gap-1 text-xs font-semibold text-cyan-700 hover:text-cyan-600"
                    href={`/api/admin/captain-credentials?eventId=${event.id}`}
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    {t("downloadCredentials")}
                  </a>
                ) : null,
              ])}
            />
          </Section>

          <Section title={t("importedRegistrationsTitle")} description={t("importedRegistrationsDescription")} className="min-w-0 overflow-hidden rounded-xl shadow-none">
            {importedTeams.length ? (
              <DataTable
                columns={[t("eventLabel"), t("teamLabel"), "Tag", "PIC", t("contactLabel"), t("sourceLabel"), "Kapten Assign"]}
                minTableWidth="72rem"
                rows={importedTeams.map((team) => [
                  <span key={`${team.id}-event`} className="font-medium text-slate-800">{team.eventName}</span>,
                  <span key={`${team.id}-team`} className="font-medium text-slate-800">{team.name}</span>,
                  <span key={`${team.id}-tag`} className="mono text-xs text-slate-700">{team.tag}</span>,
                  getCaptainDisplayName(team),
                  <span key={`${team.id}-contact`} className="mono text-xs text-slate-700">{team.captainContact ?? "-"}</span>,
                  team.source ?? "-",
                  <form key={`${team.id}-assign`} action={adminAssignCaptainAction} className="flex items-center gap-2">
                    <input type="hidden" name="teamId" value={team.id} />
                    <select
                      name="captainUserId"
                      defaultValue={team.captainId ?? ""}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                    >
                      <option value="">— Tidak ada —</option>
                      {captainUsers.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="rounded-full bg-cyan-600 px-3 py-1 text-xs font-semibold text-white hover:bg-cyan-500"
                    >
                      Simpan
                    </button>
                  </form>,
                ])}
              />
            ) : (
              <p className="text-sm text-slate-500">{t("noImportedRegistrations")}</p>
            )}
          </Section>
        </div>
      </div>
    </PhaseSection>
  );
}

function RunMatchDayPhase({
  manageableEvents,
  manageableMatches,
  roundConfigMap,
  roundConfigs,
  selectedManageableEvent,
  selectedMatch,
  selectedMatchBestOf,
  selectedMatchGames,
  t,
  teamName,
}: {
  manageableEvents: ManageableEventItem[];
  manageableMatches: MatchItem[];
  roundConfigMap: Map<string, number>;
  roundConfigs: RoundConfigItem[];
  selectedManageableEvent: ManageableEventItem | undefined;
  selectedMatch: MatchItem | undefined;
  selectedMatchBestOf: number;
  selectedMatchGames: MatchGameItem[];
  t: AdminTranslator;
  teamName: (teamId: string | undefined) => string;
}) {
  const distinctRoundLabels = selectedManageableEvent
    ? [...new Set(selectedManageableEvent.manageableMatches.map((match) => match.roundLabel))]
    : [];

  return (
    <PhaseSection
      action={
        <a className={quietButton} href={buildAdminPhaseHref("run", { matchEventId: selectedManageableEvent?.event.id })}>
          <RefreshCw className="h-4 w-4" />
          {t("refreshMatchDesk")}
        </a>
      }
      description={t("runDescription")}
      title={t("runTitle")}
    >
      {selectedManageableEvent ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.9fr)]">
          <div className="grid gap-6">
            <Section title={t("matchQueueTitle")} description={t("matchQueueDescription")} className="rounded-xl shadow-none">
              <form action="" className="mb-5 flex flex-wrap items-end gap-3">
                <input type="hidden" name="phase" value="run" />
                <label className={`${labelClass} min-w-64 flex-1`}>
                  {t("eventSelect")}
                  <select className={inputClass} name="matchEventId" defaultValue={selectedManageableEvent.event.id}>
                    {manageableEvents.map(({ event, manageableMatches: eventMatches }) => (
                      <option key={event.id} value={event.id}>
                        {event.name} - {t("matchesRemaining", { n: eventMatches.length })}
                      </option>
                    ))}
                  </select>
                </label>
                <button className={quietButton} type="submit">
                  <RefreshCw className="h-4 w-4" />
                  {t("changeEvent")}
                </button>
              </form>

              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {manageableMatches.map((match) => {
                  const bo = roundConfigMap.get(match.roundLabel) ?? 1;
                  const isSelected = selectedMatch?.id === match.id;
                  return (
                    <a
                      key={match.id}
                      href={`?phase=run&matchEventId=${selectedManageableEvent.event.id}&matchId=${match.id}`}
                      className={`grid gap-2 rounded-lg border px-3 py-3 transition ${
                        isSelected
                          ? "border-cyan-300 bg-cyan-50"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold uppercase text-slate-500">
                          {match.roundLabel} - Match {match.slot}
                        </span>
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                          BO{bo}
                        </span>
                      </span>
                      <span className="text-sm font-semibold text-slate-950">
                        {teamName(match.homeTeamId)} <span className="text-slate-400">vs</span> {teamName(match.awayTeamId)}
                      </span>
                    </a>
                  );
                })}
              </div>
            </Section>

            {distinctRoundLabels.length ? (
              <Section title={t("roundConfigTitle")} description={t("roundConfigDesc")} className="rounded-xl shadow-none">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {distinctRoundLabels.map((label) => {
                    const currentBestOf = roundConfigMap.get(label) ?? roundConfigs.find((config) => config.roundLabel === label)?.bestOf ?? 1;
                    return (
                      <form key={label} action={adminSetRoundConfigAction} className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <input type="hidden" name="eventId" value={selectedManageableEvent.event.id} />
                        <input type="hidden" name="roundLabel" value={label} />
                        <label className={labelClass}>
                          {label}
                          <select name="bestOf" defaultValue={currentBestOf} className={inputClass}>
                            <option value="1">Best of 1</option>
                            <option value="3">Best of 3</option>
                            <option value="5">Best of 5</option>
                          </select>
                        </label>
                        <button className={quietButton} type="submit">
                          <SlidersHorizontal className="h-4 w-4" />
                          {t("saveRoundConfig")}
                        </button>
                      </form>
                    );
                  })}
                </div>
              </Section>
            ) : null}
          </div>

          <Section title={t("selectedMatchTitle")} description={t("selectedMatchDescription")} className="rounded-xl shadow-none">
            {selectedMatch ? (
              <div className="grid gap-5">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-500">
                        {selectedMatch.roundLabel} - Match {selectedMatch.slot}
                      </p>
                      <p className="mt-1 text-base font-semibold text-slate-950">
                        {teamName(selectedMatch.homeTeamId)} <span className="text-slate-400">vs</span> {teamName(selectedMatch.awayTeamId)}
                      </p>
                    </div>
                    <StatusChip tone="warning">Best of {selectedMatchBestOf}</StatusChip>
                  </div>
                </div>

                {selectedMatchBestOf === 1 ? (
                  <form action={adminUpdateMatchResultAction} className="grid gap-4">
                    <input type="hidden" name="eventId" value={selectedManageableEvent.event.id} />
                    <input type="hidden" name="matchEventId" value={selectedManageableEvent.event.id} />
                    <input type="hidden" name="matchId" value={selectedMatch.id} />
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className={labelClass}>
                        {teamName(selectedMatch.homeTeamId)} (Home)
                        <input className={inputClass} name="homeScore" type="number" min="0" defaultValue="0" />
                      </label>
                      <label className={labelClass}>
                        {teamName(selectedMatch.awayTeamId)} (Away)
                        <input className={inputClass} name="awayScore" type="number" min="0" defaultValue="0" />
                      </label>
                    </div>
                    <button className={primaryButton} type="submit">
                      <Save className="h-4 w-4" />
                      {t("saveResult")}
                    </button>
                  </form>
                ) : (
                  <form action={adminSetMatchGamesAction} className="grid gap-4">
                    <input type="hidden" name="matchId" value={selectedMatch.id} />
                    <input type="hidden" name="matchEventId" value={selectedManageableEvent.event.id} />
                    <input type="hidden" name="bestOf" value={selectedMatchBestOf} />
                    <div className="grid gap-3">
                      <div className="grid grid-cols-[3rem_1fr_1fr] gap-3">
                        <div />
                        <p className="text-xs font-semibold uppercase text-slate-500">{teamName(selectedMatch.homeTeamId)}</p>
                        <p className="text-xs font-semibold uppercase text-slate-500">{teamName(selectedMatch.awayTeamId)}</p>
                      </div>
                      {Array.from({ length: selectedMatchBestOf }, (_, index) => {
                        const gameNumber = index + 1;
                        const existingGame = selectedMatchGames.find((game) => game.gameNumber === gameNumber);
                        return (
                          <div key={gameNumber} className="grid grid-cols-[3rem_1fr_1fr] items-center gap-3">
                            <p className="text-xs font-semibold text-slate-500">G{gameNumber}</p>
                            <input className={`${inputClass} text-center font-semibold`} name={`game${gameNumber}_home`} type="number" min="0" defaultValue={existingGame?.homeScore ?? ""} placeholder="-" />
                            <input className={`${inputClass} text-center font-semibold`} name={`game${gameNumber}_away`} type="number" min="0" defaultValue={existingGame?.awayScore ?? ""} placeholder="-" />
                          </div>
                        );
                      })}
                    </div>
                    <button className={primaryButton} type="submit">
                      <Save className="h-4 w-4" />
                      {t("saveGames")}
                    </button>
                  </form>
                )}

                <a href={`?phase=run&matchEventId=${selectedManageableEvent.event.id}`} className="text-sm font-medium text-slate-500 hover:text-slate-700">
                  {t("cancelAction")}
                </a>
              </div>
            ) : (
              <p className="text-sm text-slate-500">{t("selectMatch")}</p>
            )}
          </Section>
        </div>
      ) : (
        <Section title={t("matchTitle")} description={t("matchDescription")} className="rounded-xl shadow-none">
          <p className="text-sm text-slate-500">{t("noMatches")}</p>
        </Section>
      )}
    </PhaseSection>
  );
}

function ReviewPublishPhase({
  certificatesByEvent,
  events,
  pendingCount,
  pendingSubmissions,
  t,
}: {
  certificatesByEvent: Map<string, CertificateItem>;
  events: EventItem[];
  pendingCount: number;
  pendingSubmissions: PendingSubmissionItem[];
  t: AdminTranslator;
}) {
  return (
    <PhaseSection
      action={<StatusChip tone={pendingCount > 0 ? "warning" : "success"}>{t("pendingReviews", { count: pendingCount })}</StatusChip>}
      description={t("reviewDescription")}
      title={t("reviewWorkspaceTitle")}
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.9fr)]">
        <Section
          title={`${t("statReviewTitle")}${pendingCount > 0 ? ` - ${pendingCount} ${t("pending")}` : ""}`}
          description={t("statReviewDescription")}
          className="rounded-xl shadow-none"
        >
          {pendingSubmissions.length === 0 ? (
            <p className="text-sm text-slate-500">{t("noPendingSubmissions")}</p>
          ) : (
            <div className="grid gap-3">
              {pendingSubmissions.map((submission) => (
                <details key={submission.id} className="rounded-lg border border-slate-200 bg-slate-50">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">
                        {submission.matchLabel} - {submission.teamName}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {submission.eventName} - {submission.captainEmail} - {new Date(submission.submittedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <StatusChip tone="warning">{t("pending")}</StatusChip>
                  </summary>

                  <div className="border-t border-slate-200 bg-white p-4">
                    <div className="mb-4 overflow-x-auto">
                      <table className="w-full text-xs text-slate-700">
                        <thead>
                          <tr>
                            <th className="py-1 text-left font-semibold uppercase text-slate-500">{t("playerId")}</th>
                            <th className="px-2 py-1 text-left font-semibold uppercase text-slate-500">{t("statsLabel")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(submission.stats).map(([playerId, stats]) => (
                            <tr key={playerId} className="border-t border-slate-100">
                              <td className="mono py-1.5 pr-3 text-slate-500">{playerId.slice(0, 12)}...</td>
                              <td className="py-1.5">
                                {Object.entries(stats).map(([key, value]) => (
                                  <span key={key} className="mr-2 inline-block">
                                    <span className="text-slate-500">{key}:</span>{" "}
                                    <span className="text-slate-900">{value}</span>
                                  </span>
                                ))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <form action={adminApproveStatAction}>
                        <input type="hidden" name="submissionId" value={submission.id} />
                        <button className={primaryButton} type="submit">
                          <Check className="h-4 w-4" />
                          {t("approve")}
                        </button>
                      </form>
                      <form action={adminRejectStatAction} className="flex flex-wrap gap-2">
                        <input type="hidden" name="submissionId" value={submission.id} />
                        <input className={inputClass} name="rejectionNote" placeholder={t("rejectionNote")} />
                        <button className={quietButton} type="submit">
                          <X className="h-4 w-4" />
                          {t("reject")}
                        </button>
                      </form>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          )}
        </Section>

        <Section title={t("certificateSettingsTitle")} description={t("certificateSettingsDescription")} className="rounded-xl shadow-none">
          <div className="space-y-4">
            {events.map((event) => {
              const cert = certificatesByEvent.get(event.id);
              return (
                <details key={event.id} className="rounded-lg border border-slate-200 bg-slate-50">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{event.name}</p>
                      <p className="text-xs text-slate-500">{getGameForEvent(event).name} - {event.status}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusChip tone={cert ? "success" : "default"}>
                        {cert ? t("certificateReady") : t("noCertificate")}
                      </StatusChip>
                      {event.accentColor ? (
                        <span className="inline-block h-5 w-5 rounded-full border border-slate-300" style={{ background: event.accentColor }} />
                      ) : null}
                    </div>
                  </summary>
                  <div className="grid gap-4 border-t border-slate-200 bg-white p-4">
                    <form action={adminUploadCharacterArtAction} className="grid gap-3">
                      <input type="hidden" name="eventId" value={event.id} />
                      <p className="text-xs font-semibold uppercase text-slate-500">{t("characterArt")}</p>
                      {event.characterArtUrl ? (
                        <img src={event.characterArtUrl} alt="Character art preview" className="h-24 w-auto rounded-lg border border-slate-200 object-contain" />
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <input type="file" name="characterArt" accept="image/png,image/webp,image/jpeg" className={`${inputClass} flex-1 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-slate-700`} />
                        <button className={quietButton} type="submit">
                          <ImageUp className="h-4 w-4" />
                          {t("upload")}
                        </button>
                      </div>
                    </form>
                    <form action={adminSetAccentColorAction} className="flex flex-wrap items-end gap-3">
                      <input type="hidden" name="eventId" value={event.id} />
                      <label className={labelClass}>
                        {t("accentColor")}
                        <input type="color" name="accentColor" defaultValue={event.accentColor ?? "#2563eb"} className="h-10 w-16 cursor-pointer rounded-lg border border-slate-200 bg-white p-1" />
                      </label>
                      <button className={quietButton} type="submit">
                        <Palette className="h-4 w-4" />
                        {t("saveColor")}
                      </button>
                    </form>
                    {cert ? (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                        <p className="mb-1 text-xs font-semibold text-emerald-700">{t("championCertificate")}</p>
                        <a href={cert.imageUrl} target="_blank" rel="noopener noreferrer" className="break-all text-xs text-emerald-700 underline">
                          {cert.imageUrl}
                        </a>
                      </div>
                    ) : null}
                  </div>
                </details>
              );
            })}
          </div>
        </Section>
      </div>
    </PhaseSection>
  );
}

function OperationsOverview({
  activeEvent,
  activeLeaderboardCount,
  activeMatches,
  allTeamsByEvent,
  events,
  teamCountsByEvent,
  t,
}: {
  activeEvent: EventItem | undefined;
  activeLeaderboardCount: number;
  activeMatches: Awaited<ReturnType<typeof getMatchesForEvent>>;
  allTeamsByEvent: Map<string, TeamItem[]>;
  events: EventItem[];
  teamCountsByEvent: Map<string, number>;
  t: AdminTranslator;
}) {
  return (
    <Section title={t("operationsOverviewTitle")} description={t("operationsOverviewDescription")} className="rounded-xl shadow-none">
      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <StatCard label={t("activeMatches")} value={activeMatches.length} hint={t("activeMatchesHint")} />
        <StatCard label={t("leaderboardRows")} value={activeLeaderboardCount} hint={t("leaderboardRowsHint")} />
        <StatCard
          label={t("activeTeams")}
          value={activeEvent ? (allTeamsByEvent.get(activeEvent.id)?.length ?? teamCountsByEvent.get(activeEvent.id) ?? 0) : 0}
          hint={t("activeTeamsHint")}
        />
      </div>
      <DataTable
        columns={[t("eventLabel"), t("gameLabel"), t("statusLabel"), t("formatLabel"), t("teamsLabel"), t("matchesLabel")]}
        rows={events.map((event) => [
          event.name,
          getGameForEvent(event).name,
          <Pill key={`${event.id}-status`} tone={event.status === "Ongoing" ? "live" : "default"}>
            {event.status}
          </Pill>,
          event.format,
          allTeamsByEvent.get(event.id)?.length ?? teamCountsByEvent.get(event.id) ?? 0,
          activeEvent?.id === event.id ? activeMatches.length : 0,
        ])}
      />
    </Section>
  );
}

function PhaseSection({
  action,
  children,
  description,
  title,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">{title}</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">{description}</p>
        </div>
        {action ? <div className="flex flex-wrap gap-2">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

function EventOptions({ events }: { events: EventItem[] }) {
  return (
    <>
      {events.map((event) => (
        <option key={event.id} value={event.id}>
          {event.name}
        </option>
      ))}
    </>
  );
}

function StatusChip({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "info" | "success" | "warning" }) {
  const toneClass = {
    default: "border-slate-200 bg-slate-50 text-slate-600",
    info: "border-cyan-200 bg-cyan-50 text-cyan-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
  }[tone];

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass}`}>
      {children}
    </span>
  );
}
