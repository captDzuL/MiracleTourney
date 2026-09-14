import { createHash } from "node:crypto";
import { findGameConfig, findGameModeConfig } from "@/lib/platform/config";
import { getRegistrationAvailability, buildRegistrationCta } from "./adaptive-public-event";
import type { RegistrationAvailability, RegistrationCta, RegistrationViewerState } from "./adaptive-public-event";
import { readPublicOngoing } from "./public-ongoing";
import { prisma } from "@/lib/platform/db";
import { readPublicRegistration } from "./public-registration";
import { readPublicDrawing } from "./public-drawing";
import { readPublicFinished } from "./public-finished";
import { readFlashpeakStatPayload } from "@/lib/player-stats/flashpeak";
import { publicV3LocalizedHref, publicV3RouteTargets, publicV3RouteTarget } from "./public-v3-types";
import type {
  CompatiblePublicCertificate,
  CompatiblePublicEventInput,
  CompatiblePublicEventRecord,
  CompatiblePublicMatch,
  CompatiblePublicTeam,
  PublicV3BracketSlot,
  PublicV3Certificate,
  PublicV3Cta,
  PublicV3DataSource,
  PublicV3EventViewModel,
  PublicV3Identity,
  PublicV3LeaderboardEntry,
  PublicV3Match,
  PublicV3Navigation,
  PublicV3Shared,
  PublicV3Team,
  PublicViewer,
} from "./public-v3-types";

const PUBLIC_STATUSES = new Set(["Published", "Registration Closed", "Ongoing", "Finished"]);
const AWARD_ORDER = ["mvp", "top_scorer", "top_defender", "top_assist"] as const;
const CERTIFICATE_TYPES = new Set(["champion", "runner_up", "third_place", ...AWARD_ORDER]);
const EXPECTED_CERTIFICATE_COUNT = 7;

type AnyRecord = Record<string, unknown>;

function record(value: unknown): AnyRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function nonNegative(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function dateText(value: unknown, fallback: string | null = null): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return value;
  return fallback;
}

function isoDate(value: unknown, fallback: string): string {
  return dateText(value, fallback) ?? fallback;
}

function eventRecord(input: CompatiblePublicEventInput): CompatiblePublicEventRecord {
  return input.event ?? input.eventRow ?? (record(input) as CompatiblePublicEventRecord);
}

function statusMode(status: string): "registration" | "drawing" | "ongoing" | "finished" {
  if (status === "Registration Closed") return "drawing";
  if (status === "Ongoing") return "ongoing";
  if (status === "Finished") return "finished";
  return "registration";
}

function gameIdentity(event: CompatiblePublicEventRecord) {
  const gameId = text(event.gameId, "TBD");
  const modeId = text(event.gameModeId, "TBD");
  const game = findGameConfig(gameId);
  const mode = findGameModeConfig(modeId);
  return {
    id: gameId,
    name: text(event.gameName, game?.name ?? "TBD"),
    modeId,
    modeName: text(event.modeName, mode?.name ?? game?.defaultModeLabel ?? "TBD"),
  };
}

function statusExplanationKey(mode: "registration" | "drawing" | "ongoing" | "finished", source: PublicV3DataSource): string {
  return mode + "." + source;
}

function statusExplanationCopy(mode: "registration" | "drawing" | "ongoing" | "finished", source: PublicV3DataSource): string {
  if (mode === "registration") return source === "authoritative"
    ? "Official registration details are available."
    : "Registration details are available from saved event data.";
  if (mode === "drawing") return source === "authoritative"
    ? "The official drawing is published."
    : "The drawing is not yet officially published.";
  if (mode === "ongoing") return source === "authoritative"
    ? "The event is in progress with official schedule and results."
    : "The event is in progress using the latest saved schedule and results.";
  return source === "authoritative"
    ? "The event is complete with official results and published awards."
    : "The event is complete; awards appear after publication is verified.";
}

function navigation(mode: "registration" | "drawing" | "ongoing" | "finished", format: string, routes: ReturnType<typeof publicV3RouteTargets>): PublicV3Navigation {
  const roundRobin = /league|round.?robin/i.test(format);
  const bracket = mode !== "registration" && !roundRobin;
  return {
    overview: true,
    participants: true,
    schedule: mode !== "registration",
    bracket,
    leaderboard: mode === "ongoing" || mode === "finished" || (mode === "drawing" && roundRobin),
    targets: routes,
  };
}

function identityFor(
  event: CompatiblePublicEventRecord,
  mode: "registration" | "drawing" | "ongoing" | "finished",
  source: PublicV3DataSource,
  participantCount: number,
): PublicV3Identity {
  const slug = text(event.slug, "");
  const title = text(event.title, text(event.name, slug || "TBD"));
  const game = gameIdentity(event);
  const verified = Boolean(event.organizerVerified);
  const cap = Math.max(0, Math.floor(nonNegative(event.participantCap)));
  const venue = text(event.venueAddress, text(event.venue, "TBD"));
  const startsAt = isoDate(event.eventStartsAt, text(event.startsAt, "TBD"));
  const organizerName = text(event.organizerName, "TBD");
  const contactChannel = text(event.organizerContactChannel);
  const contactValue = text(event.organizerContactValue);
  const format = text(event.format, "TBD");
  const roundRobin = /league|round.?robin/i.test(format);
  const routes = publicV3RouteTargets(slug);
  const ctaTarget = mode === "registration"
    ? routes.register
    : mode === "drawing"
      ? roundRobin ? routes.leaderboard : routes.bracket
      : mode === "ongoing"
        ? routes.overview
        : routes.leaderboard;
  const cta: PublicV3Cta = {
    kind: mode === "registration" ? "start" : "link",
    label: mode === "registration"
      ? "register_team"
      : mode === "drawing"
        ? roundRobin ? "view_leaderboard" : "view_bracket"
        : mode === "ongoing"
          ? "view_live_event"
          : "view_leaderboard",
    href: ctaTarget.hrefByLocale.id,
    hrefByLocale: ctaTarget.hrefByLocale,
    target: ctaTarget,
    enabled: mode === "registration" ? event.status === "Published" : true,
  };
  const nav = navigation(mode, format, routes);
  const explanationKey = statusExplanationKey(mode, source);
  return {
    id: text(event.id, slug),
    slug,
    title,
    description: text(event.description),
    game,
    organizer: {
      name: organizerName,
      verified,
      trust: verified ? "verified" : "unverified",
      contactChannel,
      contactValue,
      contactHref: null,
    },
    statusExplanation: statusExplanationCopy(mode, source),
    statusExplanationKey: explanationKey,
    routes,
    facts: {
      startsAt,
      timezone: text(event.timezone, "TBD"),
      venue,
      prize: typeof event.prizePoolLabel === "string" ? event.prizePoolLabel : null,
      participants: participantCount,
      participantCap: cap,
      remainingSlots: cap > 0 ? Math.max(0, cap - participantCount) : 0,
    },
    cta,
    navigation: nav,
    poster: {
      eventUrl: text(event.posterUrl, "") || null,
      logoUrl: text(event.logoUrl, "") || null,
      gameImageUrl: text(event.gameImageUrl, "") || null,
    },
    format,
  };
}

