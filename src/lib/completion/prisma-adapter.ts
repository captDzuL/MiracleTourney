import { Prisma, type PrismaClient } from "@prisma/client";

import { getStatKeysForMode } from "@/lib/platform/config";
import { prisma } from "@/lib/platform/db";
import { applyEventLifecycleSideEffects } from "@/lib/events/event-lifecycle";
import type { CompetitionGraph } from "@/lib/tournament/competition";
import { tournamentFormatConfigSchema, type TournamentFormatConfig } from "@/lib/tournament/formats/types";
import { competitionProjection } from "@/lib/tournament/operations/result-projection";
import {
  CompletionVersionConflictError,
  type CompletionActor,
  CompletionDependencies,
  CompletionMutation,
  CompletionSource,
  CompletionState,
  CompletionTransaction,
} from "./complete";
import type { CompletionAwardStatistic, CompletionMatchFact } from "./readiness";

type SourceEvent = {
  id: string;
  formatConfig: TournamentFormatConfig;
  gameId: string;
  gameModeId: string;
};
type SourceMatch = {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  winnerTeamId: string | null;
  resultVersion: number;
  status: string;
  scheduleStatus: string;
};
type SourceRevision = {
  id: string;
  matchId: string;
  version: number;
  homeScore: number;
  awayScore: number;
  winnerTeamId: string | null;
};
type SourceIncident = {
  id: string;
  matchId: string | null;
  resolvedAt: Date | null;
};
type SourcePlayerStat = {
  matchId: string;
  playerId: string;
  playerName: string;
  teamId: string;
  source: string | null;
  stats: unknown;
  player: {
    id: string;
    teamId: string;
    eventId: string | null;
    displayName: string;
    nickname: string;
  };
};

export interface CompletionSourceRows {
  readonly event: SourceEvent;
  readonly graph: CompetitionGraph | null;
  readonly matches: SourceMatch[];
  readonly revisions: SourceRevision[];
  readonly incidents: SourceIncident[];
  readonly teams: { id: string; name: string }[];
  readonly playerStats: SourcePlayerStat[];
  readonly approvedSubmissions: { matchId: string; teamId: string }[];
}

export interface PrismaCompletionWorkspaceData {
  readonly version: number;
  readonly source: CompletionSource;
  readonly completion: null | {
    readonly id: string;
    readonly status: string;
    readonly sourceSnapshot: Prisma.JsonValue;
    readonly podiumPlacements: readonly { rank: number; teamId: string; teamName: string }[];
    readonly awards: readonly {
      type: string;
      candidateSnapshot: Prisma.JsonValue;
      decision: null | { recipientId: string; reason: string | null };
    }[];
  };
  readonly certificates: readonly {
    id: string;
    type: string;
    version: number;
    completionId: string | null;
    completionVersion: number | null;
    status: string;
    publishedAt: Date | null;
  }[];
  readonly publication: null | {
    version: number;
    completionVersion: number;
    certificateIds: Prisma.JsonValue;
    publishedAt: Date;
  };
  readonly audit: readonly {
    action: string;
    actorLabel: string;
    createdAt: Date;
    details: Prisma.JsonValue;
  }[];
}

const AWARDS = ["mvp", "top_scorer", "top_defender", "top_assist"] as const;

function isCurrentOfficial(match: SourceMatch, revisions: readonly SourceRevision[]): boolean {
  if (match.resultVersion < 1 || match.status !== "Completed" || match.scheduleStatus !== "completed") return false;
  const latestVersion = revisions
    .filter((row) => row.matchId === match.id)
    .reduce((version, row) => Math.max(version, row.version), 0);
  if (match.resultVersion !== latestVersion) return false;
  const revision = revisions.find((row) => row.matchId === match.id && row.version === latestVersion);
  return Boolean(revision
    && revision.homeScore === match.homeScore
    && revision.awayScore === match.awayScore
    && revision.winnerTeamId === match.winnerTeamId);
}

type CompletionProjection = {
  readonly placements: readonly { rank: number; teamId: string | null }[];
  readonly resolve: (source: CompetitionGraph["placements"][number]["source"]) => string;
};

