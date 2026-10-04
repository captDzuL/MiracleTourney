import { getSessionUser } from "@/lib/auth/session";
import { authorizeWorkspaceResource, type WorkspaceActor } from "@/lib/security/authorization";
import { getBracketAppearance } from "./appearance";
import { buildGraphSocialBracket, buildLegacySocialBracket } from "./model";
import type { SocialBracketModel } from "./types";
import { prisma } from "@/lib/platform/db";
import {
  getBracketPreview, getEventRoundConfigs, getMatchGamesForEvent, getMatchesForEvent,
  getPublicEventBySlug, getPublicVisibleBracketPreview, getTeamsForEvent,
} from "@/lib/platform/repository";
import type { CompetitionGraph } from "@/lib/tournament/competition/types";

type Locale = "id" | "en";
type EventCore = SocialBracketModel["event"];
function eventCore(event: { id: string; slug: string; name: string; logoUrl?: string | null; format: string; status: string }): EventCore {
  return { id: event.id, slug: event.slug, name: event.name, logoUrl: event.logoUrl ?? null, format: event.format, status: event.status };
}
function graphFrom(configuration: unknown, eventId: string): CompetitionGraph | null {
  if (!configuration || typeof configuration !== "object" || Array.isArray(configuration)) return null;
  const graph = (configuration as { graph?: CompetitionGraph }).graph;
  return graph?.eventId === eventId && Array.isArray(graph.matches) && Array.isArray(graph.placements) ? graph : null;
}
async function readGraph(event: EventCore, locale: Locale, preview: boolean, publicOnly: boolean): Promise<SocialBracketModel | null> {
  const phase = await prisma.competitionPhase.findFirst({
    where: { eventId: event.id, sequence: 1 },
  });
  if (publicOnly && phase && phase.status !== "active" && phase.status !== "completed") {
    return { event, locale, appearance: await getBracketAppearance(event.id), matches: [], champion: null, preview: false };
  }
  const graph = graphFrom(phase?.configuration, event.id);
  if (!graph) return null;
  const [results, teams, appearance] = await Promise.all([
    prisma.match.findMany({ where: { eventId: event.id }, orderBy: [{ round: "asc" }, { slot: "asc" }, { id: "asc" }] }),
    prisma.team.findMany({ where: { eventId: event.id }, select: { id: true, name: true, logoUrl: true, logoText: true } }),
    getBracketAppearance(event.id),
  ]);
  return buildGraphSocialBracket({
    event, appearance, locale, graph, results, teams, preview,
    visibleMatchIds: new Set(graph.matches.filter((match) => match.status !== "empty").map((match) => match.id)),
  });
}
async function readLegacy(event: EventCore, locale: Locale, preview: boolean): Promise<SocialBracketModel> {
  const [matches, fullTopology, results, teams, roundConfigs, gamesByMatch, appearance] = await Promise.all([
    preview ? getBracketPreview(event.id) : getPublicVisibleBracketPreview(event.id),
    preview ? Promise.resolve(null) : getBracketPreview(event.id),
    getMatchesForEvent(event.id),
    getTeamsForEvent(event.id),
    getEventRoundConfigs(event.id),
    getMatchGamesForEvent(event.id),
    getBracketAppearance(event.id),
  ]);
  const slotsByRound = new Map<number, number>();
  const normalized = matches.map((match) => {
    const slot = "slot" in match && typeof match.slot === "number" ? match.slot : (slotsByRound.get(match.round) ?? 0) + 1;
    slotsByRound.set(match.round, Math.max(slotsByRound.get(match.round) ?? 0, slot));
    return { ...match, slot };
  });
  const totalRounds = Math.max(1, ...(fullTopology ?? matches).map((match) => match.round));
  return buildLegacySocialBracket({ event, locale, appearance, matches: normalized, totalRounds, results, teams, roundConfigs, gamesByMatch, preview });
}

export async function readPublicSocialBracket(slug: string, locale: Locale): Promise<SocialBracketModel | null> {
  const event = await getPublicEventBySlug(slug);
  if (!event) return null;
  const core = eventCore(event);
  const graph = await readGraph(core, locale, false, true);
  if (graph) return graph;
  return readLegacy(core, locale, false);
}

export async function readOrganizerSocialBracket(eventId: string, locale: Locale): Promise<SocialBracketModel | null> {
  const actor = await getSessionUser();
  if (!actor || (actor.role === "organizer" && actor.mustChangePassword)) return null;
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return null;
  const access = authorizeWorkspaceResource(actor as WorkspaceActor, { eventId: event.id, ownerUserId: event.organizerUserId }, event.organizerUserId);
  if (!access.ok) return null;
  const core = eventCore(event);
  const graph = await readGraph(core, locale, true, false);
  if (graph) return graph;
  return readLegacy(core, locale, true);
}
