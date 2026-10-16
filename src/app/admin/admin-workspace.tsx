import { getTranslations } from "next-intl/server";
import { redirectToActiveLocale } from "@/i18n/redirect";
import { getActiveEventEditRevisionIds } from "@/lib/events/event-revision";
import { HydrationGate } from "@/components/HydrationGate";
import { requireAnyRole } from "@/lib/auth/session";
import { getBracketManageableMatchesForEvent, getLeaderboardForEvent, getMatchesForEvent } from "@/lib/bracket/repository";
import { getEventRoundConfigs, getMatchGames } from "@/lib/bracket/rounds-repository";
import { getCertificatesForEvents } from "@/lib/certificate/repository";
import { getEventBySlug, getManageableEventsForUser } from "@/lib/events/repository";
import { listEventVisualAssets } from "@/lib/events/visual-repository";
import { getCaptainUsersForAdmin, getOrganizerUsers } from "@/lib/identity/repository";
import { getImportedTeams, getRegistrationImportBatchForAdmin, getRegistrationImportBatchesForEvent } from "@/lib/imports/repository";
import { getGameModes, getPaymentSettings } from "@/lib/platform/settings-repository";
import { getMatchWithRosterAndStats, getPendingStatSubmissionCount, getPendingStatSubmissions } from "@/lib/player-stats/write-repository";
import { getPaymentRegistrationRequestsForAdmin } from "@/lib/registration/repository";
import { getTeamCountsForEvents, getTeamsForEvents } from "@/lib/teams/repository";
import { RegistrationControlCenterShell } from "@/components/registration/RegistrationControlCenterShell";
import { RegistrationQueue } from "@/components/registration/RegistrationQueue";
import { getStatKeysForMode } from "@/lib/platform/config";
import type { EventVisualAsset } from "@/lib/platform/types";
import { getMatchStatRecordings } from "@/lib/platform/stat-recording-repository";
import { mapRequestStatus, normalizeRegistrationSource, type RegistrationRecord, type RegistrationSource, type RegistrationStatus } from "@/lib/registration/records";
import type { MatchStatRecording } from "@/lib/platform/stat-recording";

import { type AdminWorkspaceScope, canUseAdminWorkspace, resolveAdminPhase } from "./admin-flow";
import type { AdminSearchParams, CaptainUser, CertificateItem, EventItem, MatchItem, PaymentRequestItem, PaymentSettingsItem, PendingSubmissionItem, RegistrationImportBatchSummaryItem } from "@/app/admin/workspace/shared";
import { ActionFeedback, AdminHeader, AdminPhaseRail, OperationsOverview } from "@/app/admin/workspace/header";
import { PrepareEventPhase } from "@/app/admin/workspace/prepare-event-phase";
import { ImportRegistrationPhase } from "@/app/admin/workspace/import-registration-phase";
import { PaymentWorkspacePhase } from "@/app/admin/workspace/payment-workspace-phase";
import { RunMatchDayPhase } from "@/app/admin/workspace/run-match-day-phase";
import { ReviewPublishPhase } from "@/app/admin/workspace/review-publish-phase";

export const dynamic = "force-dynamic";

/**
 * Certificate rendering launches a headless Chromium and, on a cold start, downloads and inflates
 * a ~70 MB browser pack. Server actions inherit the invoking route's config, so this ceiling
 * covers both saving a Final result and the manual regenerate button.
 * 60s is the maximum on the Vercel Hobby plan.
 */
export const maxDuration = 60;