function eliminationFacts(rows: CompletionSourceRows, projection: CompletionProjection | null): CompletionMatchFact[] {
  const graph = rows.graph;
  if (!graph || !projection) return [];
  const eliminationKind = rows.event.formatConfig.kind === "group_playoffs"
    ? rows.event.formatConfig.playoffs.kind
    : rows.event.formatConfig.kind;
  if (eliminationKind !== "single_elimination" && eliminationKind !== "double_elimination") return [];
  const graphPlacement = (rank: number) => graph.placements.find((placement) => placement.rank === rank);
  const projectedTeam = (rank: number) => projection.placements.find((placement) => placement.rank === rank)?.teamId ?? null;
  const titlePlacements = [graphPlacement(1), graphPlacement(2)];
  const titleSources = titlePlacements.flatMap((placement) => placement?.source.kind === "match" ? [placement.source] : []);
  const titleSource = titleSources[0];
  const titleMatch = titleSource ? rows.matches.find(({ id }) => id === titleSource.matchId) : undefined;
  const facts: CompletionMatchFact[] = [];
  if (titleMatch) {
    facts.push({
      id: titleMatch.id,
      stage: eliminationKind === "double_elimination" ? "grand_final" : "final",
      official: titleSources.length === 2
        && titleSources.every(({ matchId }) => matchId === titleMatch.id)
        && isCurrentOfficial(titleMatch, rows.revisions),
      winnerTeamId: projectedTeam(1),
      loserTeamId: projectedTeam(2),
      revision: titleMatch.resultVersion,
    });
  }

  const thirdPlacement = graphPlacement(3);
  const thirdSource = thirdPlacement?.source;
  if (thirdSource?.kind === "match") {
    const thirdMatch = rows.matches.find(({ id }) => id === thirdSource.matchId);
    if (thirdMatch) {
      const thirdTeamId = projectedTeam(3);
      const oppositeTeamId = projection.resolve({
        ...thirdSource,
        outcome: thirdSource.outcome === "winner" ? "loser" : "winner",
      }) || null;
      facts.push({
        id: thirdMatch.id,
        stage: eliminationKind === "double_elimination" ? "lower_final" : "third_place",
        official: isCurrentOfficial(thirdMatch, rows.revisions),
        winnerTeamId: eliminationKind === "double_elimination" ? oppositeTeamId : thirdTeamId,
        loserTeamId: eliminationKind === "double_elimination" ? thirdTeamId : oppositeTeamId,
        revision: thirdMatch.resultVersion,
      });
    }
  }
  return facts;
}

function statisticMetrics(statKeys: readonly string[]) {
  const first = (candidates: readonly string[]) => candidates.find((key) => statKeys.includes(key));
  const scorer = first(["goals", "goal", "points", "kills"]);
  const assist = first(["assists", "assist"]);
  const preferredDefense = ["defense", "tackles", "blocks", "steals", "rebounds", "defuses"].filter((key) => statKeys.includes(key));
  const defender = preferredDefense.length
    ? preferredDefense
    : [first(["damage", "plants", "gold", "gpm", "passing"])].filter((key): key is string => Boolean(key));
  const mvp = statKeys.filter((key) => key !== "deaths");
  return {
    mvp,
    top_scorer: scorer ? [scorer] : [],
    top_defender: defender,
    top_assist: assist ? [assist] : [],
  } satisfies Record<CompletionAwardStatistic, readonly string[]>;
}

