import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import type { CompetitionGraph } from "@/lib/tournament/competition/types";
import type { StoredSchedule } from "@/lib/tournament/operations/state";
import { publicOngoingEnabled, projectPublicOngoingMatches } from "./public-ongoing";
import { createFeaturedTrace } from "./public-home-trace";
import { projectPublicHomeFeaturedEvent, projectPublicV3AuthoritativeMatch, projectPublicV3Identity, readPublicV3Event } from "./public-v3-read";
import type { PublicHomeFeaturedEvent } from "./public-v3-types";

const HOME_ROW_LIMIT = 500;
const HOME_IN_FLIGHT_LIMIT = 64;
const HOME_IN_FLIGHT_KEY_LIMIT = 200;
const GRAPH_KINDS = new Set(["single_elimination", "double_elimination", "round_robin", "group_playoffs"]);
const inFlightOngoing = new Map<string, Promise<PublicHomeFeaturedEvent | null>>();

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Validate every stored graph field dereferenced by the shared homepage projections. */
function isHomeProjectionGraph(value: unknown, eventId: string): value is CompetitionGraph {
  if (!record(value) || value.eventId !== eventId || !record(value.config) || !GRAPH_KINDS.has(value.config.kind as string)
    || !Array.isArray(value.matches) || !Array.isArray(value.groups) || !Array.isArray(value.phases)) return false;
  return value.matches.every((match: unknown) => record(match) && typeof match.id === "string"
    && ["pending", "bye", "empty"].includes(match.status as string) && typeof match.phaseId === "string"
    && (match.groupId === null || typeof match.groupId === "string") && Number.isFinite(match.round)
    && typeof match.bracket === "string" && Number.isFinite(match.bestOf))
    && value.groups.every((group: unknown) => record(group) && typeof group.id === "string" && Number.isFinite(group.sequence))
    && value.phases.every((phase: unknown) => record(phase) && typeof phase.id === "string" && typeof phase.kind === "string");
}

/** Read only homepage-visible authoritative ongoing data; other lifecycles retain the full reader. */
export async function readPublicHomeFeaturedEvent(slug: string, now?: Date): Promise<PublicHomeFeaturedEvent | null> {
  const readNow = now ?? new Date();
  const trace = createFeaturedTrace();
  trace.mark("reader_start");
  const fallback = async () => {
    trace.mark("fallback_start");
    const full = await readPublicV3Event(slug, null, readNow);
    trace.mark("fallback_done");
    if (!full) return null;
    trace.mark("projection_start");
    const projected = projectPublicHomeFeaturedEvent(full);
    trace.mark("projection_done");
    return projected;
  };
  try {
    if (!publicOngoingEnabled()) {
      const result = await fallback();
      trace.mark("reader_done");
      return result;
    }

    const readOngoing = async (): Promise<PublicHomeFeaturedEvent | null> => {
      trace.mark("transaction_start");
      const ongoing = await prisma.$transaction(async (tx): Promise<PublicHomeFeaturedEvent | null> => {
        trace.mark("transaction_enter");
        const done = <T,>(value: T): T => { trace.mark("callback_done"); return value; };
        trace.mark("event_read_start");
        const event = await tx.event.findFirst({
          relationLoadStrategy: "join",
          where: { slug, status: "Ongoing" },
          include: {
            competitionPhases: { where: { sequence: 1, status: "active" }, select: { configuration: true }, take: 1 },
            matches: { orderBy: [{ round: "asc" }, { slot: "asc" }, { id: "asc" }], select: {
              id: true, homeTeamId: true, awayTeamId: true, status: true, scheduleStatus: true,
              scheduledLabel: true, homeScore: true, awayScore: true, resultVersion: true, resultConfirmedAt: true,
            }, take: HOME_ROW_LIMIT + 1 },
            teams: { select: { id: true, name: true }, take: HOME_ROW_LIMIT + 1 },
          },
        });
        trace.mark("event_read_done");
        if (!event || event.status !== "Ongoing" || event.matches.length > HOME_ROW_LIMIT || event.teams.length > HOME_ROW_LIMIT) return done(null);
        const graph = (event.competitionPhases[0]?.configuration as { graph?: unknown } | null)?.graph;
        if (!isHomeProjectionGraph(graph, event.id)) return done(null);

        if (event.publishedScheduleVersion != null) trace.mark("revision_read_start");
        const revision = event.publishedScheduleVersion == null ? null : await tx.scheduleRevision.findFirst({
          where: { eventId: event.id, version: event.publishedScheduleVersion, status: "published" },
        });
        if (event.publishedScheduleVersion != null) trace.mark("revision_read_done");
        trace.mark("projection_start");
        const snapshot = revision?.status === "published" && revision.version === event.publishedScheduleVersion
          ? revision.snapshot as unknown as StoredSchedule
          : undefined;
        const matches = projectPublicOngoingMatches(graph, event.matches, event.teams, snapshot);
        const toPublic = (rows: typeof matches) => rows.map(projectPublicV3AuthoritativeMatch);
        const identity = projectPublicV3Identity({ ...event, format: graph.config.kind }, "ongoing", "authoritative", event.teams.length);
        const result = {
          source: "authoritative", mode: "ongoing", identity,
          organizer: identity.organizer, facts: identity.facts, statusExplanation: identity.statusExplanation,
          statusExplanationKey: identity.statusExplanationKey, cta: identity.cta, navigation: identity.navigation,
          teams: event.teams,
          liveMatches: toPublic(matches.filter((match) => match.status === "live")),
          nextMatches: toPublic(matches.filter((match) => match.status !== "live" && match.status !== "completed")),
          recentResults: toPublic(matches.filter((match) => match.resultVersion > 0)
            .sort((a, b) => (b.confirmedAt ?? "").localeCompare(a.confirmedAt ?? "") || a.id.localeCompare(b.id)).slice(0, 12)),
        } as const;
        trace.mark("projection_done");
        return done(result);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
      trace.mark("transaction_done");
      return ongoing;
    };

    let ongoingPromise: Promise<PublicHomeFeaturedEvent | null> | undefined;
    let shared = false;
    if (now === undefined && slug.length <= HOME_IN_FLIGHT_KEY_LIMIT) {
      ongoingPromise = inFlightOngoing.get(slug);
      if (ongoingPromise) shared = true;
      else if (inFlightOngoing.size < HOME_IN_FLIGHT_LIMIT) {
        const operation = readOngoing();
        const owned: Promise<PublicHomeFeaturedEvent | null> = operation.then(
          (value) => { if (inFlightOngoing.get(slug) === owned) inFlightOngoing.delete(slug); return value; },
          (error) => { if (inFlightOngoing.get(slug) === owned) inFlightOngoing.delete(slug); throw error; },
        );
        inFlightOngoing.set(slug, owned);
        ongoingPromise = owned;
        shared = true;
      }
    }
    const ongoing = await (ongoingPromise ?? readOngoing());
    const result = ongoing ?? await fallback();
    trace.mark("reader_done");
    return shared && ongoing ? structuredClone(result) : result;
  } catch (error) {
    throw trace.fail(error);
  }
}
