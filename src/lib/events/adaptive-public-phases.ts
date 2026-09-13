import { prisma } from "@/lib/platform/db";
import type { CompetitionGraph } from "@/lib/tournament/competition";
import { competitionProjection, type Standing } from "@/lib/tournament/operations/result-projection";
import type { StoredSchedule } from "@/lib/tournament/operations/state";

export type AdaptivePhaseNavigation = {
  overview: boolean;
  participants: boolean;
  schedule: boolean;
  bracket: boolean;
  leaderboard: boolean;
};

export type AdaptivePhaseMatch = {
  id: string;
  roundLabel: string;
  home: string | null;
  away: string | null;
  status: "scheduled" | "live" | "completed";
  homeScore: number | null;
  awayScore: number | null;
  start: string | null;
  room: string | null;
  bestOf: number;
};

export type AdaptivePhaseShared = {
  event: {
    id: string;
    slug: string;
    name: string;
    description: string;
    timezone: string;
    format: string;
  };
  organizer: { name: string; verified: boolean };
  facts: {
    startsAt: string;
    venue: string;
    prize: string | null;
    participants: number;
    participantCap: number;
  };
  statusExplanation: string;
  cta: { label: string; href: string };
  navigation: AdaptivePhaseNavigation;
};

export type AdaptivePhaseStanding = {
  phaseId: string;
  groupId: string | null;
  rows: Array<Standing & { name: string }>;
};

export type PublicDrawingEventViewModel = AdaptivePhaseShared & {
  mode: "drawing";
  drawing: {
    published: true;
    seeds: { teamId: string; teamName: string; seed: number }[];
  };
  matches: AdaptivePhaseMatch[];
  schedule: { version: number; publishedAt: string | null } | null;
  standings: AdaptivePhaseStanding[];
};

export type IndividualAwardType = "mvp" | "top_scorer" | "top_defender" | "top_assist";

export type PublicFinishedEventViewModel = AdaptivePhaseShared & {
  mode: "finished";
  podium: { rank: number; teamId: string; teamName: string }[];
  awards: {
    type: IndividualAwardType;
    recipientId: string;
    recipientName: string;
    teamId: string;
    teamName: string;
    reason: string | null;
    certificate: { publishedUrl: string; verificationCode: string } | null;
  }[];
  matches: AdaptivePhaseMatch[];
  standings: AdaptivePhaseStanding[];
};

export type PublicCompetitionPhaseVisibility = "none" | "private" | "public";

export async function getPublicCompetitionPhaseVisibility(eventId: string): Promise<PublicCompetitionPhaseVisibility> {
  const phase = await prisma.competitionPhase.findFirst({
    where: { eventId, sequence: 1 },
    select: { status: true },
  });
  if (!phase) return "none";
  return phase.status === "active" || phase.status === "completed" ? "public" : "private";
}

type EventRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  timezone: string;
  format: string;
  startsAt: string;
  eventStartsAt: Date | null;
  venue: string;
  venueAddress: string | null;
  prizePoolLabel: string | null;
  participantCap: number;
  organizerName: string | null;
  organizerVerified: boolean;
  publishedScheduleVersion: number | null;
};

function shared(
  event: EventRow,
  graph: CompetitionGraph,
  teamCount: number,
  mode: "drawing" | "finished",
): AdaptivePhaseShared {
  const bracket = graph.config.kind !== "round_robin";
  return {
    event: {
      id: event.id,
      slug: event.slug,
      name: event.name,
      description: event.description,
      timezone: event.timezone,
      format: graph.config.kind,
    },
    organizer: {
      name: event.organizerName ?? "Miracle Organizer",
      verified: event.organizerVerified,
    },
    facts: {
      startsAt: event.eventStartsAt?.toISOString() ?? event.startsAt,
      venue: event.venueAddress ?? event.venue,
      prize: event.prizePoolLabel,
      participants: teamCount,
      participantCap: event.participantCap,
    },
    statusExplanation: mode === "drawing"
      ? "Drawing resmi telah diterbitkan organizer. Slot babak berikutnya tetap TBD sampai hasil resmi tersedia."
      : "Turnamen selesai. Podium, penghargaan individual, dan hasil di bawah adalah keputusan resmi organizer.",
    cta: {
      label: mode === "drawing" ? "Lihat bracket" : "Leaderboard akhir",
      href: `/events/${event.slug}/${mode === "drawing" && bracket ? "bracket" : "leaderboards"}`,
    },
    navigation: {
      overview: true,
      participants: true,
      schedule: true,
      bracket,
      leaderboard: true,
    },
  };
}