export default async function AdminPage({
  searchParams,
  workspaceScope = "admin",
  locale,
}: {
  searchParams?: Promise<AdminSearchParams>;
  workspaceScope?: AdminWorkspaceScope;
  locale?: "id" | "en";
}) {
  const user = await requireAnyRole(["platform_admin", "organizer", "admin"]);
  if (!user) {
    return redirectToActiveLocale("/login");
  }
  if (!canUseAdminWorkspace(user.role, workspaceScope)) {
    return redirectToActiveLocale("/organizer");
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
  const actor = { id: user.id, role: user.role as "platform_admin" | "admin" | "organizer" };
  const [teamCountsByEvent, featuredEventFromSlug, activeEditRevisions] = await Promise.all([
    getTeamCountsForEvents(eventIds),
    getEventBySlug("kuroko-summer-cup"),
    getActiveEventEditRevisionIds({ eventIds, actor }),
  ]);
  const featuredEvent =
    (featuredEventFromSlug && events.some((event) => event.id === featuredEventFromSlug.id) ? featuredEventFromSlug : null)
    ?? events[0];
  const activeEvent =
    events.find((event) => event.id === resolvedSearchParams?.activeEventId)
    ?? featuredEvent
    ?? events[0];

  const needsAllTeams = activePhase === "prepare" || activePhase === "registration";
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

  const [importedTeamsRaw, captainUsers, registrationBatches, registrationBatch] = await Promise.all([
    activePhase === "registration" ? getImportedTeams(user) : Promise.resolve([]),
    activePhase === "registration" || activePhase === "prepare" ? getCaptainUsersForAdmin(user) : Promise.resolve([] as CaptainUser[]),
    activePhase === "registration" && activeEvent ? getRegistrationImportBatchesForEvent(user, activeEvent.id) : Promise.resolve([] as RegistrationImportBatchSummaryItem[]),
    activePhase === "registration" && resolvedSearchParams?.registrationBatchId
      ? getRegistrationImportBatchForAdmin(user, resolvedSearchParams.registrationBatchId)
      : Promise.resolve(null),
  ]);

  // Visual revisions are only rendered inside the prepare phase, so they are
  // loaded lazily to keep the other phases at their current query count.
  const visualAssetsByEvent = activePhase === "prepare"
    ? new Map(
        await Promise.all(
          events.map(async (event) =>
            [event.id, await listEventVisualAssets(user, event.id)] as const,
          ),
        ),
      )
    : new Map<string, EventVisualAsset[]>();

  const importedTeamsWithEvents = importedTeamsRaw.filter(
    (team): team is (typeof importedTeamsRaw)[number] & { eventId: string } => Boolean(team.eventId),
  );
  const importedTeams = importedTeamsWithEvents
    .map((team) => ({
      ...team,
      eventName: events.find((event) => event.id === team.eventId)?.name ?? "Unknown event",
    }))
    .reverse();
  const importedEventIds = new Set(importedTeamsWithEvents.map((team) => team.eventId));

  const selectedMatchId = resolvedSearchParams?.matchId;

  // Completed matches for the currently active event only.
  // Filtered by activeEvent so "Hasil & Statistik" stays scoped to what the admin is working on.
  const completedMatchesWithEvent: { match: MatchItem; event: EventItem }[] = activePhase === "run" && activeEvent
    ? activeMatches
        .filter((m) => m.status === "Completed")
        .map((match) => ({ match, event: activeEvent }))
    : [];

  const completedMatchItem = selectedMatchId
    ? completedMatchesWithEvent.find((item) => item.match.id === selectedMatchId)
    : undefined;

  const authorizedMatchId = selectedMatchId && (completedMatchItem || manageableMatches.some((match) => match.id === selectedMatchId))
    ? selectedMatchId : undefined;
  const [roundConfigs, selectedMatchGames, selectedMatchRosterAndStats, matchStatRecordings] = await Promise.all([
    activePhase === "run" && selectedManageableEvent ? getEventRoundConfigs(selectedManageableEvent.event.id) : Promise.resolve([]),
    activePhase === "run" && authorizedMatchId ? getMatchGames(authorizedMatchId) : Promise.resolve([]),
    activePhase === "run" && authorizedMatchId ? getMatchWithRosterAndStats(authorizedMatchId) : Promise.resolve(null),
    activePhase === "run" && activeEvent
      ? getMatchStatRecordings(activeEvent.id, completedMatchesWithEvent.map(({ match }) => match), getStatKeysForMode(activeEvent.gameModeId, activeEvent.gameId))
      : Promise.resolve(new Map<string, MatchStatRecording>()),
  ]);
  const roundConfigMap = new Map(roundConfigs.map((config) => [config.roundLabel, config.bestOf]));
  const selectedMatch = selectedMatchId
    ? (manageableMatches.find((match) => match.id === selectedMatchId) ?? completedMatchItem?.match)
    : undefined;
  const selectedMatchBestOf = selectedMatch ? (roundConfigMap.get(selectedMatch.roundLabel) ?? 1) : 1;

  const [certificatesByEvent, pendingSubmissions] = activePhase === "review"
    ? await Promise.all([getCertificatesForEvents(eventIds), getPendingStatSubmissions(user)])
    : [new Map(eventIds.map((eventId) => [eventId, null as CertificateItem])), [] as PendingSubmissionItem[]];

  const paymentStatus = ["pending_payment", "pending_review", "approved", "rejected", "expired"].includes(resolvedSearchParams?.paymentStatus ?? "")
    ? resolvedSearchParams?.paymentStatus as PaymentRequestItem["status"]
    : undefined;
  const [paymentRequests, paymentSettings] = activePhase === "registration"
    ? await Promise.all([
        getPaymentRegistrationRequestsForAdmin(user, { eventId: resolvedSearchParams?.activeEventId, status: paymentStatus }),
        getPaymentSettings(),
      ])
    : [[] as PaymentRequestItem[], { id: "global" } as PaymentSettingsItem];

  const registrationStatuses: RegistrationStatus[] = ["pending_payment", "pending_review", "accepted", "rejected", "draft", "needs_correction"];
  const importSourceByTeamId = new Map(
    registrationBatches.flatMap((batch) => batch.items
      .filter((item): item is typeof item & { teamId: string } => Boolean(item.teamId))
      .map((item) => [item.teamId, batch.sourceKind] as const)),
  );

  const registrationSources: RegistrationSource[] = ["captain_registration", "import_xlsx", "import_csv", "unknown_import"];
  const registrationStatus = registrationStatuses.find((value) => value === resolvedSearchParams?.registrationStatus);
  const registrationSource = registrationSources.find((value) => value === resolvedSearchParams?.registrationSource);
  const registrationRecords: RegistrationRecord[] = activeEvent ? [
    ...(allTeamsByEvent.get(activeEvent.id) ?? []).map((team) => ({
      id: team.id,
      eventId: activeEvent.id,
      teamId: team.id,
      teamName: team.name,
      teamTag: team.tag,
      captainName: team.captainName ?? team.captain?.name ?? "Captain",
      ...(team.captainContact ? { captainContact: team.captainContact } : {}),
      ...(team.captainIgn ? { captainIgn: team.captainIgn } : {}),
      ...(team.captainUid ? { captainUid: team.captainUid } : {}),
      captainIsPlayer: team.captainIsPlayer ?? true,
      rosterCount: 0,
      source: normalizeRegistrationSource(team.source, importSourceByTeamId.get(team.id)),
      status: "accepted" as const,
      createdAt: "1970-01-01T00:00:00.000Z",
      origin: "Team",
    })),
    ...paymentRequests.filter((request) => request.status !== "approved").map((request) => ({
      id: request.id, eventId: request.eventId, ...(request.teamId ? { teamId: request.teamId } : {}), teamName: request.teamName, teamTag: request.teamTag,
      captainName: request.captain?.name ?? "Captain", captainIsPlayer: true, rosterCount: 0, source: "captain_registration" as const,
      status: mapRequestStatus(request.status), createdAt: request.createdAt, origin: "TeamRegistrationRequest",
    })),
  ] : [];

  const currentQuery = {
    activeEventId: activeEvent?.id,
    matchEventId: selectedManageableEvent?.event.id,
    matchId: selectedMatch?.id,
  };

  return (
    <HydrationGate className="space-y-6">
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
              visualAssetsByEvent={visualAssetsByEvent}
            />
          ) : null}

          {activePhase === "registration" ? (
            <RegistrationControlCenterShell
              event={activeEvent}
              rosterLabel={activeEvent ? `${gameModes.find((mode) => mode.id === activeEvent.gameModeId)?.teamSize ?? "-"} pemain inti` : undefined}
              registeredTeams={activeEvent ? (allTeamsByEvent.get(activeEvent.id)?.length ?? 0) : 0}
              pendingReviewCount={paymentRequests.filter((request) => request.status === "pending_review").length}
              importErrorCount={((registrationBatch?.summary ?? {}) as { error?: number }).error ?? 0}
              importPanel={null}
              paymentPanel={null}
            />
          ) : null}
          {activePhase === "registration" && activeEvent ? (
            <RegistrationQueue
              eventId={activeEvent.id}
              records={registrationRecords}
              status={registrationStatus}
              source={registrationSource}
              query={resolvedSearchParams?.registrationQuery}
              page={Number(resolvedSearchParams?.registrationPage) || 1}
            />
          ) : null}
          {activePhase === "registration" ? (
            <ImportRegistrationPhase
              activeEvent={activeEvent}
              captainUsers={captainUsers}
              events={events}
              importedEventIds={importedEventIds}
              importedTeams={importedTeams}
              registrationBatch={registrationBatch}
              registrationBatches={registrationBatches}
              t={t}
            />
          ) : null}

          {activePhase === "registration" ? (
            <PaymentWorkspacePhase
              activeEvent={activeEvent}
              events={events}
              paymentRequests={paymentRequests}
              paymentSettings={paymentSettings}
              canEditPaymentSettings={user.role !== "organizer"}
              paymentStatus={paymentStatus}
              t={t}
            />
          ) : null}

          {activePhase === "run" ? (
            <RunMatchDayPhase
              activeEvent={activeEvent}
              completedMatchesWithEvent={completedMatchesWithEvent}
              matchStatRecordings={matchStatRecordings}
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
              locale={locale}
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
            activeEditRevisions={activeEditRevisions}
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
    </HydrationGate>
  );
}