function shared(
  event: CompatiblePublicEventRecord,
  mode: "registration" | "drawing" | "ongoing" | "finished",
  source: PublicV3DataSource,
  teams: PublicV3Team[],
  updates: PublicV3Shared["updates"] = [],
  participantCount = teams.length,
): PublicV3Shared {
  const identity = identityFor(event, mode, source, participantCount);
  return {
    source,
    identity,
    event: identity,
    organizer: identity.organizer,
    facts: identity.facts,
    statusExplanation: identity.statusExplanation,
    statusExplanationKey: identity.statusExplanationKey,
    cta: identity.cta,
    navigation: identity.navigation,
    teams,
    updates,
  };
}

function teamsFor(input: CompatiblePublicEventInput): PublicV3Team[] {
  const explicit = Array.isArray(input.teams) ? input.teams : [];
  const fromRegistrations = (Array.isArray(input.registrations) ? input.registrations : [])
    .filter((row) => ["approved", "accepted", "active"].includes(text(row.status).toLowerCase()))
    .map((row) => row.team ?? (row.teamId ? { id: row.teamId, name: text(row.teamId) } : null))
    .filter((team): team is CompatiblePublicTeam => Boolean(team));
  const byId = new Map<string, PublicV3Team>();
  for (const team of [...explicit, ...fromRegistrations]) {
    const id = text(team.id);
    if (!id || byId.has(id)) continue;
    byId.set(id, {
      id,
      name: text(team.name, id),
      tag: typeof team.tag === "string" ? team.tag : null,
      logoUrl: typeof team.logoUrl === "string" ? team.logoUrl : null,
      players: Array.isArray(team.players) ? team.players.length : nonNegative(team.players),
    });
  }
  return [...byId.values()];
}

function teamNames(input: CompatiblePublicEventInput): Map<string, string> {
  return new Map(teamsFor(input).map((team) => [team.id, team.name]));
}

function matchOfficial(match: CompatiblePublicMatch): boolean {
  return nonNegative(match.resultVersion) > 0 || ["completed", "complete"].includes(text(match.status).toLowerCase());
}

