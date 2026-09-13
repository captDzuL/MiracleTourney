import type { CompletionAwardStatistic } from "./readiness";
import { tournamentFormatConfigSchema, type TournamentFormatConfig } from "@/lib/tournament/formats/types";
import { deriveAwardCandidates } from "./awards";
import { evaluateCompletionReadiness, type CompletionBlocker } from "./readiness";
import {
  loadPrismaCompletionWorkspaceData,
  type PrismaCompletionWorkspaceData,
} from "./prisma-adapter";

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
    readonly history: readonly {
      readonly action: "completed" | "reopened";
      readonly actorLabel: string;
      readonly at: string;
      readonly summary: string;
    }[];
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

export interface CompletionWorkspaceDependencies {
  load(eventId: string): Promise<PrismaCompletionWorkspaceData>;
}

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

const awardName = (award: CompletionAwardStatistic, locale: "id" | "en") => ({
  mvp: "MVP",
  top_scorer: locale === "id" ? "Top Scorer" : "Top Scorer",
  top_defender: locale === "id" ? "Top Defender" : "Top Defender",
  top_assist: locale === "id" ? "Top Assist" : "Top Assist",
})[award];

function workspaceBlocker(
  blocker: CompletionBlocker,
  eventId: string,
  locale: "id" | "en",
): CompletionWorkspaceBlocker {
  const eventRoot = `/${locale}/organizer/events/${eventId}`;
  switch (blocker.code) {
    case "UNOFFICIAL_REQUIRED_RESULT":
      return { code: blocker.code, subject: `${blocker.stage} · ${blocker.matchId}`, repairHref: `${eventRoot}/matches/${encodeURIComponent(blocker.matchId)}` };
    case "ACTIVE_DISPUTE":
      return { code: blocker.code, subject: `${blocker.disputeId}${blocker.matchId ? ` · ${blocker.matchId}` : ""}`, repairHref: blocker.matchId
        ? `${eventRoot}/matches/${encodeURIComponent(blocker.matchId)}`
        : `${eventRoot}/competition` };
    case "UNRESOLVED_FINAL_TIE":
      return { code: blocker.code, subject: blocker.teamIds.join(", "), repairHref: `${eventRoot}/competition` };
    case "MISSING_VALIDATED_AWARD_STATISTICS":
      return { code: blocker.code, subject: awardName(blocker.award, locale), repairHref: `${eventRoot}/legacy-match-day` };
    case "INSUFFICIENT_PODIUM_STRUCTURE": {
      const details = [...blocker.missingStages ?? [], ...blocker.matchIds ?? [], ...blocker.teamIds ?? []];
      return { code: blocker.code, subject: details.join(", ") || (locale === "id" ? "Struktur podium" : "Podium structure"), repairHref: `${eventRoot}/competition` };
    }
  }
}

function snapshotVersion(value: unknown): number | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  const version = (value as { version?: unknown }).version;
  return Number.isSafeInteger(version) && Number(version) >= 0 ? Number(version) : null;
}

function auditVersion(details: unknown): number | null {
  if (!details || Array.isArray(details) || typeof details !== "object") return null;
  const nested = (details as { result?: unknown }).result;
  return snapshotVersion(nested) ?? snapshotVersion(details);
}

const auditAction = (action: string): "completed" | "reopened" | null =>
  action === "completed" || action === "reopened" ? action : null;

function integrationState(event: CompletionWorkspaceEvent, locale: "id" | "en"): CompletionWorkspaceIntegrationState {
  return {
    status: "integration_required",
    event: {
      id: event.id,
      name: event.name,
      formatLabel: formatLabel(undefined, locale),
      matchDayHref: `/${locale}/organizer/events/${event.id}/competition`,
    },
    version: null,
    blockers: null,
    podium: { sourceKind: "integration_pending", sourceLabel: null, locked: null, placements: null },
    awards: AWARDS.map((award) => ({
      award,
      metricLabel: null,
      candidates: null,
      selectedPlayerId: null,
      decisionReason: null,
      tied: null,
    })),
    certificates: { generated: null, total: null, status: "integration_pending", studioHref: null },
    publication: { status: "integration_pending", previewHref: null },
    audit: { lastAction: null, actorLabel: null, at: null, summary: null },
  };
}