function statistics(rows: CompletionSourceRows, officialMatchIds: ReadonlySet<string>): CompletionSource["statistics"] {
  const configuredKeys = getStatKeysForMode(rows.event.gameModeId, rows.event.gameId);
  const metrics = statisticMetrics(configuredKeys);
  const approved = new Set(rows.approvedSubmissions.map(({ matchId, teamId }) => `${matchId}:${teamId}`));
  const teams = new Map(rows.teams.map((team) => [team.id, team.name]));
  const matches = new Map(rows.matches.map((match) => [match.id, match]));
  const totals = new Map<string, {
    playerId: string;
    playerName: string;
    teamId: string;
    teamName: string;
    values: Record<CompletionAwardStatistic, number>;
    observed: Record<CompletionAwardStatistic, boolean>;
    scoreTotal: number;
    scoreCount: number;
  }>();
  for (const row of rows.playerStats) {
    const match = matches.get(row.matchId);
    const values = row.stats;
    const playerName = row.player.displayName.trim() || row.player.nickname.trim();
    const trusted = row.source === "admin"
      || row.source === "captain" && approved.has(`${row.matchId}:${row.teamId}`);
    if (!trusted || !match || !officialMatchIds.has(row.matchId)
      || row.player.id !== row.playerId || row.player.teamId !== row.teamId
      || row.player.eventId !== rows.event.id || !playerName
      || ![match.homeTeamId, match.awayTeamId].includes(row.teamId)
      || !teams.has(row.teamId) || !values || Array.isArray(values) || typeof values !== "object") continue;
    const record = values as Record<string, unknown>;
    const suppliedConfiguredValues = configuredKeys.filter((key) => Object.hasOwn(record, key)).map((key) => record[key]);
    if (suppliedConfiguredValues.some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0)) continue;
    const suppliedScores = Object.hasOwn(record, "scores");
    const scores = Array.isArray(record.scores)
      ? record.scores.filter((value): value is number => value !== null && typeof value === "number")
      : [];
    const validScores = !suppliedScores || Array.isArray(record.scores) && record.scores.every((value) =>
      value === null
      || typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 10
        && Math.abs(value * 10 - Math.round(value * 10)) < Number.EPSILON * 10,
    );
    if (!validScores) continue;
    const aggregate = totals.get(row.playerId) ?? {
      playerId: row.playerId,
      playerName,
      teamId: row.teamId,
      teamName: teams.get(row.teamId)!,
      values: { mvp: 0, top_scorer: 0, top_defender: 0, top_assist: 0 },
      observed: { mvp: false, top_scorer: false, top_defender: false, top_assist: false },
      scoreTotal: 0,
      scoreCount: 0,
    };
    if (aggregate.teamId !== row.teamId) continue;
    aggregate.scoreTotal += scores.reduce((sum, score) => sum + score, 0);
    aggregate.scoreCount += scores.length;
    for (const award of AWARDS) {
      if (award === "mvp" && scores.length) {
        aggregate.observed.mvp = true;
        continue;
      }
      const keys = metrics[award];
      const observed = keys.filter((key) => typeof record[key] === "number");
      if (!observed.length) continue;
      aggregate.values[award] += observed.reduce((sum, key) => sum + Number(record[key]), 0);
      aggregate.observed[award] = true;
    }
    totals.set(row.playerId, aggregate);
  }
  return [...totals.values()]
    .sort((left, right) => left.playerId.localeCompare(right.playerId))
    .flatMap((row) => AWARDS.flatMap((award) => row.observed[award] ? [{
      award,
      playerId: row.playerId,
      playerName: row.playerName,
      teamId: row.teamId,
      teamName: row.teamName,
      value: award === "mvp" && row.scoreCount
        ? Math.round(row.scoreTotal / row.scoreCount * 10) / 10
        : row.values[award],
      validated: true,
      status: "published" as const,
    }] : []));
}

export function buildCompletionSource(rows: CompletionSourceRows): CompletionSource {
  const officialMatchIds = new Set(rows.matches.filter((match) => isCurrentOfficial(match, rows.revisions)).map(({ id }) => id));
  const projectionMatches = rows.matches.map((match) => officialMatchIds.has(match.id)
    ? match
    : { ...match, resultVersion: 0, status: "Scheduled", scheduleStatus: "estimated" });
  const projection = rows.graph ? competitionProjection(rows.graph, projectionMatches as never) : null;
  const aggregatedStatistics = statistics(rows, officialMatchIds);
  const formatKind = rows.event.formatConfig.kind;
  const standings = formatKind === "round_robin"
    ? projection?.standings
      .filter(({ groupId }) => groupId === null)
      .flatMap((table) => table.rows.map(({ rank, teamId, tied }) => ({
        rank,
        teamId,
        locked: table.complete,
        unresolvedTie: tied,
      }))) ?? []
    : [];
  return {
    facts: {
      formatKind,
      ...(formatKind === "group_playoffs" ? { playoffFormatKind: rows.event.formatConfig.playoffs.kind } : {}),
      matches: eliminationFacts(rows, projection),
      standings,
      activeDisputes: rows.incidents
        .filter(({ resolvedAt }) => resolvedAt === null)
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(({ id, matchId }) => ({ id, ...(matchId ? { matchId } : {}) })),
      validatedAwardStatistics: AWARDS.filter((award) => aggregatedStatistics.some((row) => row.award === award)),
    },
    statistics: aggregatedStatistics,
    teams: rows.teams.map(({ id, name }) => ({ id, name })),
  };
}