function publicScore(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function publicMatch(match: CompatiblePublicMatch, names: Map<string, string>, mode: "registration" | "drawing" | "ongoing" | "finished"): PublicV3Match {
  const official = matchOfficial(match);
  const rawStatus = text(match.status).toLowerCase();
  const status: PublicV3Match["status"] = official
    ? "completed"
    : rawStatus === "live" ? "live"
      : rawStatus === "delayed" ? "delayed"
        : rawStatus === "postponed" ? "postponed" : "scheduled";
  const homeId = text(match.homeTeamId);
  const awayId = text(match.awayTeamId);
  const revealParticipants = mode !== "drawing";
  return {
    id: text(match.id),
    roundLabel: text(match.roundLabel, match.round ? "Round " + match.round : "Match"),
    home: revealParticipants && homeId ? names.get(homeId) ?? homeId : null,
    away: revealParticipants && awayId ? names.get(awayId) ?? awayId : null,
    status,
    homeScore: official ? publicScore(match.homeScore) : null,
    awayScore: official ? publicScore(match.awayScore) : null,
    start: dateText(match.scheduledAt),
    end: dateText(match.scheduledEndsAt),
    room: text(match.scheduleRoom) || null,
    bestOf: Math.max(1, Math.floor(nonNegative(match.bestOf, 1))),
    official,
  };
}

function tbdSlots(matches: PublicV3Match[]): PublicV3BracketSlot[] {
  return matches.map((match) => ({
    id: match.id,
    roundLabel: match.roundLabel,
    home: match.home ?? "TBD",
    away: match.away ?? "TBD",
    status: "tbd",
    homeScore: null,
    awayScore: null,
    official: false,
  }));
}

function leaderboardFor(input: CompatiblePublicEventInput): PublicV3LeaderboardEntry[] {
  const rows = Array.isArray(input.leaderboard) ? input.leaderboard : [];
  return rows.map((row) => {
    const stats = readFlashpeakStatPayload(row.stats);
    const validScores = stats.scores.filter((score): score is number => score !== null);
    return {
      playerId: text(row.playerId),
      playerName: text(row.playerName, text(row.playerId)),
      nickname: text(row.nickname, text(row.playerName, text(row.playerId))),
      teamId: text(row.teamId),
      teamName: text(row.teamName, text(row.teamId)),
      position: text(row.position),
      game: nonNegative(row.game, stats.scores.length),
      score: typeof row.score === "number" && Number.isFinite(row.score) ? row.score : validScores.length ? validScores.reduce((sum, score) => sum + score, 0) / validScores.length : null,
      goal: stats.goal,
      assist: stats.assist,
      passing: stats.passing,
      defense: stats.defense,
    };
  });
}

const REGISTRATION_STATES: RegistrationViewerState[] = [
  "anonymous", "wrong_role", "eligible_without_team", "eligible_with_team",
  "draft_incomplete", "pending_payment", "pending_review", "rejected",
  "expired", "approved",
];

function registrationState(value: unknown): RegistrationViewerState {
  const candidate = text(value);
  return REGISTRATION_STATES.includes(candidate as RegistrationViewerState)
    ? candidate as RegistrationViewerState
    : "anonymous";
}

function registrationAvailability(value: unknown, fallback: RegistrationAvailability): RegistrationAvailability {
  const candidate = text(value);
  return ["upcoming", "open", "full", "closed", "legacy"].includes(candidate)
    ? candidate as RegistrationAvailability
    : fallback;
}

function mapRegistrationCta(value: unknown, fallback: RegistrationCta): RegistrationCta {
  const row = record(value);
  const kind = text(row.kind);
  const label = text(row.label, fallback.label);
  const href = text(row.href, "href" in fallback ? fallback.href : "");
  if (kind === "login") return { kind: "login", label, enabled: true };
  if (kind === "start") return { kind: "start", label, href, enabled: true };
  if (kind === "continue") return { kind: "continue", label, href, enabled: true };
  if (kind === "status") return { kind: "status", label, href, enabled: true };
  if (kind === "disabled") return { kind: "disabled", label, reason: text(row.reason, label), enabled: false };
  return fallback;
}

function publicCta(cta: RegistrationCta): PublicV3Cta {
  const rawHref = "href" in cta ? cta.href : null;
  const hrefByLocale = rawHref ? publicV3LocalizedHref(rawHref) : null;
  return {
    kind: cta.kind,
    label: cta.label,
    href: hrefByLocale?.id ?? null,
    hrefByLocale,
    target: hrefByLocale ? { key: "custom", hrefByLocale } : undefined,
    enabled: cta.enabled,
    ...("reason" in cta ? { reason: cta.reason } : {}),
  };
}

function registrationInput(event: CompatiblePublicEventRecord, input: CompatiblePublicEventInput, teams: PublicV3Team[], source: PublicV3DataSource): PublicV3EventViewModel {
  const mode = "registration" as const;
  const now = input.now ?? new Date();
  const rawRegistration = record((input as AnyRecord).registration);
  const activeTeamCount = Math.floor(nonNegative(rawRegistration.activeTeamCount, teams.length));
  const pendingReviewCount = Math.floor(nonNegative(rawRegistration.pendingReviewCount, (Array.isArray(input.registrations) ? input.registrations : []).filter((row) => text(row.status).toLowerCase() === "pending_review").length));
  const participantCap = Math.floor(nonNegative(rawRegistration.participantCap, nonNegative(event.participantCap)));
  const opensAt = dateText(rawRegistration.opensAt, dateText(event.registrationOpensAt));
  const closesAt = dateText(rawRegistration.closesAt, dateText(event.registrationClosesAt));
  const availability = getRegistrationAvailability({
    status: event.status === "Registration Closed" ? "Registration Closed" : event.status === "Ongoing" ? "Ongoing" : "Published",
    opensAt: opensAt ? new Date(opensAt) : null,
    closesAt: closesAt ? new Date(closesAt) : null,
    occupiedSlots: activeTeamCount + pendingReviewCount,
    participantCap,
    now,
  });
  const sharedView = shared(event, mode, source, teams, [], activeTeamCount);
  const fallbackCta = buildRegistrationCta({
    state: "anonymous",
    availability,
    href: sharedView.identity.cta.href ?? "/events/" + encodeURIComponent(sharedView.identity.slug) + "/register",
  });
  const rawViewerCta = (input as AnyRecord).viewerCta;
  const registrationCta = Object.keys(record(rawViewerCta)).length ? mapRegistrationCta(rawViewerCta, fallbackCta) : fallbackCta;
  const cta = publicCta(registrationCta);
  const matches: PublicV3Match[] = [];
  return {
    ...sharedView,
    identity: { ...sharedView.identity, cta },
    event: { ...sharedView.event, cta },
    cta,
    mode,
    registration: {
      availability: registrationAvailability(rawRegistration.availability, availability),
      opensAt,
      closesAt,
      activeTeamCount,
      pendingReviewCount,
      occupiedSlots: Math.floor(nonNegative(rawRegistration.occupiedSlots, activeTeamCount + pendingReviewCount)),
      remainingSlots: Math.floor(nonNegative(rawRegistration.remainingSlots, Math.max(0, participantCap - activeTeamCount - pendingReviewCount))),
      participantCap,
      feeRequired: typeof rawRegistration.feeRequired === "boolean" ? rawRegistration.feeRequired : Boolean(event.registrationFeeRequired),
      feeAmount: typeof rawRegistration.feeAmount === "number" ? rawRegistration.feeAmount : typeof event.registrationFeeAmount === "number" ? event.registrationFeeAmount : null,
      feeLabel: text(rawRegistration.feeLabel, text(event.registrationFeeLabel, "")),
      minimumRoster: Math.max(1, Math.floor(nonNegative(rawRegistration.minimumRoster, 1))),
      maximumRoster: Math.max(1, Math.floor(nonNegative(rawRegistration.maximumRoster, nonNegative(findGameModeConfig(text(event.gameModeId))?.maxRosterSize, 1)))),
      bracket: { status: "tbd", slots: tbdSlots(matches) },
    },
    viewer: { state: registrationState((input as AnyRecord).viewerState), cta: registrationCta },
    matches,
    leaderboard: leaderboardFor(input),
  };
}

function drawingInput(event: CompatiblePublicEventRecord, input: CompatiblePublicEventInput, teams: PublicV3Team[], source: PublicV3DataSource): PublicV3EventViewModel {
  const mode = "drawing" as const;
  const names = teamNames(input);
  const matches = (Array.isArray(input.matches) ? input.matches : []).map((match) => publicMatch(match, names, mode));
  const sharedView = shared(event, mode, source, teams);
  const seeds: Array<{ teamId: string; teamName: string; seed: number }> = [];
  return {
    ...sharedView,
    mode,
    drawing: { published: source === "authoritative", status: source === "authoritative" ? "published" : "tbd", seeds, slots: tbdSlots(matches).map((slot) => source === "compatible" ? { ...slot, home: "TBD", away: "TBD" } : slot) },
    matches,
    standings: [],
    schedule: null,
    leaderboard: leaderboardFor(input),
  };
}

function ongoingInput(event: CompatiblePublicEventRecord, input: CompatiblePublicEventInput, teams: PublicV3Team[], source: PublicV3DataSource): PublicV3EventViewModel {
  const mode = "ongoing" as const;
  const names = teamNames(input);
  const matches = (Array.isArray(input.matches) ? input.matches : []).map((match) => publicMatch(match, names, mode));
  const sharedView = shared(event, mode, source, teams);
  const liveMatches = matches.filter((match) => match.status === "live");
  const recentResults = matches.filter((match) => match.official).slice().reverse();
  const serialized = JSON.stringify({ event: sharedView.identity, matches });
  return {
    ...sharedView,
    mode,
    matches,
    liveMatches,
    nextMatches: matches.filter((match) => !match.official && match.status !== "live"),
    recentResults,
    schedule: null,
    standings: [],
    stream: event.stream?.enabled && typeof event.stream.url === "string" ? { url: event.stream.url, label: text(event.stream.label, "Live stream"), platform: text(event.stream.platform, "external"), isLive: Boolean(event.stream.isLive) } : null,
    leaderboard: leaderboardFor(input),
    stateVersion: createHash("sha256").update(serialized).digest("hex").slice(0, 24),
    lastUpdatedAt: new Date().toISOString(),
  };
}

function completionVersion(completion: CompatiblePublicEventInput["completion"]): number | null {
  const version = record(completion?.sourceSnapshot).version;
  return Number.isSafeInteger(version) && Number(version) >= 0 ? Number(version) : null;
}


function certificatePublicationIsComplete(input: {
  published: boolean;
  completionCompleted: boolean;
  expectedCount: number;
  publicationIds: string[];
  certificates: PublicV3Certificate[];
}): boolean {
  const types = new Set(input.certificates.map((certificate) => certificate.type));
  const ids = new Set(input.publicationIds);
  return input.published
    && input.completionCompleted
    && input.expectedCount === EXPECTED_CERTIFICATE_COUNT
    && input.publicationIds.length === EXPECTED_CERTIFICATE_COUNT
    && ids.size === EXPECTED_CERTIFICATE_COUNT
    && input.certificates.length === EXPECTED_CERTIFICATE_COUNT
    && types.size === EXPECTED_CERTIFICATE_COUNT
    && input.certificates.every((certificate) => CERTIFICATE_TYPES.has(certificate.type));
}

function certificateRows(input: CompatiblePublicEventInput, completion: CompatiblePublicEventInput["completion"]): {
  state: {
    status: "preparing" | "published";
    publishedCount: number;
    expectedCount: number;
    isCurrent: boolean;
    isComplete: boolean;
    publicationVersion: number | null;
  };
  items: PublicV3Certificate[];
} {
  const publication = input.publication;
  const ids = Array.isArray(publication?.certificateIds)
    ? publication.certificateIds.filter((id): id is string => typeof id === "string")
    : [];
  const version = completionVersion(completion);
  const current = Boolean(
    completion?.status === "completed"
      && publication
      && completion?.id
      && publication.completionId === completion.id
      && version !== null
      && publication.completionVersion === version,
  );
  const certificates = (Array.isArray(input.certificates) ? input.certificates : [])
    .filter((certificate) =>
      current
      && ids.includes(certificate.id)
      && certificate.completionId === completion?.id
      && certificate.completionVersion === version
      && Boolean(certificate.publishedUrl)
      && Boolean(certificate.verificationCode)
      && ["ready", "published"].includes(text(certificate.status, "published")),
    )
    .filter((certificate) => CERTIFICATE_TYPES.has(certificate.type))
    .map((certificate) => ({
      id: certificate.id,
      type: certificate.type,
      recipientKind: text(
        certificate.recipientKind,
        ["champion", "runner_up", "third_place"].includes(certificate.type) ? "team" : "player",
      ),
      recipientId: text(certificate.recipientId),
      recipientName: text(certificate.recipientName),
      publishedUrl: text(certificate.publishedUrl),
      verificationCode: text(certificate.verificationCode),
    }));
  const complete = certificatePublicationIsComplete({
    published: current,
    completionCompleted: completion?.status === "completed",
    expectedCount: EXPECTED_CERTIFICATE_COUNT,
    publicationIds: ids,
    certificates,
  });
  return {
    state: {
      status: complete ? "published" : "preparing",
      publishedCount: complete ? certificates.length : 0,
      expectedCount: EXPECTED_CERTIFICATE_COUNT,
      isCurrent: current,
      isComplete: complete,
      publicationVersion: typeof publication?.version === "number" ? publication.version : null,
    },
    items: complete ? certificates : [],
  };
}

function finishedInput(event: CompatiblePublicEventRecord, input: CompatiblePublicEventInput, teams: PublicV3Team[], source: PublicV3DataSource): PublicV3EventViewModel {
  const mode = "finished" as const;
  const names = teamNames(input);
  const matches = (Array.isArray(input.matches) ? input.matches : []).map((match) => publicMatch(match, names, mode));
  const sharedView = shared(event, mode, source, teams);
  const completion = input.completion;
  const rows = certificateRows(input, completion);
  const byType = new Map(rows.items.map((certificate) => [certificate.type, certificate]));
  const podiumRows = completion?.podiumPlacements ?? completion?.podium ?? [];
  const podium = podiumRows.map((placement) => ({
    rank: placement.rank,
    teamId: placement.teamId,
    teamName: placement.teamName,
    certificate: byType.get(placement.rank === 1 ? "champion" : placement.rank === 2 ? "runner_up" : "third_place") ?? null,
  }));
  const awards = rows.state.isComplete
    ? (completion?.awards ?? []).flatMap((award) => {
      if (!AWARD_ORDER.includes(award.type as (typeof AWARD_ORDER)[number]) || award.status !== "approved" || !award.decision) return [];
      return [{
        type: award.type,
        recipientId: award.decision.recipientId,
        recipientName: award.decision.recipientName,
        teamId: award.decision.teamId,
        teamName: award.decision.teamName,
        reason: award.decision.reason ?? null,
        certificate: byType.get(award.type) ?? null,
      }];
    })
    : [];
  return {
    ...sharedView,
    mode,
    certificates: { ...rows.state, items: rows.items },
    podium,
    awards,
    matches,
    standings: [],
    leaderboard: leaderboardFor(input),
  };
}

export function projectCompatiblePublicV3Event(input: CompatiblePublicEventInput): PublicV3EventViewModel {
  const event = eventRecord(input);
  const mode = statusMode(text(event.status, "Published"));
  const teams = teamsFor(input);
  if (mode === "registration") return registrationInput(event, input, teams, "compatible");
  if (mode === "drawing") return drawingInput(event, input, teams, "compatible");
  if (mode === "ongoing") return ongoingInput(event, input, teams, "compatible");
  return finishedInput(event, input, teams, "compatible");
}

function identityEvent(event: AnyRecord): CompatiblePublicEventRecord {
  return {
    id: text(event.id),
    slug: text(event.slug),
    name: text(event.name),
    title: text(event.title),
    description: typeof event.description === "string" ? event.description : null,
    logoUrl: typeof event.logoUrl === "string" ? event.logoUrl : null,
    posterUrl: typeof event.posterUrl === "string" ? event.posterUrl : null,
    gameImageUrl: typeof event.gameImageUrl === "string" ? event.gameImageUrl : null,
    gameId: text(event.gameId),
    gameName: text(event.gameName),
    gameModeId: text(event.gameModeId),
    modeName: text(event.modeName),
    format: text(event.format),
    status: text(event.status),
    participantCap: publicScore(event.participantCap) ?? undefined,
    registrationWindow: typeof event.registrationWindow === "string" ? event.registrationWindow : null,
    startsAt: typeof event.startsAt === "string" ? event.startsAt : null,
    eventStartsAt: event.eventStartsAt instanceof Date || typeof event.eventStartsAt === "string" ? event.eventStartsAt : null,
    registrationOpensAt: event.registrationOpensAt instanceof Date || typeof event.registrationOpensAt === "string" ? event.registrationOpensAt : null,
    registrationClosesAt: event.registrationClosesAt instanceof Date || typeof event.registrationClosesAt === "string" ? event.registrationClosesAt : null,
    timezone: typeof event.timezone === "string" ? event.timezone : null,
    venue: typeof event.venue === "string" ? event.venue : null,
    venueAddress: typeof event.venueAddress === "string" ? event.venueAddress : null,
    organizerName: typeof event.organizerName === "string" ? event.organizerName : null,
    organizerVerified: typeof event.organizerVerified === "boolean" ? event.organizerVerified : null,
    organizerContactChannel: typeof event.organizerContactChannel === "string" ? event.organizerContactChannel : null,
    organizerContactValue: typeof event.organizerContactValue === "string" ? event.organizerContactValue : null,
    prizePoolLabel: typeof event.prizePoolLabel === "string" ? event.prizePoolLabel : null,
    registrationFeeRequired: typeof event.registrationFeeRequired === "boolean" ? event.registrationFeeRequired : null,
    registrationFeeAmount: typeof event.registrationFeeAmount === "number" ? event.registrationFeeAmount : null,
    registrationFeeLabel: typeof event.registrationFeeLabel === "string" ? event.registrationFeeLabel : null,
    registrationUrl: typeof event.registrationUrl === "string" ? event.registrationUrl : null,
    stream: typeof event.stream === "object" && event.stream !== null && !Array.isArray(event.stream)
      ? { ...record(event.stream) }
      : null,
  };
}

function readerInput(event: AnyRecord, view: unknown): CompatiblePublicEventInput {
  const value = record(view);
  const nestedEvent = record(value.event);
  const nestedFacts = record(value.facts);
  const nestedOrganizer = record(value.organizer);
  const outer = identityEvent(event);
  const nestedFormat = text(nestedEvent.format, text(nestedEvent.formatLabel, outer.format));
  return {
    event: {
      ...outer,
      id: text(nestedEvent.id, text(outer.id)),
      slug: text(nestedEvent.slug, text(outer.slug)),
      name: text(nestedEvent.name, text(outer.name)),
      title: text(nestedEvent.title, text(outer.title)),
      description: typeof nestedEvent.description === "string" ? nestedEvent.description : outer.description,
      gameName: text(nestedEvent.gameName, text(outer.gameName)),
      organizerName: text(nestedOrganizer.name, text(outer.organizerName)),
      organizerVerified: typeof nestedOrganizer.verified === "boolean" ? nestedOrganizer.verified : outer.organizerVerified,
      modeName: text(nestedEvent.modeName, text(outer.modeName)),
      format: nestedFormat,
      timezone: text(nestedEvent.timezone, text(outer.timezone)),
      prizePoolLabel: typeof nestedEvent.prize === "string"
        ? nestedEvent.prize
        : typeof nestedFacts.prize === "string" ? nestedFacts.prize : outer.prizePoolLabel,
      participantCap: publicScore(nestedFacts.participantCap) ?? outer.participantCap,
      eventStartsAt: dateText(nestedFacts.startsAt, dateText(outer.eventStartsAt)),
      venueAddress: typeof nestedFacts.venue === "string"
        ? nestedFacts.venue
        : typeof nestedEvent.venueAddress === "string" ? nestedEvent.venueAddress : outer.venueAddress,
      venue: typeof nestedFacts.venue === "string" ? nestedFacts.venue : text(nestedEvent.venue, text(outer.venue)),
      posterUrl: typeof nestedEvent.posterUrl === "string" ? nestedEvent.posterUrl : outer.posterUrl,
      logoUrl: typeof nestedEvent.logoUrl === "string" ? nestedEvent.logoUrl : outer.logoUrl,
    },
  };
}

function teamsFromRaw(value: unknown): CompatiblePublicTeam[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = record(entry);
    const id = text(row.id);
    if (!id) return [];
    const count = publicScore(record(row._count).players);
    return [{
      id,
      name: text(row.name, id),
      tag: typeof row.tag === "string" ? row.tag : null,
      logoUrl: typeof row.logoUrl === "string" ? row.logoUrl : null,
      players: Array.isArray(row.players) ? row.players : count ?? undefined,
    }];
  });
}

