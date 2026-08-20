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
  adminArchiveEventAction,
  adminAssignCaptainAction,
  adminCreateEventAction,
  adminDeactivateUserAction,
  adminDeleteTeamAction,
  adminImportTeamsCsvAction,
  adminRejectStatAction,
  adminSaveMatchPlayerStatsAction,
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
  getMatchWithRosterAndStats,
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
import { getGameModeDisplayLabel, getStatKeysForMode } from "@/lib/platform/config";
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
    activePhase === "import" || activePhase === "prepare" ? getCaptainUsersForAdmin() : Promise.resolve([] as CaptainUser[]),
  ]);

  const importedTeams = importedTeamsRaw
    .map((team) => ({
      ...team,
      eventName: events.find((event) => event.id === team.eventId)?.name ?? "Unknown event",
    }))
    .reverse();
  const importedEventIds = new Set(importedTeamsRaw.map((team) => team.eventId));

  const selectedMatchId = resolvedSearchParams?.matchId;

  // Completed matches for the currently active event only.
  // Filtered by activeEvent so "Hasil & Statistik" stays scoped to what the admin is working on.
  const completedMatchesWithEvent: { match: MatchItem; event: EventItem }[] = activePhase === "run" && activeEvent
    ? (await getMatchesForEvent(activeEvent.id))
        .filter((m) => m.status === "Completed")
        .map((match) => ({ match, event: activeEvent }))
    : [];

  const completedMatchItem = selectedMatchId
    ? completedMatchesWithEvent.find((item) => item.match.id === selectedMatchId)
    : undefined;

  const [roundConfigs, selectedMatchGames, selectedMatchRosterAndStats] = await Promise.all([
    activePhase === "run" && selectedManageableEvent ? getEventRoundConfigs(selectedManageableEvent.event.id) : Promise.resolve([]),
    activePhase === "run" && selectedMatchId ? getMatchGames(selectedMatchId) : Promise.resolve([]),
    activePhase === "run" && selectedMatchId ? getMatchWithRosterAndStats(selectedMatchId) : Promise.resolve(null),
  ]);
  const roundConfigMap = new Map(roundConfigs.map((config) => [config.roundLabel, config.bestOf]));
  const selectedMatch = selectedMatchId
    ? (manageableMatches.find((match) => match.id === selectedMatchId) ?? completedMatchItem?.match)
    : undefined;
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
              captainUsers={captainUsers}
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
              activeEvent={activeEvent}
              completedMatchesWithEvent={completedMatchesWithEvent}
              completedMatchItem={completedMatchItem}
              manageableEvents={manageableEvents}
              manageableMatches={manageableMatches}
              roundConfigMap={roundConfigMap}
              roundConfigs={roundConfigs}
              selectedManageableEvent={selectedManageableEvent}
              selectedMatch={selectedMatch}
              selectedMatchBestOf={selectedMatchBestOf}
              selectedMatchGames={selectedMatchGames}
              selectedMatchRosterAndStats={selectedMatchRosterAndStats}
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
        <SubmitButton className={`${quietButton} mt-3 w-full`}>
          <RefreshCw className="h-4 w-4" />
          {t("switchEvent")}
        </SubmitButton>
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
  captainUsers,
  events,
  gameModes,
  organizerOptions,
  t,
  userRole,
}: {
  activeEvent: EventItem | undefined;
  allTeamsByEvent: Map<string, TeamItem[]>;
  captainUsers: CaptainUser[];
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
            <SubmitButton className={primaryButton}>
              <CalendarPlus className="h-4 w-4" />
              {t("createEventSubmit")}
            </SubmitButton>
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
                <SubmitButton className={quietButton}>
                  <LinkIcon className="h-4 w-4" />
                  {t("saveStream")}
                </SubmitButton>
              </form>
            ) : (
              <p className="text-sm text-slate-500">{t("noEventsStream")}</p>
            )}
          </Section>
        </div>
      </div>
      <PublicListingSettingsSection events={events} t={t} />
      <BrandAssetsSection allTeamsByEvent={allTeamsByEvent} events={events} t={t} />

      <Section title="Arsip / Hapus Event" description="Arsipkan event selesai atau hapus event Draft yang kosong." className="rounded-xl shadow-none">
        {events.length ? (
          <div className="grid gap-3">
            {events.map((event) => (
              <div key={event.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <span className="flex-1 text-sm font-medium text-slate-800">{event.name} <span className="font-normal text-slate-500">({event.status})</span></span>
                <form action={adminArchiveEventAction} className="flex items-center gap-2">
                  <input type="hidden" name="eventId" value={event.id} />
                  <input type="hidden" name="action" value="archive" />
                  <SubmitButton className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100">
                    Arsipkan (Selesai)
                  </SubmitButton>
                </form>
                {event.status === "Draft" && (
                  <details className="relative">
                    <summary className="cursor-pointer rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-100">
                      Hapus Event
                    </summary>
                    <div className="absolute right-0 z-10 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                      <p className="mb-2 text-xs text-slate-600">Hapus event Draft ini? Tindakan tidak dapat dibatalkan.</p>
                      <form action={adminArchiveEventAction}>
                        <input type="hidden" name="eventId" value={event.id} />
                        <input type="hidden" name="action" value="delete" />
                        <SubmitButton className="w-full rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-500">
                          Konfirmasi Hapus
                        </SubmitButton>
                      </form>
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Belum ada event.</p>
        )}
      </Section>

      {userRole === "platform_admin" && captainUsers.length > 0 && (
        <Section title="Nonaktifkan Pengguna" description="Hanya platform_admin. Akun kapten yang dinonaktifkan tidak dapat login." className="rounded-xl shadow-none">
          <div className="grid gap-3">
            {captainUsers.map((captain) => (
              <div key={captain.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <span className="flex-1 text-sm text-slate-800">{captain.name} <span className="text-xs text-slate-500">({captain.email})</span></span>
                <details className="relative">
                  <summary className="cursor-pointer rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-100">
                    Nonaktifkan
                  </summary>
                  <div className="absolute right-0 z-10 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                    <p className="mb-2 text-xs text-slate-600">Nonaktifkan {captain.name}? Kapten tidak dapat login setelah ini.</p>
                    <form action={adminDeactivateUserAction}>
                      <input type="hidden" name="userId" value={captain.id} />
                      <SubmitButton className="w-full rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-500">
                        Konfirmasi Nonaktifkan
                      </SubmitButton>
                    </form>
                  </div>
                </details>
              </div>
            ))}
          </div>
        </Section>
      )}
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
                  <SubmitButton className={quietButton}>
                    <Save className="h-4 w-4" />
                    Simpan public info
                  </SubmitButton>
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
                        <SubmitButton className={quietButton}>
                          <ImageUp className="h-4 w-4" />
                          Upload
                        </SubmitButton>
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
                        <SubmitButton className={quietButton}>
                          <ImageUp className="h-4 w-4" />
                          Upload
                        </SubmitButton>
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
                          <SubmitButton className={quietButton}>
                            <ImageUp className="h-4 w-4" />
                            Upload
                          </SubmitButton>
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
                columns={[t("eventLabel"), t("teamLabel"), "Tag", "PIC", t("contactLabel"), t("sourceLabel"), "Kapten Assign", ""]}
                minTableWidth="80rem"
                rows={importedTeams.map((team) => {
                  const eventStatus = events.find((e) => e.id === team.eventId)?.status;
                  return [
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
                      <SubmitButton className="rounded-full bg-cyan-600 px-3 py-1 text-xs font-semibold text-white hover:bg-cyan-500">
                        Simpan
                      </SubmitButton>
                    </form>,
                    eventStatus === "Draft" ? (
                      <details key={`${team.id}-delete`} className="relative">
                        <summary className="cursor-pointer text-xs font-medium text-red-600 hover:underline">Hapus</summary>
                        <div className="absolute right-0 z-10 mt-1 w-52 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                          <p className="mb-2 text-xs text-slate-600">Hapus {team.name}?</p>
                          <form action={adminDeleteTeamAction}>
                            <input type="hidden" name="teamId" value={team.id} />
                            <SubmitButton className="w-full rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-500">
                              Konfirmasi Hapus
                            </SubmitButton>
                          </form>
                        </div>
                      </details>
                    ) : <span key={`${team.id}-nodelete`} />,
                  ];
                })}
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

type MatchRosterAndStats = Awaited<ReturnType<typeof getMatchWithRosterAndStats>>;
type CompletedMatchWithEvent = { match: MatchItem; event: EventItem };

function RunMatchDayPhase({
  activeEvent,
  completedMatchesWithEvent,
  completedMatchItem,
  manageableEvents,
  manageableMatches,
  roundConfigMap,
  roundConfigs,
  selectedManageableEvent,
  selectedMatch,
  selectedMatchBestOf,
  selectedMatchGames,
  selectedMatchRosterAndStats,
  t,
  teamName,
}: {
  activeEvent: EventItem | undefined;
  completedMatchesWithEvent: CompletedMatchWithEvent[];
  completedMatchItem: CompletedMatchWithEvent | undefined;
  manageableEvents: ManageableEventItem[];
  manageableMatches: MatchItem[];
  roundConfigMap: Map<string, number>;
  roundConfigs: RoundConfigItem[];
  selectedManageableEvent: ManageableEventItem | undefined;
  selectedMatch: MatchItem | undefined;
  selectedMatchBestOf: number;
  selectedMatchGames: MatchGameItem[];
  selectedMatchRosterAndStats: MatchRosterAndStats;
  t: AdminTranslator;
  teamName: (teamId: string | undefined) => string;
}) {
  const distinctRoundLabels = selectedManageableEvent
    ? [...new Set(selectedManageableEvent.manageableMatches.map((match) => match.roundLabel))]
    : [];

  const hasContent = selectedManageableEvent || completedMatchesWithEvent.length > 0;

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
      {hasContent ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.85fr)]">
          <div className="grid gap-6">
            {selectedManageableEvent ? (
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
                  <SubmitButton className={quietButton}>
                    <RefreshCw className="h-4 w-4" />
                    {t("changeEvent")}
                  </SubmitButton>
                </form>

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {manageableMatches.map((match) => {
                    const bo = roundConfigMap.get(match.roundLabel) ?? 1;
                    const isSelected = selectedMatch?.id === match.id;
                    return (
                      <a
                        key={match.id}
                        href={`?phase=run&matchEventId=${selectedManageableEvent.event.id}&matchId=${match.id}`}
                        className={`grid gap-2 rounded-xl border px-3 py-3 transition ${
                          isSelected
                            ? "border-cyan-300 bg-cyan-50 shadow-[0_0_0_3px_rgba(34,211,238,0.15)]"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            {match.roundLabel} · M{match.slot}
                          </span>
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                            BO{bo}
                          </span>
                        </span>
                        <span className="text-sm font-semibold leading-snug text-slate-900">
                          {teamName(match.homeTeamId)}
                          <span className="mx-1.5 font-normal text-slate-400">vs</span>
                          {teamName(match.awayTeamId)}
                        </span>
                      </a>
                    );
                  })}
                </div>
              </Section>
            ) : null}

            {completedMatchesWithEvent.length > 0 ? (
              <Section
                title="Hasil & Statistik"
                description={`Match selesai di ${activeEvent?.name ?? "event aktif"} — klik untuk input atau edit statistik pemain.`}
                className="rounded-xl shadow-none"
              >
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {completedMatchesWithEvent.map(({ match }) => {
                    const isSelected = selectedMatch?.id === match.id;
                    const homeScore = match.homeScore;
                    const awayScore = match.awayScore;
                    return (
                      <a
                        key={match.id}
                        href={`?phase=run&activeEventId=${activeEvent?.id ?? ""}&matchEventId=${selectedManageableEvent?.event.id ?? ""}&matchId=${match.id}`}
                        className={`grid gap-2.5 rounded-xl border px-3 py-3 transition ${
                          isSelected
                            ? "border-emerald-300 bg-emerald-50 shadow-[0_0_0_3px_rgba(52,211,153,0.15)]"
                            : "border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/50"
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            {match.roundLabel}
                          </span>
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                            Selesai
                          </span>
                        </span>
                        <span className="text-sm font-semibold leading-snug text-slate-900">
                          {teamName(match.homeTeamId)}
                          <span className="mx-1.5 font-normal text-slate-400">vs</span>
                          {teamName(match.awayTeamId)}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="rounded-md bg-slate-900 px-2.5 py-1 text-sm font-bold tabular-nums text-white">
                            {homeScore} – {awayScore}
                          </span>
                          <span className="text-xs text-slate-400">Klik untuk statistik</span>
                        </span>
                      </a>
                    );
                  })}
                </div>
              </Section>
            ) : null}

            {distinctRoundLabels.length && selectedManageableEvent ? (
              <Section title={t("roundConfigTitle")} description={t("roundConfigDesc")} className="rounded-xl shadow-none">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
                        <SubmitButton className={quietButton}>
                          <SlidersHorizontal className="h-4 w-4" />
                          {t("saveRoundConfig")}
                        </SubmitButton>
                      </form>
                    );
                  })}
                </div>
              </Section>
            ) : null}
          </div>

          <div className="grid auto-rows-min gap-6">
            <Section title={t("selectedMatchTitle")} description={t("selectedMatchDescription")} className="rounded-xl shadow-none">
              {selectedMatch ? (
                <div className="grid gap-5">
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        {selectedMatch.roundLabel}{selectedMatch.slot ? ` · Match ${selectedMatch.slot}` : ""}
                      </p>
                    </div>
                    <div className="px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-base font-semibold text-slate-900">
                          {teamName(selectedMatch.homeTeamId)}
                          <span className="mx-2 font-normal text-slate-400">vs</span>
                          {teamName(selectedMatch.awayTeamId)}
                        </p>
                        <StatusChip tone={selectedMatch.status === "Completed" ? "success" : "warning"}>
                          {selectedMatch.status === "Completed" ? `${selectedMatch.homeScore} – ${selectedMatch.awayScore}` : `BO${selectedMatchBestOf}`}
                        </StatusChip>
                      </div>
                    </div>
                  </div>

                  {selectedMatch.status !== "Completed" && (
                    selectedMatchBestOf === 1 ? (
                      <form action={adminUpdateMatchResultAction} className="grid gap-4">
                        <input type="hidden" name="eventId" value={selectedManageableEvent?.event.id} />
                        <input type="hidden" name="matchEventId" value={selectedManageableEvent?.event.id} />
                        <input type="hidden" name="matchId" value={selectedMatch.id} />
                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className={labelClass}>
                            {teamName(selectedMatch.homeTeamId)} (Home)
                            <input className={`${inputClass} text-center text-lg font-semibold`} name="homeScore" type="number" min="0" defaultValue="0" />
                          </label>
                          <label className={labelClass}>
                            {teamName(selectedMatch.awayTeamId)} (Away)
                            <input className={`${inputClass} text-center text-lg font-semibold`} name="awayScore" type="number" min="0" defaultValue="0" />
                          </label>
                        </div>
                        <SubmitButton className={primaryButton}>
                          <Save className="h-4 w-4" />
                          {t("saveResult")}
                        </SubmitButton>
                      </form>
                    ) : (
                      <form action={adminSetMatchGamesAction} className="grid gap-4">
                        <input type="hidden" name="matchId" value={selectedMatch.id} />
                        <input type="hidden" name="matchEventId" value={selectedManageableEvent?.event.id} />
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
                        <SubmitButton className={primaryButton}>
                          <Save className="h-4 w-4" />
                          {t("saveGames")}
                        </SubmitButton>
                      </form>
                    )
                  )}

                  <a
                    href={`?phase=run&activeEventId=${activeEvent?.id ?? ""}&matchEventId=${selectedManageableEvent?.event.id ?? ""}`}
                    className="text-sm font-medium text-slate-400 hover:text-slate-600"
                  >
                    {t("cancelAction")}
                  </a>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center">
                  <p className="text-sm text-slate-400">{t("selectMatch")}</p>
                </div>
              )}
              {selectedMatchRosterAndStats?.match.status === "Completed" && (completedMatchItem?.event ?? activeEvent) ? (
                <PlayerStatsSection
                  eventId={(completedMatchItem?.event ?? activeEvent)!.id}
                  gameModeId={(completedMatchItem?.event ?? activeEvent)!.gameModeId}
                  gameId={(completedMatchItem?.event ?? activeEvent)!.gameId}
                  matchId={selectedMatchRosterAndStats.match.id}
                  homePlayers={selectedMatchRosterAndStats.homePlayers}
                  awayPlayers={selectedMatchRosterAndStats.awayPlayers}
                  homeTeamId={selectedMatchRosterAndStats.match.homeTeamId}
                  awayTeamId={selectedMatchRosterAndStats.match.awayTeamId}
                  homeTeamName={teamName(selectedMatchRosterAndStats.match.homeTeamId)}
                  awayTeamName={teamName(selectedMatchRosterAndStats.match.awayTeamId)}
                  existingStats={selectedMatchRosterAndStats.existingStats}
                />
              ) : null}
            </Section>
          </div>
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
                        <SubmitButton className={primaryButton}>
                          <Check className="h-4 w-4" />
                          {t("approve")}
                        </SubmitButton>
                      </form>
                      <form action={adminRejectStatAction} className="flex flex-wrap gap-2">
                        <input type="hidden" name="submissionId" value={submission.id} />
                        <input className={inputClass} name="rejectionNote" placeholder={t("rejectionNote")} />
                        <SubmitButton className={quietButton}>
                          <X className="h-4 w-4" />
                          {t("reject")}
                        </SubmitButton>
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
                        <SubmitButton className={quietButton}>
                          <ImageUp className="h-4 w-4" />
                          {t("upload")}
                        </SubmitButton>
                      </div>
                    </form>
                    <form action={adminSetAccentColorAction} className="flex flex-wrap items-end gap-3">
                      <input type="hidden" name="eventId" value={event.id} />
                      <label className={labelClass}>
                        {t("accentColor")}
                        <input type="color" name="accentColor" defaultValue={event.accentColor ?? "#2563eb"} className="h-10 w-16 cursor-pointer rounded-lg border border-slate-200 bg-white p-1" />
                      </label>
                      <SubmitButton className={quietButton}>
                        <Palette className="h-4 w-4" />
                        {t("saveColor")}
                      </SubmitButton>
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

type PlayerInfo = { id: string; displayName: string; nickname: string };

function PlayerStatsSection({
  eventId,
  gameModeId,
  gameId,
  matchId,
  homePlayers,
  awayPlayers,
  homeTeamId,
  awayTeamId,
  homeTeamName,
  awayTeamName,
  existingStats,
}: {
  eventId: string;
  gameModeId: string;
  gameId: string;
  matchId: string;
  homePlayers: PlayerInfo[];
  awayPlayers: PlayerInfo[];
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  existingStats: Record<string, Record<string, number>>;
}) {
  const statKeys = getStatKeysForMode(gameModeId, gameId);
  const hasHomePlayers = homePlayers.length > 0;
  const hasAwayPlayers = awayPlayers.length > 0;

  if (!statKeys.length || (!hasHomePlayers && !hasAwayPlayers)) return null;

  const statColWidth = statKeys.length <= 3 ? "5rem" : "4rem";
  const gridCols = `grid-cols-[minmax(8rem,1fr)_repeat(${statKeys.length},${statColWidth})]`;

  function TeamStatForm({ teamId, teamName, players }: { teamId: string; teamName: string; players: PlayerInfo[] }) {
    return (
      <form action={adminSaveMatchPlayerStatsAction} className="grid gap-0">
        <input type="hidden" name="matchId" value={matchId} />
        <input type="hidden" name="teamId" value={teamId} />
        <input type="hidden" name="eventId" value={eventId} />

        <div className="mb-3 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-cyan-400" />
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{teamName}</p>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className={`grid gap-0 border-b border-slate-100 bg-slate-50 px-3 py-2 ${gridCols}`}>
            <p className="text-xs font-semibold text-slate-400">Pemain</p>
            {statKeys.map((key) => (
              <p key={key} className="text-center text-xs font-bold capitalize text-slate-500">{key}</p>
            ))}
          </div>

          {players.map((player, i) => (
            <div
              key={player.id}
              className={`grid items-center gap-0 px-3 py-2 ${gridCols} ${i < players.length - 1 ? "border-b border-slate-100" : ""}`}
            >
              <p className="truncate pr-2 text-sm font-medium text-slate-800">{player.nickname}</p>
              {statKeys.map((key) => (
                <input
                  key={key}
                  className="mx-0.5 w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 text-center text-sm font-semibold text-slate-900 outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-2 focus:ring-cyan-100"
                  name={`stat_${player.id}_${key}`}
                  type="number"
                  min="0"
                  max="9999"
                  defaultValue={existingStats[player.id]?.[key] ?? 0}
                />
              ))}
            </div>
          ))}
        </div>

        <SubmitButton className={`${primaryButton} mt-3`}>
          <Save className="h-4 w-4" />
          Simpan Statistik {teamName}
        </SubmitButton>
      </form>
    );
  }

  return (
    <div className="grid gap-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-3">
        <p className="text-sm font-bold text-slate-700">Statistik Pemain</p>
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-500">
          {statKeys.join(" · ")}
        </span>
      </div>
      {hasHomePlayers ? (
        <TeamStatForm teamId={homeTeamId} teamName={homeTeamName} players={homePlayers} />
      ) : null}
      {hasHomePlayers && hasAwayPlayers ? <hr className="border-slate-200" /> : null}
      {hasAwayPlayers ? (
        <TeamStatForm teamId={awayTeamId} teamName={awayTeamName} players={awayPlayers} />
      ) : null}
    </div>
  );
}
