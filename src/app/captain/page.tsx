import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { redirectToActiveLocale } from "@/i18n/redirect";
import { getCaptainOrTeamOwner } from "@/lib/auth/captain-access";
import { requireRole } from "@/lib/auth/session";
import { getCertificatesForEvents } from "@/lib/certificate/repository";
import { getEventsByIds, getOpenRegistrationEventsForCaptain } from "@/lib/events/repository";
import { hasTempPassword } from "@/lib/identity/repository";
import { getCaptainRegistrationRequests } from "@/lib/registration/repository";
import { getCaptainTeams, getPlayersForTeams } from "@/lib/teams/repository";
import { getRosterChangeOverview } from "@/lib/platform/roster-change-requests";
import { getCaptainPaymentSettings } from "@/lib/registration/captain-repository";
import type { Certificate } from "@/lib/platform/types";
import type { PaymentSettings } from "@/lib/platform/types";
import { Notice } from "@/app/captain/dashboard/shared";
import type { TFn } from "@/app/captain/dashboard/shared";
import { CaptainDashboardTabs } from "@/app/captain/dashboard/dashboard-tabs";
import { RosterManagementSection } from "@/app/captain/dashboard/roster-management-section";
import { OpenRegistrationSection } from "@/app/captain/dashboard/open-registration-section";
import { PaymentRequestsSection } from "@/app/captain/dashboard/payment-requests-section";

export default async function CaptainPage({
  searchParams,
}: {
  searchParams?: Promise<{ edit?: string; confirm?: string; success?: string; error?: string; tab?: string; eventId?: string }>;
}) {
  const user = await getCaptainOrTeamOwner();
  if (!user) {
    // A player who captains no team has nothing to run here.
    return redirectToActiveLocale((await requireRole("player")) ? "/player" : "/login");
  }
  // A player who captains a solo team only manages that team: no registering teams, no reusable draft.
  const ownerOnly = user.role === "player";

  const t = await getTranslations("captain");
  const params = await searchParams;
  const editPlayerId = params?.edit;
  const confirmDeleteId = params?.confirm;
  const success = params?.success;
  const error = params?.error;
  const requestedEventId = params?.eventId && /^[A-Za-z0-9_-]+$/.test(params.eventId) ? params.eventId : undefined;
  const rosterSignals = new Set(["player-added", "player-updated", "player-deleted", "captain-display-updated", "draft-team-saved", "team-logo-updated", "roster-change-requested", "roster-change-cancelled"]);
  const activeTab = ownerOnly || params?.tab === "roster" || editPlayerId || confirmDeleteId || (success && rosterSignals.has(success)) ? "roster" : "registration";

  const [teams, usingTempPassword, openRegistrationEvents, paymentRequests] = await Promise.all([
    getCaptainTeams(user.id),
    hasTempPassword(user.id),
    ownerOnly ? Promise.resolve([]) : getOpenRegistrationEventsForCaptain(user.id),
    ownerOnly ? Promise.resolve([]) : getCaptainRegistrationRequests(user.id),
  ]);
  const paymentEventIds = [...new Set(paymentRequests.map((request) => request.eventId))];
  const paymentSettingsByEvent = new Map<string, PaymentSettings>(
    await Promise.all(
      paymentEventIds.map(async (eventId) => [eventId, await getCaptainPaymentSettings(eventId)] as const),
    ),
  );
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
  const rosterOverviews = new Map(await Promise.all(
    teams
      .filter((team) => team.eventId)
      .map(async (team) => [team.id, await getRosterChangeOverview(user.id, team.id).catch(() => null)] as const),
  ));
  const teamsWithPlayers = teams.map((team) => ({
    team,
    players: allPlayers.filter((player) => player.teamId === team.id),
  }));
  // Only the reusable draft qualifies: "registration-intake" copies also have no event but the server rejects them as a draft.
  const draftTeamWithPlayers = ownerOnly ? null : teamsWithPlayers.find(({ team }) => !team.eventId && team.source === "draft") ?? null;

  const requestedEvent = requestedEventId
    ? openRegistrationEvents.find((event) => event.id === requestedEventId)
      ?? paymentRequests.find((request) => request.eventId === requestedEventId)?.event
      ?? events.find((event) => event.id === requestedEventId)
    : undefined;
  const focusedOpenEvents = requestedEventId
    ? [...openRegistrationEvents].sort((left, right) => Number(right.id === requestedEventId) - Number(left.id === requestedEventId))
    : openRegistrationEvents;
  const focusedPaymentRequests = requestedEventId
    ? [...paymentRequests].sort((left, right) => Number(right.eventId === requestedEventId) - Number(left.eventId === requestedEventId))
    : paymentRequests;
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
          <Link href={(ownerOnly ? "/player/settings" : "/captain/settings") as never} className="font-semibold underline hover:text-amber-900">
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
      {success === "draft-team-saved" ? <Notice tone="success">{t("draftTeamSaved")}</Notice> : null}
      {success === "team-logo-updated" ? <Notice tone="success">{t("teamLogoUpdated")}</Notice> : null}
      {success === "captain-display-updated" ? <Notice tone="success">Tampilan kapten berhasil diperbarui.</Notice> : null}
      {success === "roster-change-requested" ? <Notice tone="success">{t("rosterChange.requestedNotice")}</Notice> : null}
      {success === "roster-change-cancelled" ? <Notice tone="success">{t("rosterChange.cancelledNotice")}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}

      {requestedEvent ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">
          <Link href={`/events/${requestedEvent.slug}`} className="font-semibold underline underline-offset-4">
            ← {requestedEvent.name}
          </Link>
          <span className="text-cyan-700">·</span>
          <span data-testid="registration-flow-event-name" className="font-medium">{requestedEvent.name}</span>
        </div>
      ) : null}
      {ownerOnly ? null : <CaptainDashboardTabs activeTab={activeTab} t={t as TFn} />}

      {activeTab === "registration" ? (
        <div className="grid gap-6">
          <OpenRegistrationSection
            events={focusedOpenEvents}
            draftTeam={draftTeamWithPlayers?.team ?? null}
            draftPlayerCount={draftTeamWithPlayers?.players.length ?? 0}
            t={t as TFn}
          />
          <PaymentRequestsSection requests={focusedPaymentRequests} paymentSettingsByEvent={paymentSettingsByEvent} t={t as TFn} />
        </div>
      ) : (
        <RosterManagementSection
          teamsWithPlayers={teamsWithPlayers}
          draftTeamWithPlayers={draftTeamWithPlayers}
          events={events}
          certificates={certificates}
          rosterOverviews={rosterOverviews}
          editPlayerId={editPlayerId}
          confirmDeleteId={confirmDeleteId}
          canDraft={!ownerOnly}
          t={t as TFn}
        />
      )}
    </div>
  );
}


