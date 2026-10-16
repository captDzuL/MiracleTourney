// Types, class names and small components shared by the admin workspace phases.
// Moved out of admin-workspace.tsx without changes (refactor Phase 4, 4a-admin).

import type { AdminPhase } from "@/app/admin/admin-flow";
import { getBracketManageableMatchesForEvent } from "@/lib/bracket/repository";
import { getEventRoundConfigs, getMatchGames } from "@/lib/bracket/rounds-repository";
import { getCertificatesForEvents } from "@/lib/certificate/repository";
import { getManageableEventsForUser } from "@/lib/events/repository";
import { getOrganizerUsers } from "@/lib/identity/repository";
import { getImportedTeams, getRegistrationImportBatchForAdmin, getRegistrationImportBatchesForEvent } from "@/lib/imports/repository";
import { getGameModes, getPaymentSettings } from "@/lib/platform/settings-repository";
import { getPendingStatSubmissions } from "@/lib/player-stats/write-repository";
import { getPaymentRegistrationRequestsForAdmin } from "@/lib/registration/repository";
import { getTeamsForEvents } from "@/lib/teams/repository";
import { BadgeCheck, CalendarPlus, FileSpreadsheet, Radio } from "lucide-react";
import { getTranslations } from "next-intl/server";

export type AdminSearchParams = {
  activeEventId?: string;
  success?: string;
  error?: string;
  count?: string;
  registrationStatus?: string;
  registrationSource?: string;
  registrationQuery?: string;
  registrationPage?: string;
  phase?: string;
  matchEventId?: string;
  matchId?: string;
  registrationBatchId?: string;
  paymentStatus?: string;
};

export type EventItem = Awaited<ReturnType<typeof getManageableEventsForUser>>[number];

export type GameModeItem = ReturnType<typeof getGameModes>[number];

export type OrganizerItem = Awaited<ReturnType<typeof getOrganizerUsers>>[number];

export type TeamItem = Awaited<ReturnType<typeof getTeamsForEvents>> extends Map<string, infer T> ? T extends Array<infer U> ? U : never : never;

export type ImportedTeamItem = Awaited<ReturnType<typeof getImportedTeams>>[number] & { eventName: string };

export type RegistrationImportBatchItem = NonNullable<Awaited<ReturnType<typeof getRegistrationImportBatchForAdmin>>>;

export type RegistrationImportBatchSummaryItem = Awaited<ReturnType<typeof getRegistrationImportBatchesForEvent>>[number];

export type ManageableEventItem = {
  event: EventItem;
  manageableMatches: Awaited<ReturnType<typeof getBracketManageableMatchesForEvent>>;
};

export type MatchItem = ManageableEventItem["manageableMatches"][number];

export type RoundConfigItem = Awaited<ReturnType<typeof getEventRoundConfigs>>[number];

export type MatchGameItem = Awaited<ReturnType<typeof getMatchGames>>[number];

export type PendingSubmissionItem = Awaited<ReturnType<typeof getPendingStatSubmissions>>[number];

export type CertificateItem = Awaited<ReturnType<typeof getCertificatesForEvents>> extends Map<string, infer T> ? T : never;

export type PaymentRequestItem = Awaited<ReturnType<typeof getPaymentRegistrationRequestsForAdmin>>[number];

export type PaymentSettingsItem = Awaited<ReturnType<typeof getPaymentSettings>>;

export type AdminTranslator = Awaited<ReturnType<typeof getTranslations>>;

export type CaptainUser = { id: string; name: string; email: string };

export const phaseIcons = {
  prepare: CalendarPlus,
  registration: FileSpreadsheet,
  run: Radio,
  review: BadgeCheck,
} satisfies Record<AdminPhase, React.ComponentType<{ className?: string }>>;

export const inputClass = "w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100";

export const labelClass = "grid min-w-0 gap-2 text-sm font-medium text-slate-700";

export const quietButton = "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400";

export const primaryButton = "inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-400 px-3.5 py-2.5 text-sm font-semibold text-cyan-950 shadow-sm transition hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400";

export const matchDeskCardGridClass = "grid gap-3 md:grid-cols-2";

export function MatchupNames({ homeName, awayName, size = "sm" }: { homeName: string; awayName: string; size?: "sm" | "base" }) {
  const textSize = size === "base" ? "text-base" : "text-sm";

  return (
    <span className={`grid min-w-0 gap-1 font-semibold leading-snug text-slate-900 ${textSize}`}>
      <span className="min-w-0 truncate" title={homeName}>{homeName}</span>
      <span className="flex min-w-0 items-baseline gap-1.5">
        <span className="shrink-0 text-xs font-normal uppercase text-slate-400">vs</span>
        <span className="min-w-0 truncate" title={awayName}>{awayName}</span>
      </span>
    </span>
  );
}

export function PhaseSection({
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

export function EventOptions({ events }: { events: EventItem[] }) {
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

export function StatusChip({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "info" | "success" | "warning" | "danger" }) {
  const toneClass = {
    default: "border-slate-200 bg-slate-50 text-slate-600",
    info: "border-cyan-200 bg-cyan-50 text-cyan-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    danger: "border-rose-200 bg-rose-50 text-rose-800",
  }[tone];

  return (
    <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass}`}>
      {children}
    </span>
  );
}
