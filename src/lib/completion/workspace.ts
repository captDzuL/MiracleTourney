import type { CompletionAwardStatistic } from "./readiness";
import type { TournamentFormatConfig } from "@/lib/tournament/formats/types";

export type CompletionWorkspaceStatus =
  | "integration_required"
  | "blocked"
  | "ready"
  | "completed"
  | "reopened";

export type CompletionWorkspaceBlockerCode =
  | "UNOFFICIAL_REQUIRED_RESULT"
  | "ACTIVE_DISPUTE"
  | "UNRESOLVED_FINAL_TIE"
  | "MISSING_VALIDATED_AWARD_STATISTICS"
  | "INSUFFICIENT_PODIUM_STRUCTURE"
  | "MISSING_AWARD_DECISION"
  | "TIE_REASON_REQUIRED";

export interface CompletionWorkspaceBlocker {
  readonly code: CompletionWorkspaceBlockerCode;
  readonly subject: string;
  readonly repairHref?: string;
  readonly repairTarget?: "awards";
}

export interface CompletionAwardCandidateSummary {
  readonly playerId: string;
  readonly playerName: string;
  readonly teamName: string;
  readonly valueLabel: string;
}

export interface CompletionAwardSummary {
  readonly award: CompletionAwardStatistic;
  readonly metricLabel: string;
  readonly candidates: readonly CompletionAwardCandidateSummary[];
  readonly selectedPlayerId: string | null;
  readonly decisionReason: string | null;
  readonly tied: boolean;
}

interface CompletionWorkspaceIdentity {
  readonly event: {
    readonly id: string;
    readonly name: string;
    readonly formatLabel: string;
    readonly matchDayHref: string;
  };
}

export interface CompletionWorkspaceAvailableBase extends CompletionWorkspaceIdentity {
  readonly version: number;
  readonly blockers: readonly CompletionWorkspaceBlocker[];
  readonly podium: {
    readonly sourceKind: "official_playoff" | "locked_standings";
    readonly sourceLabel: string;
    readonly locked: boolean;
    readonly placements: readonly {
      readonly rank: 1 | 2 | 3;
      readonly teamId: string;
      readonly teamName: string;
    }[];
  };
  readonly awards: readonly CompletionAwardSummary[];
  readonly certificates: {
    readonly generated: number;
    readonly total: number;
    readonly status: "not_generated" | "generating" | "ready" | "stale";
    readonly studioHref: string;
  };
  readonly publication: {
    readonly status: "draft" | "ready" | "published" | "needs_review";
    readonly previewHref: string;
  };
  readonly audit: {
    readonly lastAction: "none" | "completed" | "reopened";
    readonly actorLabel: string | null;
    readonly at: string | null;
    readonly summary: string;
  };
}

export interface CompletionWorkspaceIntegrationState extends CompletionWorkspaceIdentity {
  readonly status: "integration_required";
  readonly version: null;
  readonly blockers: null;
  readonly podium: {
    readonly sourceKind: "integration_pending";
    readonly sourceLabel: null;
    readonly locked: null;
    readonly placements: null;
  };
  readonly awards: readonly {
    readonly award: CompletionAwardStatistic;
    readonly metricLabel: null;
    readonly candidates: null;
    readonly selectedPlayerId: null;
    readonly decisionReason: null;
    readonly tied: null;
  }[];
  readonly certificates: {
    readonly generated: null;
    readonly total: null;
    readonly status: "integration_pending";
    readonly studioHref: null;
  };
  readonly publication: {
    readonly status: "integration_pending";
    readonly previewHref: null;
  };
  readonly audit: {
    readonly lastAction: null;
    readonly actorLabel: null;
    readonly at: null;
    readonly summary: null;
  };
}

export type CompletionWorkspaceState =
  | CompletionWorkspaceIntegrationState
  | (CompletionWorkspaceAvailableBase & { readonly status: "blocked" })
  | (CompletionWorkspaceAvailableBase & { readonly status: "ready" })
  | (CompletionWorkspaceAvailableBase & { readonly status: "completed" })
  | (CompletionWorkspaceAvailableBase & { readonly status: "reopened" });

type CompletionWorkspaceEvent = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly formatConfig: TournamentFormatConfig | null;
};

const AWARDS: readonly CompletionAwardStatistic[] = [
  "mvp",
  "top_scorer",
  "top_defender",
  "top_assist",
];

function formatLabel(kind: string | undefined, locale: "id" | "en"): string {
  const labels = locale === "id"
    ? {
        single_elimination: "Eliminasi Tunggal",
        double_elimination: "Eliminasi Ganda",
        round_robin: "Liga Penuh",
        group_playoffs: "Grup + Playoff",
      }
    : {
        single_elimination: "Single Elimination",
        double_elimination: "Double Elimination",
        round_robin: "Pure League",
        group_playoffs: "Group + Playoffs",
      };
  return labels[kind as keyof typeof labels] ?? (locale === "id" ? "Belum dikonfigurasi" : "Not configured");
}

/**
 * Safe production boundary until Match Day installs its authoritative read adapter.
 * Only event identity already scoped by getManageableEventDraft is exposed here.
 */
export async function loadCompletionWorkspace(
  event: CompletionWorkspaceEvent,
  locale: "id" | "en",
): Promise<CompletionWorkspaceState> {
  return {
    status: "integration_required",
    event: {
      id: event.id,
      name: event.name,
      formatLabel: formatLabel(event.formatConfig?.kind, locale),
      matchDayHref: `/${locale}/organizer/events/${event.id}/matches`,
    },
    version: null,
    blockers: null,
    podium: {
      sourceKind: "integration_pending",
      sourceLabel: null,
      locked: null,
      placements: null,
    },
    awards: AWARDS.map((award) => ({
      award,
      metricLabel: null,
      candidates: null,
      selectedPlayerId: null,
      decisionReason: null,
      tied: null,
    })),
    certificates: {
      generated: null,
      total: null,
      status: "integration_pending",
      studioHref: null,
    },
    publication: {
      status: "integration_pending",
      previewHref: null,
    },
    audit: {
      lastAction: null,
      actorLabel: null,
      at: null,
      summary: null,
    },
  };
}