function phaseGraph(configuration: unknown, eventId: string): {
  graph: CompetitionGraph;
  drawingTeams: { id: string; seed: number }[];
} | null {
  if (!configuration || typeof configuration !== "object" || Array.isArray(configuration)) return null;
  const value = configuration as {
    graph?: CompetitionGraph;
    drawing?: { teams?: { id: string; seed: number }[] };
  };
  if (!value.graph || value.graph.eventId !== eventId) return null;
  const drawingTeams = Array.isArray(value.drawing?.teams) ? value.drawing!.teams! : [];
  return { graph: value.graph, drawingTeams };
}

function projectPublicContext(
  graph: CompetitionGraph,
  rows: Array<{
    id: string;
    status: string;
    homeTeamId: string;
    awayTeamId: string;
    homeScore: number;
    awayScore: number;
    resultVersion: number;
    scheduledAt: Date | null;
    scheduleRoom: string | null;
  }>,
  teams: { id: string; name: string }[],
): { matches: AdaptivePhaseMatch[]; standings: AdaptivePhaseStanding[] } {
  const names = new Map(teams.map((team) => [team.id, team.name]));
  const byId = new Map(rows.map((row) => [row.id, row]));
  const matches = graph.matches
    .filter((match) => match.status === "pending")
    .map((match) => {
      const row = byId.get(match.id);
      const homeId = row?.homeTeamId || (match.home.kind === "team" ? match.home.teamId : "");
      const awayId = row?.awayTeamId || (match.away.kind === "team" ? match.away.teamId : "");
      const official = Boolean(row?.resultVersion);
      return {
        id: match.id,
        roundLabel: `${match.bracket.replaceAll("_", " ")} · R${match.round}`,
        home: homeId ? names.get(homeId) ?? homeId : null,
        away: awayId ? names.get(awayId) ?? awayId : null,
        status: official ? "completed" as const : row?.status === "Live" ? "live" as const : "scheduled" as const,
        homeScore: official ? row!.homeScore : null,
        awayScore: official ? row!.awayScore : null,
        start: row?.scheduledAt?.toISOString() ?? null,
        room: row?.scheduleRoom ?? null,
        bestOf: match.bestOf,
      };
    });
  const projection = competitionProjection(graph, rows as never);
  const standings = projection.standings.map((table) => ({
    phaseId: table.phaseId,
    groupId: table.groupId,
    rows: table.rows.map((row) => ({ ...row, name: names.get(row.teamId) ?? row.teamId })),
  }));
  return { matches, standings };
}

export async function getPublicDrawingEvent(slug: string): Promise<PublicDrawingEventViewModel | null> {
  const event = await prisma.event.findFirst({
    where: { slug, status: { in: ["Published", "Registration Closed"] } },
  });
  if (!event) return null;
  const phase = await prisma.competitionPhase.findFirst({
    where: { eventId: event.id, sequence: 1, status: "active" },
  });
  const parsed = phaseGraph(phase?.configuration, event.id);
  if (!parsed) return null;
  const [matches, teams, schedule] = await Promise.all([
    prisma.match.findMany({ where: { eventId: event.id }, orderBy: [{ round: "asc" }, { slot: "asc" }, { id: "asc" }] }),
    prisma.team.findMany({ where: { eventId: event.id }, select: { id: true, name: true } }),
    event.publishedScheduleVersion == null
      ? Promise.resolve(null)
      : prisma.scheduleRevision.findFirst({
          where: { eventId: event.id, version: event.publishedScheduleVersion, status: "published" },
        }),
  ]);
  const names = new Map(teams.map((team) => [team.id, team.name]));
  const context = projectPublicContext(parsed.graph, matches, teams);
  return {
    mode: "drawing",
    ...shared(event, parsed.graph, teams.length, "drawing"),
    drawing: {
      published: true,
      seeds: parsed.drawingTeams
        .slice()
        .sort((left, right) => left.seed - right.seed)
        .map((team) => ({ teamId: team.id, teamName: names.get(team.id) ?? team.id, seed: team.seed })),
    },
    ...context,
    schedule: schedule ? {
      version: schedule.version,
      publishedAt: schedule.publishedAt?.toISOString() ?? null,
    } : null,
  };
}