function lockedCandidates(value: unknown): CompletionAwardCandidateSummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || Array.isArray(candidate) || typeof candidate !== "object") return [];
    const row = candidate as Record<string, unknown>;
    if (typeof row.playerId !== "string" || !row.playerId
      || typeof row.playerName !== "string" || !row.playerName.trim()
      || typeof row.teamName !== "string" || !row.teamName.trim()
      || typeof row.value !== "number" || !Number.isFinite(row.value) || row.value < 0) return [];
    return [{
      playerId: row.playerId,
      playerName: row.playerName,
      teamName: row.teamName,
      valueLabel: String(row.value),
    }];
  });
}

export async function loadCompletionWorkspace(
  event: CompletionWorkspaceEvent,
  locale: "id" | "en",
  dependencies: CompletionWorkspaceDependencies = { load: loadPrismaCompletionWorkspaceData },
): Promise<CompletionWorkspaceState> {
  if (!tournamentFormatConfigSchema.safeParse(event.formatConfig).success) {
    return integrationState(event, locale);
  }
  const record = await dependencies.load(event.id);
  const readiness = evaluateCompletionReadiness(record.source.facts);
  const liveCandidates = deriveAwardCandidates(record.source.statistics);
  const completionVersion = snapshotVersion(record.completion?.sourceSnapshot);
  const completionStatus = record.completion?.status;
  const status = completionStatus === "completed"
    ? "completed"
    : completionStatus === "reopened"
      ? "reopened"
      : readiness.ready
        ? "ready"
        : "blocked";
  const teamNames = new Map(record.source.teams.map(({ id, name }) => [id, name]));
  const persistedPlacements = record.completion?.podiumPlacements
    .filter((row): row is typeof row & { rank: 1 | 2 | 3 } => row.rank === 1 || row.rank === 2 || row.rank === 3)
    .map(({ rank, teamId, teamName }) => ({ rank, teamId, teamName })) ?? [];
  const currentTeamIds = readiness.podium
    ? [readiness.podium.championTeamId, readiness.podium.runnerUpTeamId, readiness.podium.thirdPlaceTeamId]
    : [];
  const currentPlacements = currentTeamIds.flatMap((teamId, index) => {
    const teamName = teamNames.get(teamId);
    return teamName ? [{ rank: (index + 1) as 1 | 2 | 3, teamId, teamName }] : [];
  });
  const persistedAwards = new Map(record.completion?.awards.map((award) => [award.type, award]) ?? []);
  const currentCertificates = completionVersion === null || !record.completion
    ? []
    : record.certificates.filter((certificate) =>
      certificate.completionId === record.completion?.id
      && certificate.completionVersion === completionVersion
      && ["ready", "published"].includes(certificate.status));
  const latestCertificates = [...currentCertificates]
    .sort((left, right) => left.version - right.version || left.id.localeCompare(right.id))
    .reduce((latest, certificate) => latest.set(certificate.type, certificate), new Map<string, typeof currentCertificates[number]>());
  const generatedTypes = latestCertificates.size;
  const anyGenerating = record.certificates.some((certificate) =>
    certificate.completionId === record.completion?.id
    && certificate.completionVersion === completionVersion
    && certificate.status === "generating");
  const hasOldCertificates = record.certificates.some((certificate) =>
    certificate.completionId === record.completion?.id
    && certificate.completionVersion !== completionVersion);
  const certificateStatus = generatedTypes === 7
    ? "ready"
    : anyGenerating
      ? "generating"
      : hasOldCertificates
        ? "stale"
        : "not_generated";
  const publicationCertificateIds = Array.isArray(record.publication?.certificateIds)
    && record.publication.certificateIds.every((id): id is string => typeof id === "string")
    ? new Set(record.publication.certificateIds)
    : null;
  const latestCertificateIds = new Set([...latestCertificates.values()].map(({ id }) => id));
  const published = Boolean(record.publication && completionVersion !== null
    && record.publication.completionVersion === completionVersion
    && generatedTypes === 7
    && publicationCertificateIds?.size === 7
    && [...latestCertificateIds].every((id) => publicationCertificateIds.has(id)));
  const publicationStatus = published
    ? "published"
    : record.publication
      ? "needs_review"
      : generatedTypes === 7
        ? "ready"
        : generatedTypes > 0 || hasOldCertificates
          ? "needs_review"
          : "draft";
  const auditHistory = record.audit.flatMap((entry) => {
    const action = auditAction(entry.action);
    if (!action) return [];
    const version = auditVersion(entry.details);
    return [{
      action,
      actorLabel: entry.actorLabel,
      at: entry.createdAt.toISOString(),
      summary: locale === "id"
        ? `${action === "completed" ? "Turnamen diselesaikan" : "Turnamen dibuka kembali"}${version === null ? "" : ` · versi ${version}`}.`
        : `${action === "completed" ? "Tournament completed" : "Tournament reopened"}${version === null ? "" : ` · version ${version}`}.`,
    }];
  });
  const lastAudit = auditHistory[0] ?? null;
  return {
    status,
    event: {
      id: event.id,
      name: event.name,
      formatLabel: formatLabel(event.formatConfig?.kind, locale),
      matchDayHref: `/${locale}/organizer/events/${event.id}/competition`,
    },
    version: record.version,
    blockers: readiness.blockers.map((blocker) => workspaceBlocker(blocker, event.id, locale)),
    podium: {
      sourceKind: record.source.facts.formatKind === "round_robin" ? "locked_standings" : "official_playoff",
      sourceLabel: record.source.facts.formatKind === "round_robin"
        ? locale === "id" ? "Klasemen terkunci" : "Locked standings"
        : locale === "id" ? "Hasil playoff resmi" : "Official playoff results",
      locked: status === "completed",
      placements: status === "completed" && persistedPlacements.length === 3 ? persistedPlacements : currentPlacements,
    },
    awards: AWARDS.map((award) => {
      const persisted = persistedAwards.get(award);
      const rows = status === "completed"
        ? lockedCandidates(persisted?.candidateSnapshot)
        : liveCandidates[award].map((candidate) => ({
            playerId: candidate.playerId,
            playerName: candidate.playerName,
            teamName: candidate.teamName,
            valueLabel: String(candidate.value),
          }));
      const decision = persisted?.decision;
      return {
        award,
        metricLabel: {
          mvp: locale === "id" ? "Nilai MVP" : "MVP score",
          top_scorer: locale === "id" ? "Skor/Gol/Kill" : "Score/Goal/Kill",
          top_defender: locale === "id" ? "Kontribusi bertahan" : "Defensive contribution",
          top_assist: locale === "id" ? "Assist" : "Assists",
        }[award],
        candidates: rows,
        selectedPlayerId: decision?.recipientId ?? null,
        decisionReason: decision?.reason ?? null,
        tied: rows.length > 1,
      };
    }),
    certificates: {
      generated: generatedTypes,
      total: 7,
      status: certificateStatus,
      studioHref: `/${locale}/organizer/events/${event.id}/certificates`,
    },
    publication: {
      status: publicationStatus,
      previewHref: `/${locale}/organizer/events/${event.id}/certificates`,
    },
    audit: {
      lastAction: lastAudit?.action ?? "none",
      actorLabel: lastAudit?.actorLabel ?? null,
      at: lastAudit?.at ?? null,
      summary: lastAudit?.summary ?? (locale === "id" ? "Belum ada tindakan penyelesaian." : "No completion action yet."),
      history: auditHistory,
    },
  };
}