function authoritativeMatch(value: unknown): PublicV3Match {
  const row = record(value);
  const rawStatus = text(row.status).toLowerCase();
  const resultVersion = nonNegative(row.resultVersion);
  const official = row.official === true || resultVersion > 0 || rawStatus === "completed" || rawStatus === "complete";
  const status: PublicV3Match["status"] = official
    ? "completed"
    : rawStatus === "live" ? "live"
      : rawStatus === "delayed" ? "delayed"
        : rawStatus === "postponed" ? "postponed" : "scheduled";
  const round = Math.floor(nonNegative(row.round));
  const home = text(row.home, text(row.homeTeamId)) || null;
  const away = text(row.away, text(row.awayTeamId)) || null;
  return {
    id: text(row.id, "TBD"),
    roundLabel: text(row.roundLabel, round > 0 ? "Round " + round : "Match"),
    home,
    away,
    status,
    homeScore: official ? publicScore(row.homeScore) : null,
    awayScore: official ? publicScore(row.awayScore) : null,
    start: dateText(row.start, dateText(row.scheduledAt)),
    end: dateText(row.end, dateText(row.scheduledEndsAt)),
    room: text(row.room, text(row.scheduleRoom)) || null,
    bestOf: Math.max(1, Math.floor(nonNegative(row.bestOf, 1))),
    official,
  };
}