const AWARD_ORDER: IndividualAwardType[] = ["mvp", "top_scorer", "top_defender", "top_assist"];
const COMPLETE_CERTIFICATE_COUNT = 7;

function completionSnapshotVersion(value: unknown): number | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  const version = (value as { version?: unknown }).version;
  return Number.isSafeInteger(version) && Number(version) >= 0 ? Number(version) : null;
}

export async function getPublicFinishedEvent(slug: string): Promise<PublicFinishedEventViewModel | null> {
  const event = await prisma.event.findFirst({ where: { slug, status: "Finished" } });
  if (!event) return null;
  const [completion, phase, matches, teams, publication] = await Promise.all([
    prisma.tournamentCompletion.findUnique({
      where: { eventId: event.id },
      include: {
        podiumPlacements: { orderBy: { rank: "asc" } },
        awards: { include: { decision: true } },
      },
    }),
    prisma.competitionPhase.findFirst({
      where: { eventId: event.id, sequence: 1, status: { in: ["active", "completed"] } },
    }),
    prisma.match.findMany({ where: { eventId: event.id }, orderBy: [{ round: "asc" }, { slot: "asc" }, { id: "asc" }] }),
    prisma.team.findMany({ where: { eventId: event.id }, select: { id: true, name: true } }),
    prisma.certificatePublication.findFirst({ where: { eventId: event.id }, orderBy: { version: "desc" } }),
  ]);
  const parsed = phaseGraph(phase?.configuration, event.id);
  if (!completion || completion.status !== "completed" || !parsed) return null;
  const certificateIds = Array.isArray(publication?.certificateIds)
    ? publication.certificateIds.filter((id): id is string => typeof id === "string")
    : [];
  const completionVersion = completionSnapshotVersion(completion.sourceSnapshot);
  const publicationIsCurrent = completionVersion !== null
    && publication?.completionId === completion.id
    && publication.completionVersion === completionVersion
    && new Set(certificateIds).size === COMPLETE_CERTIFICATE_COUNT;
  const certificates = publicationIsCurrent
    ? await prisma.certificate.findMany({
        where: { id: { in: certificateIds }, status: { in: ["ready", "published"] }, publishedUrl: { not: null } },
        select: {
          id: true,
          type: true,
          publishedUrl: true,
          verificationCode: true,
          status: true,
          completionId: true,
          completionVersion: true,
        },
      })
    : [];
  const completePublication = publicationIsCurrent
    && certificates.length === COMPLETE_CERTIFICATE_COUNT
    && certificates.every((certificate) =>
      certificate.completionId === completion.id
      && certificate.completionVersion === completionVersion);
  const publishedCertificateIds = completePublication ? new Set(certificateIds) : new Set<string>();
  const certificateByType = new Map(
    (completePublication ? certificates : [])
      .filter((certificate) => publishedCertificateIds.has(certificate.id))
      .map((certificate) => [certificate.type, certificate]),
  );
  const awards = AWARD_ORDER.flatMap((type) => {
    const award = completion.awards.find((candidate) =>
      candidate.type === type && candidate.status === "approved" && candidate.decision);
    if (!award?.decision) return [];
    const certificate = certificateByType.get(type);
    return [{
      type,
      recipientId: award.decision.recipientId,
      recipientName: award.decision.recipientName,
      teamId: award.decision.teamId,
      teamName: award.decision.teamName,
      reason: award.decision.reason ?? null,
      certificate: certificate?.publishedUrl ? {
        publishedUrl: certificate.publishedUrl,
        verificationCode: certificate.verificationCode,
      } : null,
    }];
  });
  return {
    mode: "finished",
    ...shared(event, parsed.graph, teams.length, "finished"),
    podium: completion.podiumPlacements.map((placement) => ({
      rank: placement.rank,
      teamId: placement.teamId,
      teamName: placement.teamName,
    })),
    awards,
    ...projectPublicContext(parsed.graph, matches, teams),
  };
}

export function publishedScheduleSnapshot(value: unknown): StoredSchedule | null {
  return value && typeof value === "object" ? value as StoredSchedule : null;
}