export async function loadPrismaCompletionWorkspaceData(eventId: string): Promise<PrismaCompletionWorkspaceData> {
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.findUnique({
      where: { id: eventId },
      select: { id: true, competitionVersion: true, formatConfig: true, gameId: true, gameModeId: true },
    });
    if (!event) throw new Error("Event not found");
    const [completion, certificates, publication, auditRows] = await Promise.all([
      tx.tournamentCompletion.findUnique({
        where: { eventId },
        select: {
          id: true,
          status: true,
          sourceSnapshot: true,
          podiumPlacements: { select: { rank: true, teamId: true, teamName: true }, orderBy: { rank: "asc" } },
          awards: {
            select: {
              type: true,
              candidateSnapshot: true,
              decision: { select: { recipientId: true, reason: true } },
            },
            orderBy: { type: "asc" },
          },
        },
      }),
      tx.certificate.findMany({
        where: { eventId },
        select: { id: true, type: true, version: true, completionId: true, completionVersion: true, status: true, publishedAt: true },
        orderBy: [{ type: "asc" }, { version: "asc" }],
      }),
      tx.certificatePublication.findFirst({
        where: { eventId },
        select: { version: true, completionVersion: true, certificateIds: true, publishedAt: true },
        orderBy: { version: "desc" },
      }),
      tx.completionAuditEntry.findMany({
        where: { completion: { eventId } },
        select: { action: true, actorUserId: true, createdAt: true, details: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 100,
      }),
    ]);
    const actorIds = [...new Set(auditRows.map(({ actorUserId }) => actorUserId))];
    const actors = actorIds.length
      ? await tx.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
      : [];
    const actorNames = new Map(actors.map(({ id, name }) => [id, name || id]));
    return {
      version: event.competitionVersion,
      source: buildCompletionSource(await loadSourceRows(tx, event)),
      completion,
      certificates,
      publication,
      audit: auditRows.map(({ action, actorUserId, createdAt, details }) => ({
        action,
        actorLabel: actorNames.get(actorUserId) ?? actorUserId,
        createdAt,
        details,
      })),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));

async function loadSourceRows(
  tx: Prisma.TransactionClient,
  event: { id: string; formatConfig: Prisma.JsonValue | null; gameId: string; gameModeId: string },
): Promise<CompletionSourceRows> {
  const format = tournamentFormatConfigSchema.safeParse(event.formatConfig);
  if (!format.success) throw new Error("Competition format is unavailable");
  const [phase, matches, revisions, incidents, teams, playerStats, approvedSubmissions] = await Promise.all([
    tx.competitionPhase.findFirst({ where: { eventId: event.id, sequence: 1 }, select: { configuration: true } }),
    tx.match.findMany({ where: { eventId: event.id } }),
    tx.matchResultRevision.findMany({ where: { eventId: event.id }, orderBy: [{ matchId: "asc" }, { version: "desc" }] }),
    tx.competitionIncident.findMany({ where: { eventId: event.id, resolvedAt: null }, select: { id: true, matchId: true, resolvedAt: true } }),
    tx.team.findMany({ where: { eventId: event.id }, select: { id: true, name: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    tx.playerStat.findMany({
      where: { match: { eventId: event.id } },
      select: {
        matchId: true,
        playerId: true,
        playerName: true,
        teamId: true,
        source: true,
        stats: true,
        player: { select: { id: true, teamId: true, eventId: true, displayName: true, nickname: true } },
      },
    }),
    tx.statSubmission.findMany({ where: { eventId: event.id, status: "approved" }, select: { matchId: true, teamId: true } }),
  ]);
  const graph = (phase?.configuration as unknown as { graph?: CompetitionGraph } | null)?.graph ?? null;
  if (graph && graph.eventId !== event.id) throw new Error("Invalid competition state");
  return {
    event: { id: event.id, formatConfig: format.data, gameId: event.gameId, gameModeId: event.gameModeId },
    graph,
    matches: matches.map((row) => ({
      id: row.id,
      homeTeamId: row.homeTeamId,
      awayTeamId: row.awayTeamId,
      homeScore: row.homeScore,
      awayScore: row.awayScore,
      winnerTeamId: row.winnerTeamId,
      resultVersion: row.resultVersion,
      status: row.status,
      scheduleStatus: row.scheduleStatus,
    })),
    revisions,
    incidents,
    teams: teams.map(({ id, name }) => ({ id, name: name || id })),
    playerStats,
    approvedSubmissions,
  };
}

function persistedMutation(row: {
  idempotencyKey: string | null;
  fingerprint: string | null;
  actorUserId: string;
  reason: string | null;
  result: Prisma.JsonValue | null;
  details: Prisma.JsonValue;
}): CompletionMutation | null {
  const details = row.details && !Array.isArray(row.details) && typeof row.details === "object"
    ? row.details as Record<string, unknown>
    : {};
  const actorRole = details.actorRole;
  if (!row.idempotencyKey || !row.fingerprint || !row.result
    || !["organizer", "platform_admin", "admin"].includes(String(actorRole))) return null;
  return {
    idempotencyKey: row.idempotencyKey,
    fingerprint: row.fingerprint,
    actor: { id: row.actorUserId, role: actorRole as CompletionActor["role"] },
    reason: row.reason,
    result: structuredClone(row.result) as unknown as CompletionMutation["result"],
  };
}

async function persistMutation(
  tx: Prisma.TransactionClient,
  eventId: string,
  mutation: CompletionMutation,
): Promise<void> {
  const lifecycleStatus = mutation.result.status === "completed" ? "Finished" : "Ongoing";
  const changed = await tx.event.updateMany({
    where: { id: eventId, competitionVersion: mutation.result.version - 1 },
    data: {
      competitionVersion: { increment: 1 },
      status: lifecycleStatus,
    },
  });
  if (changed.count !== 1) {
    const conflict = new Error("Completion version changed concurrently");
    Object.assign(conflict, { code: "P2034" });
    throw conflict;
  }
  await applyEventLifecycleSideEffects(tx, eventId, lifecycleStatus, new Date());
  const result = mutation.result;
  let completion: { id: string };
  if (result.status === "completed") {
    const snapshot = result.snapshot;
    completion = await tx.tournamentCompletion.upsert({
      where: { eventId },
      create: {
        eventId,
        status: "completed",
        format: snapshot.source.facts.formatKind,
        sourceSnapshot: json(snapshot),
        completedByUserId: mutation.actor.id,
        completedAt: new Date(),
      },
      update: {
        status: "completed",
        format: snapshot.source.facts.formatKind,
        sourceSnapshot: json(snapshot),
        completedByUserId: mutation.actor.id,
        completedAt: new Date(),
        reopenedByUserId: null,
        reopenedAt: null,
        reopenReason: null,
      },
      select: { id: true },
    });
    await tx.podiumPlacement.deleteMany({ where: { completionId: completion.id } });
    await tx.eventAward.deleteMany({ where: { completionId: completion.id } });
    const matchByPlacement = new Map(snapshot.source.facts.matches.map((match) => {
      const rank = match.stage === "final" || match.stage === "grand_final" ? 1 : 3;
      return [rank, match] as const;
    }));
    await tx.podiumPlacement.createMany({
      data: snapshot.podium.map((placement) => {
        const sourceMatch = matchByPlacement.get(placement.rank === 2 ? 1 : placement.rank);
        return {
          completionId: completion.id,
          rank: placement.rank,
          teamId: placement.teamId,
          teamName: placement.teamName,
          source: snapshot.source.facts.formatKind === "round_robin" ? "locked_standings" : "official_playoff",
          sourceMatchId: sourceMatch?.id ?? null,
          sourceSnapshot: json(sourceMatch ?? { rank: placement.rank, teamId: placement.teamId }),
        };
      }),
    });
    for (const award of snapshot.awards) {
      const persistedAward = await tx.eventAward.create({
        data: {
          completionId: completion.id,
          type: award.award,
          status: "approved",
          candidateSnapshot: json(award.candidates),
        },
        select: { id: true },
      });
      await tx.awardDecision.create({
        data: {
          awardId: persistedAward.id,
          recipientKind: "player",
          recipientId: award.recipient.playerId,
          recipientName: award.recipient.playerName,
          teamId: award.recipient.teamId,
          teamName: award.recipient.teamName,
          reason: award.reason,
          decidedByUserId: mutation.actor.id,
        },
      });
    }
  } else {
    const existing = await tx.tournamentCompletion.findUnique({ where: { eventId }, select: { id: true } });
    if (!existing) throw new Error("Completion snapshot not found");
    completion = await tx.tournamentCompletion.update({
      where: { eventId },
      data: {
        status: "reopened",
        reopenedByUserId: mutation.actor.id,
        reopenedAt: new Date(),
        reopenReason: mutation.reason,
      },
      select: { id: true },
    });
  }
  await tx.completionAuditEntry.create({
    data: {
      completionId: completion.id,
      action: result.status,
      actorUserId: mutation.actor.id,
      reason: mutation.reason,
      details: json({ actorRole: mutation.actor.role, fingerprint: mutation.fingerprint, result }),
      idempotencyKey: mutation.idempotencyKey,
      fingerprint: mutation.fingerprint,
      result: json(result),
    },
  });
}

export function createPrismaCompletionDependencies(
  actor: CompletionActor,
  db: PrismaClient = prisma,
): CompletionDependencies {
  return {
    async transaction<T>(eventId: string, work: (tx: CompletionTransaction) => Promise<T>): Promise<T> {
      const transact = () => db.$transaction(async (database) => {
        let event: Awaited<ReturnType<typeof database.event.findUnique>> | null | undefined;
        let completion: Awaited<ReturnType<typeof database.tournamentCompletion.findUnique>> | null | undefined;
        const loadEvent = async () => {
          if (event === undefined) event = await database.event.findUnique({ where: { id: eventId } });
          return event;
        };
        const loadCompletion = async () => {
          if (completion === undefined) completion = await database.tournamentCompletion.findUnique({ where: { eventId } });
          return completion;
        };
        const transaction: CompletionTransaction = {
          authorize: async () => {
            const [row, currentActor] = await Promise.all([
              loadEvent(),
              database.user.findUnique({
                where: { id: actor.id },
                select: { id: true, role: true, deactivatedAt: true, mustChangePassword: true },
              }),
            ]);
            if (!row || !currentActor || currentActor.deactivatedAt
              || currentActor.role !== actor.role
              || !["organizer", "platform_admin", "admin"].includes(currentActor.role)
              || currentActor.role === "organizer" && (currentActor.mustChangePassword || row.organizerUserId !== currentActor.id)) return null;
            return structuredClone(actor);
          },
          loadState: async (): Promise<CompletionState> => {
            const [row, snapshot] = await Promise.all([loadEvent(), loadCompletion()]);
            if (!row) throw new Error("Event not found");
            return { status: snapshot?.status === "completed" ? "completed" : "editable", version: row.competitionVersion };
          },
          loadSource: async () => {
            const row = await loadEvent();
            if (!row) throw new Error("Event not found");
            return buildCompletionSource(await loadSourceRows(database, row));
          },
          findMutation: async (idempotencyKey) => {
            const snapshot = await loadCompletion();
            if (!snapshot) return null;
            const row = await database.completionAuditEntry.findFirst({
              where: { completionId: snapshot.id, idempotencyKey },
            });
            return row ? persistedMutation(row) : null;
          },
          commit: async (mutation) => {
            await persistMutation(database, eventId, mutation);
            event = undefined;
            completion = undefined;
          },
        };
        return work(transaction);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 20000 });
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await transact();
        } catch (error) {
          const code = typeof error === "object" && error !== null && "code" in error
            ? String((error as { code?: unknown }).code)
            : null;
          if ((code === "P2034" || code === "P2002") && attempt < 2) continue;
          if (code === "P2034" || code === "P2002") {
            const current = await db.event.findUnique({
              where: { id: eventId },
              select: { competitionVersion: true },
            });
            if (current) throw new CompletionVersionConflictError(current.competitionVersion);
          }
          throw error;
        }
      }
    },
  };
}
