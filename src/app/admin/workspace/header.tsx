// Admin workspace header, phase rail, feedback banner and overview.
// Moved out of admin-workspace.tsx without changes (refactor Phase 4, 4a-admin).

import { adminPhases, buildAdminPhaseHref } from "@/app/admin/admin-flow";
import type { AdminPhase } from "@/app/admin/admin-flow";
import { StatusChip, inputClass, labelClass, phaseIcons, quietButton } from "@/app/admin/workspace/shared";
import type { AdminTranslator, EventItem, TeamItem } from "@/app/admin/workspace/shared";
import { SubmitButton } from "@/components/submit-button";
import { DataTable, Pill, Section, StatCard } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { getMatchesForEvent } from "@/lib/bracket/repository";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getGameForEvent } from "@/lib/platform/settings-repository";
import { RefreshCw } from "lucide-react";

export function AdminHeader({
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

export function HeaderMetric({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

export const SUCCESS_MESSAGES: Record<string, string> = {
  "teams-imported": "Tim berhasil diimpor",
  "registration-preview-ready": "Preview registrasi siap direview",
  "registration-imported": "Registrasi terpilih berhasil diimpor",
  "event-status-updated": "Status event berhasil diperbarui",
  "captain-assigned": "Kapten berhasil ditugaskan",
  "team-deleted": "Tim berhasil dihapus",
  "event-archived": "Event berhasil diarsipkan",
  "user-deactivated": "Pengguna berhasil dinonaktifkan",
};

export function ActionFeedback({ count, error, success }: { count?: string; error?: string; success?: string }) {
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

export function AdminPhaseRail({
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

export function OperationsOverview({
  activeEditRevisions,
  activeEvent,
  activeLeaderboardCount,
  activeMatches,
  allTeamsByEvent,
  events,
  teamCountsByEvent,
  t,
}: {
  activeEditRevisions: Record<string, { id: string; revision: number }>;
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
        columns={[t("eventLabel"), t("gameLabel"), t("statusLabel"), t("formatLabel"), t("teamsLabel"), t("matchesLabel"), "Aksi"]}
        rows={events.map((event) => [
          event.name,
          getGameForEvent(event).name,
          <Pill key={`${event.id}-status`} tone={event.status === "Ongoing" ? "live" : "default"}>
            {event.status}
          </Pill>,
          event.format,
          allTeamsByEvent.get(event.id)?.length ?? teamCountsByEvent.get(event.id) ?? 0,
          activeEvent?.id === event.id ? activeMatches.length : 0,
          <div className="flex flex-wrap gap-2" key={`${event.id}-actions`}>
            <Link className={quietButton} href={isFeatureEnabled("organizer_master_shell_v3") && isFeatureEnabled("organizer_workspace_v3") ? `/organizer/events/${encodeURIComponent(event.id)}/overview` : event.status === "Draft" ? `/admin/events/${event.id}/overview` : event.status === "Published" || event.status === "Registration Closed" ? `/admin/events/${event.id}/edit` : `/admin/events/${event.id}/overview`}>
              {isFeatureEnabled("organizer_master_shell_v3") && isFeatureEnabled("organizer_workspace_v3") ? t("openEventWorkspace") : event.status === "Draft" ? "Lanjutkan setup" : event.status === "Published" || event.status === "Registration Closed" ? (activeEditRevisions[event.id] ? "Lanjutkan revisi" : "Edit event") : "Buka workspace"}
            </Link>
            {event.status !== "Draft" && <Link className="inline-flex items-center text-xs font-semibold text-cyan-700" href={`/events/${event.slug}`}>Lihat publik</Link>}
          </div>,
        ])}
      />
    </Section>
  );
}