function authoritativeMatches(value: unknown): PublicV3Match[] {
  return Array.isArray(value) ? value.map(authoritativeMatch) : [];
}

function authoritativeBracketSlots(matches: PublicV3Match[]): PublicV3BracketSlot[] {
  return matches.map((match) => ({
    id: match.id,
    roundLabel: match.roundLabel,
    home: match.home ?? "TBD",
    away: match.away ?? "TBD",
    status: match.status === "live" ? "live" : match.status === "completed" ? "completed" : "scheduled",
    homeScore: match.official ? match.homeScore : null,
    awayScore: match.official ? match.awayScore : null,
    official: match.official,
  }));
}

function authoritativeSeeds(value: unknown): Array<{ teamId: string; teamName: string; seed: number }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = record(entry);
    const teamId = text(row.teamId);
    const seed = publicScore(row.seed);
    if (!teamId || seed === null) return [];
    return [{ teamId, teamName: text(row.teamName, teamId), seed: Math.floor(seed) }];
  });
}

function authoritativeDrawingStandings(value: unknown): Array<{ phaseId: string; groupId: string | null; rows: Array<Record<string, unknown>> }> {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const row = record(entry);
    return {
      phaseId: text(row.phaseId, "TBD"),
      groupId: typeof row.groupId === "string" ? row.groupId : null,
      rows: Array.isArray(row.rows) ? row.rows.map((standing) => ({ ...record(standing) })) : [],
    };
  });
}

