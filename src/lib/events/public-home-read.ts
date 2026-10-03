import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import type { CompetitionGraph } from "@/lib/tournament/competition/types";
import type { StoredSchedule } from "@/lib/tournament/operations/state";
import { publicOngoingEnabled, projectPublicOngoingMatches } from "./public-ongoing";
import { projectPublicHomeFeaturedEvent, projectPublicV3AuthoritativeMatch, projectPublicV3Identity, readPublicV3Event } from "./public-v3-read";
import type { PublicHomeFeaturedEvent } from "./public-v3-types";

const HOME_ROW_LIMIT = 500;

/** Read only homepage-visible authoritative ongoing data; other lifecycles retain the full reader. */
export async function readPublicHomeFeaturedEvent(slug: string, now = new Date()): Promise<PublicHomeFeaturedEvent | null> {
  const fallback = async () => {
    const full = await readPublicV3Event(slug, null, now);
    return full ? projectPublicHomeFeaturedEvent(full) : null;
  };
  if (!publicOngoingEnabled()) return fallback();

  const ongoing = await prisma.$transaction(async (tx): Promise<PublicHomeFeaturedEvent | null> => {
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
    if (!event || event.status !== "Ongoing" || event.matches.length > HOME_ROW_LIMIT || event.teams.length > HOME_ROW_LIMIT) return null;
    const graph = (event.competitionPhases[0]?.configuration as { graph?: CompetitionGraph } | null)?.graph;
    if (!graph || graph.eventId !== event.id || !Array.isArray(graph.matches) || !Array.isArray(graph.groups) || !Array.isArray(graph.phases)) return null;

    const revision = event.publishedScheduleVersion == null ? null : await tx.scheduleRevision.findFirst({
      where: { eventId: event.id, version: event.publishedScheduleVersion, status: "published" },
    });
    const snapshot = revision?.status === "published" && revision.version === event.publishedScheduleVersion
      ? revision.snapshot as unknown as StoredSchedule
      : undefined;
    const matches = projectPublicOngoingMatches(graph, event.matches, event.teams, snapshot);
    const toPublic = (rows: typeof matches) => rows.map(projectPublicV3AuthoritativeMatch);
    const identity = projectPublicV3Identity({ ...event, format: graph.config.kind }, "ongoing", "authoritative", event.teams.length);
    return {
      source: "authoritative", mode: "ongoing", identity,
      organizer: identity.organizer, facts: identity.facts, statusExplanation: identity.statusExplanation,
      statusExplanationKey: identity.statusExplanationKey, cta: identity.cta, navigation: identity.navigation,
      teams: event.teams,
      liveMatches: toPublic(matches.filter((match) => match.status === "live")),
      nextMatches: toPublic(matches.filter((match) => match.status !== "live" && match.status !== "completed")),
      recentResults: toPublic(matches.filter((match) => match.resultVersion > 0)
        .sort((a, b) => (b.confirmedAt ?? "").localeCompare(a.confirmedAt ?? "") || a.id.localeCompare(b.id)).slice(0, 12)),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

  return ongoing ?? fallback();
}