function authoritativeOngoingStandings(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const row = record(entry);
    return {
      phaseId: text(row.phaseId, "TBD"),
      groupId: typeof row.groupId === "string" ? row.groupId : null,
      groupNumber: publicScore(row.groupNumber),
      label: text(row.label),
      complete: row.complete === true,
      qualificationCutline: publicScore(row.qualificationCutline),
      rows: Array.isArray(row.rows) ? row.rows.map((standing) => ({ ...record(standing) })) : [],
    };
  });
}

function authoritativeDrawingSchedule(value: unknown): { version: number; publishedAt: string | null } | null {
  const row = record(value);
  if (!Object.keys(row).length) return null;
  return {
    version: Math.max(0, Math.floor(nonNegative(row.version))),
    publishedAt: dateText(row.publishedAt),
  };
}

function authoritativeOngoingSchedule(value: unknown): { version: number; publishedAt: string | null; changes: Array<Record<string, unknown>> } | null {
  const row = record(value);
  if (!Object.keys(row).length) return null;
  return {
    version: Math.max(0, Math.floor(nonNegative(row.version))),
    publishedAt: dateText(row.publishedAt),
    changes: Array.isArray(row.changes) ? row.changes.map((change) => ({ ...record(change) })) : [],
  };
}

function authoritativeStream(value: unknown): { url: string; label: string; platform: string; isLive: boolean } | null {
  const row = record(value);
  const url = text(row.url);
  return url ? { url, label: text(row.label, "Live stream"), platform: text(row.platform, "external"), isLive: row.isLive === true } : null;
}

function authoritativeLeaderboard(value: unknown): PublicV3LeaderboardEntry[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const row = record(entry);
    const stats = readFlashpeakStatPayload(row.stats);
    const validScores = stats.scores.filter((score): score is number => score !== null);
    return {
      playerId: text(row.playerId),
      playerName: text(row.playerName, text(row.playerId)),
      nickname: text(row.nickname, text(row.playerName, text(row.playerId))),
      teamId: text(row.teamId),
      teamName: text(row.teamName, text(row.teamId)),
      position: text(row.position),
      game: Math.floor(nonNegative(row.game, stats.scores.length)),
      score: publicScore(row.score) ?? (validScores.length ? validScores.reduce((sum, score) => sum + score, 0) / validScores.length : null),
      goal: stats.goal,
      assist: stats.assist,
      passing: stats.passing,
      defense: stats.defense,
    };
  });
}

function authoritativeCertificate(value: unknown, type: string, recipientKind: "team" | "player", recipientId: string, recipientName: string): PublicV3Certificate | null {
  const row = record(value);
  const publishedUrl = text(row.publishedUrl);
  const verificationCode = text(row.verificationCode);
  if (!publishedUrl || !verificationCode) return null;
  return {
    id: text(row.id, verificationCode),
    type,
    recipientKind,
    recipientId: text(row.recipientId, recipientId),
    recipientName: text(row.recipientName, recipientName),
    publishedUrl,
    verificationCode,
  };
}

function authoritativeRegistrationCta(value: unknown): { state: RegistrationViewerState; cta: RegistrationCta } {
  const row = record(value);
  const state = registrationState(row.state);
  const fallback: RegistrationCta = { kind: "disabled", label: "registration_unavailable", reason: "registration_unavailable", enabled: false };
  return { state, cta: mapRegistrationCta(row.cta, fallback) };
}

function normalizeAuthoritative(
  event: AnyRecord,
  view: unknown,
  source: "authoritative",
  snapshotTeams: CompatiblePublicTeam[] = [],
): PublicV3EventViewModel | null {
  const raw = record(view);
  const mode = text(raw.mode);
  if (!["registration", "drawing", "ongoing", "finished"].includes(mode)) return null;
  const eventInput = readerInput(event, view);
  const rawTeams = teamsFromRaw(raw.teams);
  const teams = teamsFor({ ...eventInput, teams: [...snapshotTeams, ...rawTeams] });
  if (mode === "registration") {
    const registration = record(raw.registration);
    const viewer = authoritativeRegistrationCta(raw.viewer);
    const output = registrationInput(eventInput.event ?? identityEvent(event), {
      ...eventInput,
      teams,
      registration,
      viewerState: viewer.state,
      viewerCta: viewer.cta,
    }, teams, source);
    if (output.mode !== "registration") return output;
    return { ...output, viewer: { state: viewer.state, cta: viewer.cta } };
  }
  if (mode === "drawing") {
    const matches = authoritativeMatches(raw.matches);
    const output = drawingInput(eventInput.event ?? identityEvent(event), { ...eventInput, teams }, teams, source);
    if (output.mode !== "drawing") return output;
    const drawing = record(raw.drawing);
    const published = drawing.published === true;
    const seeds = authoritativeSeeds(drawing.seeds);
    return {
      ...output,
      teams,
      drawing: {
        published,
        status: published ? "published" : "tbd",
        seeds,
        slots: authoritativeBracketSlots(matches),
      },
      matches,
      standings: authoritativeDrawingStandings(raw.standings),
      schedule: authoritativeDrawingSchedule(raw.schedule),
      leaderboard: authoritativeLeaderboard(raw.leaderboard),
    };
  }
  if (mode === "ongoing") {
    const matches = authoritativeMatches(raw.matches);
    const liveMatches = authoritativeMatches(raw.liveMatches);
    const nextMatches = authoritativeMatches(raw.nextMatches);
    const recentResults = authoritativeMatches(raw.recentResults);
    const output = ongoingInput(eventInput.event ?? identityEvent(event), { ...eventInput, teams }, teams, source);
    if (output.mode !== "ongoing") return output;
    const serialized = JSON.stringify({ event: output.identity, matches });
    return {
      ...output,
      teams,
      matches,
      liveMatches: liveMatches.length ? liveMatches : matches.filter((match) => match.status === "live"),
      nextMatches: nextMatches.length ? nextMatches : matches.filter((match) => !match.official && match.status !== "live"),
      recentResults: recentResults.length ? recentResults : matches.filter((match) => match.official).slice().reverse(),
      schedule: authoritativeOngoingSchedule(raw.schedule),
      standings: authoritativeOngoingStandings(raw.standings),
      stream: authoritativeStream(raw.stream),
      leaderboard: authoritativeLeaderboard(raw.leaderboard),
      stateVersion: text(raw.stateVersion, serialized),
      lastUpdatedAt: isoDate(raw.lastUpdatedAt, output.lastUpdatedAt),
    };
  }
  const matches = authoritativeMatches(raw.matches);
  const rawCertificates = record(raw.certificates);
  const rawPodium = Array.isArray(raw.podium) ? raw.podium : [];
  const rawAwards = Array.isArray(raw.awards) ? raw.awards : [];
  const podiumWithCertificates = rawPodium.map((entry) => {
    const row = record(entry);
    const rank = Math.floor(nonNegative(row.rank));
    const certificate = authoritativeCertificate(row.certificate, rank === 1 ? "champion" : rank === 2 ? "runner_up" : "third_place", "team", text(row.teamId), text(row.teamName, text(row.teamId)));
    return { rank, teamId: text(row.teamId), teamName: text(row.teamName, text(row.teamId)), certificate };
  });
  const awardsWithCertificates = rawAwards.flatMap((entry) => {
    const row = record(entry);
    const type = text(row.type);
    if (!AWARD_ORDER.includes(type as (typeof AWARD_ORDER)[number])) return [];
    const certificate = authoritativeCertificate(row.certificate, type, "player", text(row.recipientId), text(row.recipientName, text(row.recipientId)));
    return [{
      type,
      recipientId: text(row.recipientId),
      recipientName: text(row.recipientName, text(row.recipientId)),
      teamId: text(row.teamId),
      teamName: text(row.teamName, text(row.teamId)),
      reason: typeof row.reason === "string" ? row.reason : null,
      certificate,
    }];
  });
  const certificateItems = [...podiumWithCertificates, ...awardsWithCertificates]
    .map((entry) => entry.certificate)
    .filter((certificate): certificate is PublicV3Certificate => Boolean(certificate));
  const expectedCount = Math.floor(nonNegative(rawCertificates.expectedCount, EXPECTED_CERTIFICATE_COUNT));
  const publishedCount = Math.floor(nonNegative(rawCertificates.publishedCount));
  const complete = certificatePublicationIsComplete({
    published: rawCertificates.status === "published" && publishedCount === expectedCount,
    completionCompleted: true,
    expectedCount,
    publicationIds: certificateItems.map((certificate) => certificate.id),
    certificates: certificateItems,
  });
  const visibleCertificates = complete ? certificateItems : [];
  const certificateByType = new Map(visibleCertificates.map((certificate) => [certificate.type, certificate]));
  const output = finishedInput(eventInput.event ?? identityEvent(event), { ...eventInput, teams }, teams, source);
  if (output.mode !== "finished") return output;
  return {
    ...output,
    teams,
    certificates: {
      status: complete ? "published" : "preparing",
      publishedCount: complete ? visibleCertificates.length : 0,
      expectedCount,
      isCurrent: complete,
      isComplete: complete,
      publicationVersion: publicScore(rawCertificates.publicationVersion),
      items: visibleCertificates,
    },
    podium: podiumWithCertificates.map((entry) => ({ ...entry, certificate: complete ? certificateByType.get(entry.certificate?.type ?? "") ?? null : null })),
    awards: complete ? awardsWithCertificates.map((entry) => ({ ...entry, certificate: certificateByType.get(entry.type) ?? null })) : [],
    matches,
    standings: authoritativeDrawingStandings(raw.standings),
    leaderboard: authoritativeLeaderboard(raw.leaderboard),
  };
}

async function callOptional(modelName: string, methodName: string, args: unknown): Promise<unknown> {
  const model = (prisma as unknown as Record<string, unknown>)[modelName] as Record<string, unknown> | undefined;
  const method = model?.[methodName];
  if (typeof method !== "function") return null;
  return (method as (input: unknown) => Promise<unknown>).call(model, args);
}

function compatibleMatch(value: unknown): CompatiblePublicMatch {
  const row = record(value);
  return {
    id: text(row.id, "TBD"),
    roundLabel: typeof row.roundLabel === "string" ? row.roundLabel : null,
    round: publicScore(row.round),
    homeTeamId: typeof row.homeTeamId === "string" ? row.homeTeamId : null,
    awayTeamId: typeof row.awayTeamId === "string" ? row.awayTeamId : null,
    homeScore: publicScore(row.homeScore),
    awayScore: publicScore(row.awayScore),
    status: typeof row.status === "string" ? row.status : null,
    scheduledAt: row.scheduledAt instanceof Date || typeof row.scheduledAt === "string" ? row.scheduledAt : null,
    scheduledEndsAt: row.scheduledEndsAt instanceof Date || typeof row.scheduledEndsAt === "string" ? row.scheduledEndsAt : null,
    scheduleRoom: typeof row.scheduleRoom === "string" ? row.scheduleRoom : null,
    resultVersion: publicScore(row.resultVersion),
    winnerTeamId: typeof row.winnerTeamId === "string" ? row.winnerTeamId : null,
    bestOf: publicScore(row.bestOf),
  };
}

function compatibleRegistration(value: unknown): NonNullable<CompatiblePublicEventInput["registrations"]>[number] {
  const row = record(value);
  const teamRows = teamsFromRaw(row.team);
  return {
    status: typeof row.status === "string" ? row.status : undefined,
    team: teamRows[0] ?? null,
    teamId: typeof row.teamId === "string" ? row.teamId : null,
  };
}

async function compatibilitySnapshot(event: AnyRecord, viewer: PublicViewer, now: Date): Promise<CompatiblePublicEventInput> {
  const eventId = text(event.id);
  const [teams, matches, registrations, completion, publication] = await Promise.all([
    callOptional("team", "findMany", { where: { eventId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    callOptional("match", "findMany", { where: { eventId }, orderBy: [{ round: "asc" }, { slot: "asc" }, { id: "asc" }] }),
    callOptional("teamRegistrationRequest", "findMany", { where: { eventId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    callOptional("tournamentCompletion", "findUnique", { where: { eventId }, include: { podiumPlacements: { orderBy: { rank: "asc" } }, awards: { include: { decision: true } } } }),
    callOptional("certificatePublication", "findFirst", { where: { eventId }, orderBy: { version: "desc" } }),
  ]);
  const publicationRecord = record(publication);
  const rawCertificateIds = publicationRecord.certificateIds;
  const ids = Array.isArray(rawCertificateIds) ? rawCertificateIds.filter((id: unknown): id is string => typeof id === "string") : [];
  const certificates = ids.length
    ? await callOptional("certificate", "findMany", { where: { eventId, id: { in: ids } } })
    : null;
  return {
    event: identityEvent(event),
    viewer,
    now,
    teams: teamsFromRaw(teams),
    matches: Array.isArray(matches) ? matches.map(compatibleMatch) : [],
    registrations: Array.isArray(registrations) ? registrations.map(compatibleRegistration) : [],
    completion: completion && typeof completion === "object" ? completion as CompatiblePublicEventInput["completion"] : null,
    publication: publication && typeof publication === "object" ? publication as CompatiblePublicEventInput["publication"] : null,
    certificates: Array.isArray(certificates) ? certificates.flatMap((value) => {
      const row = record(value);
      const id = text(row.id);
      const type = text(row.type);
      if (!id || !type) return [];
      return [{
        id,
        type,
        recipientKind: typeof row.recipientKind === "string" ? row.recipientKind : null,
        recipientId: typeof row.recipientId === "string" ? row.recipientId : null,
        recipientName: typeof row.recipientName === "string" ? row.recipientName : null,
        publishedUrl: typeof row.publishedUrl === "string" ? row.publishedUrl : null,
        verificationCode: typeof row.verificationCode === "string" ? row.verificationCode : null,
        publishedAt: row.publishedAt instanceof Date || typeof row.publishedAt === "string" ? row.publishedAt : null,
        status: typeof row.status === "string" ? row.status : null,
        completionId: typeof row.completionId === "string" ? row.completionId : null,
        completionVersion: publicScore(row.completionVersion),
      }];
    }) : [],
  };
}

export async function readPublicV3Event(slug: string, viewer: PublicViewer, now = new Date()): Promise<PublicV3EventViewModel | null> {
  let event = await callOptional("event", "findUnique", { where: { slug } });
  if (!event) event = await callOptional("event", "findFirst", { where: { slug } });
  if (!event) return null;
  const row = record(event);
  const status = text(row.status);
  if (!PUBLIC_STATUSES.has(status)) return null;
  let authoritative: unknown = null;
  if (status === "Ongoing") authoritative = await readPublicOngoing(slug, now);
  else if (status === "Finished") authoritative = await readPublicFinished(slug);
  else if (status === "Published") {
    authoritative = await readPublicDrawing(slug);
    if (!authoritative) authoritative = await readPublicRegistration(slug, viewer, now);
  } else if (status === "Registration Closed") {
    authoritative = await readPublicDrawing(slug);
  }
  const authoritativeMode = text(record(authoritative).mode);
  const snapshotTeams = ["registration", "drawing", "ongoing", "finished"].includes(authoritativeMode)
    ? teamsFromRaw(await callOptional("team", "findMany", { where: { eventId: text(row.id) }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }))
    : [];
  const normalized = normalizeAuthoritative(row, authoritative, "authoritative", snapshotTeams);
  if (normalized) return normalized;
  return projectCompatiblePublicV3Event(await compatibilitySnapshot(row, viewer, now));
}
