import { createHash } from "node:crypto";
import { findGameConfig, findGameModeConfig } from "@/lib/platform/config";
import { getRegistrationAvailability, buildRegistrationCta } from "./adaptive-public-event";
import { readPublicOngoing } from "./public-ongoing";
import { prisma } from "@/lib/platform/db";
import { readPublicRegistration } from "./public-registration";
import { readPublicDrawing } from "./public-drawing";
import { readPublicFinished } from "./public-finished";
import { readFlashpeakStatPayload } from "@/lib/player-stats/flashpeak";
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
  const gameId = text(event.gameId, "unknown-game");
  const modeId = text(event.gameModeId, "unknown-mode");
  const game = findGameConfig(gameId);
  const mode = findGameModeConfig(modeId);
  return {
    id: gameId,
    name: text(event.gameName, game?.name ?? gameId),
    modeId,
    modeName: text(event.modeName, mode?.name ?? game?.defaultModeLabel ?? modeId),
  };
}

function statusExplanation(mode: "registration" | "drawing" | "ongoing" | "finished", source: PublicV3DataSource): string {
  if (mode === "registration") return source === "authoritative"
    ? "Pendaftaran event tersedia dengan status dan kapasitas resmi organizer."
    : "Pendaftaran event memakai data yang sudah tersimpan; status kompetisi V3 belum tersedia.";
  if (mode === "drawing") return source === "authoritative"
    ? "Drawing resmi telah diterbitkan organizer. Slot babak berikutnya tetap TBD sampai hasil resmi tersedia."
    : "Drawing belum dipublikasikan organizer. Slot pertandingan tetap TBD sampai hasil resmi tersedia.";
  if (mode === "ongoing") return source === "authoritative"
    ? "Event berlangsung. Hanya jadwal, skor, dan hasil resmi yang ditampilkan."
    : "Event berlangsung berdasarkan pertandingan dan jadwal yang sudah tersimpan; data V3 yang belum dipublikasikan tetap TBD.";
  return source === "authoritative"
    ? "Turnamen selesai. Podium, penghargaan individual, dan hasil di bawah adalah keputusan resmi organizer."
    : "Turnamen selesai berdasarkan hasil yang tersimpan. Podium, penghargaan, dan certificate hanya muncul setelah dipublikasikan.";
}

function navigation(mode: "registration" | "drawing" | "ongoing" | "finished", format: string): PublicV3Navigation {
  const bracket = mode !== "registration" && !/league|round.?robin/i.test(format);
  return {
    overview: true,
    participants: true,
    schedule: mode !== "registration",
    bracket,
    leaderboard: mode === "ongoing" || mode === "finished",
  };
}

function identityFor(
  event: CompatiblePublicEventRecord,
  mode: "registration" | "drawing" | "ongoing" | "finished",
  source: PublicV3DataSource,
  participantCount: number,
): PublicV3Identity {
  const slug = text(event.slug, "");
  const title = text(event.title, text(event.name, slug || "Event"));
  const game = gameIdentity(event);
  const verified = Boolean(event.organizerVerified);
  const cap = Math.max(0, Math.floor(nonNegative(event.participantCap)));
  const venue = text(event.venueAddress, text(event.venue, "Online"));
  const startsAt = isoDate(event.eventStartsAt, text(event.startsAt, "TBD"));
  const organizerName = text(event.organizerName, "Miracle Organizer");
  const contactChannel = text(event.organizerContactChannel);
  const contactValue = text(event.organizerContactValue);
  const cta: PublicV3Cta = mode === "registration"
    ? { label: "register_team", href: `/events/${encodeURIComponent(slug)}/register`, enabled: event.status === "Published" }
    : mode === "drawing"
      ? { label: "view_bracket", href: `/events/${encodeURIComponent(slug)}/bracket`, enabled: true }
      : mode === "ongoing"
        ? { label: "view_live_event", href: `/events/${encodeURIComponent(slug)}`, enabled: true }
        : { label: "view_leaderboard", href: `/events/${encodeURIComponent(slug)}/leaderboards`, enabled: true };
  const nav = navigation(mode, text(event.format));
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
    statusExplanation: statusExplanation(mode, source),
    facts: {
      startsAt,
      timezone: text(event.timezone, "Asia/Jakarta"),
      venue,
      prize: typeof event.prizePoolLabel === "string" ? event.prizePoolLabel : null,
      participants: participantCount,
      participantCap: cap,
      remainingSlots: Math.max(0, cap - participantCount),
    },
    cta,
    navigation: nav,
    poster: {
      eventUrl: text(event.posterUrl, "") || null,
      logoUrl: text(event.logoUrl, "") || null,
      gameImageUrl: text(event.gameImageUrl, "") || null,
    },
    format: text(event.format, "Single Elimination"),
  };
}

function shared(
  event: CompatiblePublicEventRecord,
  mode: "registration" | "drawing" | "ongoing" | "finished",
  source: PublicV3DataSource,
  teams: PublicV3Team[],
  updates: PublicV3Shared["updates"] = [],
): PublicV3Shared {
  const identity = identityFor(event, mode, source, teams.length);
  return {
    source,
    identity,
    event: identity,
    organizer: identity.organizer,
    facts: identity.facts,
    statusExplanation: identity.statusExplanation,
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
  return nonNegative(match.resultVersion) > 0 || ["completed", "Complete", "Completed"].includes(text(match.status));
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
    roundLabel: text(match.roundLabel, match.round ? `Round ${match.round}` : "Match"),
    home: revealParticipants && homeId ? names.get(homeId) ?? homeId : null,
    away: revealParticipants && awayId ? names.get(awayId) ?? awayId : null,
    status,
    homeScore: official ? nonNegative(match.homeScore, 0) : null,
    awayScore: official ? nonNegative(match.awayScore, 0) : null,
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

function registrationInput(event: CompatiblePublicEventRecord, input: CompatiblePublicEventInput, teams: PublicV3Team[], source: PublicV3DataSource): PublicV3EventViewModel {
  const mode = "registration" as const;
  const now = input.now ?? new Date();
  const activeTeamCount = teams.length;
  const pendingReviewCount = (Array.isArray(input.registrations) ? input.registrations : []).filter((row) => text(row.status).toLowerCase() === "pending_review").length;
  const participantCap = Math.floor(nonNegative(event.participantCap));
  const opensAt = dateText(event.registrationOpensAt);
  const closesAt = dateText(event.registrationClosesAt);
  const availability = getRegistrationAvailability({
    status: text(event.status, "Published") as never,
    opensAt: opensAt ? new Date(opensAt) : null,
    closesAt: closesAt ? new Date(closesAt) : null,
    occupiedSlots: activeTeamCount + pendingReviewCount,
    participantCap,
    now,
  });
  const sharedView = shared(event, mode, source, teams);
  const registrationCta = buildRegistrationCta({ state: "anonymous", availability, href: sharedView.identity.cta.href ?? `/events/${encodeURIComponent(sharedView.identity.slug)}/register` });
  const cta: PublicV3Cta = { label: registrationCta.label, href: "href" in registrationCta ? registrationCta.href : null, enabled: registrationCta.enabled, ...( "reason" in registrationCta ? { reason: registrationCta.reason } : {} ) };
  const matches: PublicV3Match[] = [];
  return {
    ...sharedView,
    identity: { ...sharedView.identity, cta }, event: { ...sharedView.event, cta }, cta,
    mode,
    registration: {
      availability,
      opensAt,
      closesAt,
      activeTeamCount,
      pendingReviewCount,
      occupiedSlots: activeTeamCount + pendingReviewCount,
      remainingSlots: Math.max(0, participantCap - activeTeamCount - pendingReviewCount),
      participantCap,
      feeRequired: Boolean(event.registrationFeeRequired),
      feeAmount: typeof event.registrationFeeAmount === "number" ? event.registrationFeeAmount : null,
      feeLabel: text(event.registrationFeeLabel, ""),
      minimumRoster: 1,
      maximumRoster: Math.max(1, Math.floor(nonNegative(findGameModeConfig(text(event.gameModeId))?.maxRosterSize, 1))),
      bracket: { status: "tbd", slots: tbdSlots(matches) },
    },
    viewer: { state: "anonymous", cta: registrationCta },
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

function certificateRows(input: CompatiblePublicEventInput, completion: CompatiblePublicEventInput["completion"]): {
  state: { status: "preparing" | "published"; publishedCount: number; expectedCount: number; isCurrent: boolean; isComplete: boolean; publicationVersion: number | null; };
  items: PublicV3Certificate[];
} {
  const publication = input.publication;
  const ids = Array.isArray(publication?.certificateIds) ? publication!.certificateIds.filter((id): id is string => typeof id === "string") : [];
  const version = completionVersion(completion);
  const current = Boolean(publication && completion?.id && publication.completionId === completion.id && version !== null && publication.completionVersion === version);
  const certificates = (Array.isArray(input.certificates) ? input.certificates : [])
    .filter((certificate) => current && ids.includes(certificate.id) && Boolean(certificate.publishedUrl) && ["ready", "published", ""].includes(text(certificate.status, "published")))
    .filter((certificate) => CERTIFICATE_TYPES.has(certificate.type))
    .map((certificate) => ({
      id: certificate.id,
      type: certificate.type,
      recipientKind: text(certificate.recipientKind, CERTIFICATE_TYPES.has(certificate.type) && ["champion", "runner_up", "third_place"].includes(certificate.type) ? "team" : "player"),
      recipientId: text(certificate.recipientId),
      recipientName: text(certificate.recipientName),
      publishedUrl: text(certificate.publishedUrl),
      verificationCode: text(certificate.verificationCode),
    }));
  const uniqueTypes = new Set(certificates.map((certificate) => certificate.type));
  const complete = current && certificates.length === EXPECTED_CERTIFICATE_COUNT && uniqueTypes.size === EXPECTED_CERTIFICATE_COUNT;
  return {
    state: {
      status: complete ? "published" : "preparing",
      publishedCount: certificates.length,
      expectedCount: EXPECTED_CERTIFICATE_COUNT,
      isCurrent: current,
      isComplete: complete,
      publicationVersion: typeof publication?.version === "number" ? publication.version : null,
    },
    items: complete ? certificates : certificates,
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
  const awards = (completion?.awards ?? []).flatMap((award) => {
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
  });
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
  return event as CompatiblePublicEventRecord;
}

function readerInput(event: AnyRecord, view: unknown): CompatiblePublicEventInput {
  const value = record(view);
  const nestedEvent = record(value.event);
  return { event: { ...identityEvent(event), ...nestedEvent, slug: text(event.slug, text(nestedEvent.slug)), id: text(event.id, text(nestedEvent.id)) } };
}

function normalizeAuthoritative(event: AnyRecord, view: unknown, source: "authoritative"): PublicV3EventViewModel | null {
  const raw = record(view);
  const mode = raw.mode;
  if (!["registration", "drawing", "ongoing", "finished"].includes(text(mode))) return null;
  const eventInput = identityEvent(event);
  const input = readerInput(event, view);
  if (mode === "registration") {
    const registration = record(raw.registration);
    const viewer = record(raw.viewer);
    const teams = teamsFor(input);
    const output = registrationInput(eventInput, { ...input, teams }, teams, source);
    if (output.mode !== "registration") return output;
    return {
      ...output,
      registration: { ...output.registration, ...registration },
      viewer: (raw.viewer as typeof output.viewer) ?? output.viewer,
    };
  }
  if (mode === "drawing") {
    const output = drawingInput(eventInput, input, [], source);
    if (output.mode !== "drawing") return output;
    const drawing = record(raw.drawing);
    return {
      ...output,
      teams: [],
      drawing: {
        ...output.drawing,
        ...drawing,
        published: drawing.published !== false,
        status: "published",
        seeds: Array.isArray(drawing.seeds) ? drawing.seeds as never : [],
        slots: Array.isArray(raw.matches) ? tbdSlots((raw.matches as CompatiblePublicMatch[]).map((match) => publicMatch(match, new Map(), "drawing"))) : output.drawing.slots,
      },
      matches: Array.isArray(raw.matches) ? raw.matches as never : output.matches,
      standings: Array.isArray(raw.standings) ? raw.standings as never : output.standings,
      schedule: (raw.schedule as never) ?? null,
    };
  }
  if (mode === "ongoing") {
    const output = ongoingInput(eventInput, input, [], source);
    if (output.mode !== "ongoing") return output;
    const rawMatches = Array.isArray(raw.matches) ? raw.matches : [];
    return {
      ...output,
      matches: rawMatches as never,
      liveMatches: Array.isArray(raw.liveMatches) ? raw.liveMatches as never : output.liveMatches,
      nextMatches: Array.isArray(raw.nextMatches) ? raw.nextMatches as never : output.nextMatches,
      recentResults: Array.isArray(raw.recentResults) ? raw.recentResults as never : output.recentResults,
      schedule: (raw.schedule as never) ?? null,
      standings: Array.isArray(raw.standings) ? raw.standings as never : output.standings,
      stream: (raw.stream as never) ?? null,
      stateVersion: text(raw.stateVersion, output.stateVersion),
      lastUpdatedAt: text(raw.lastUpdatedAt, output.lastUpdatedAt),
    };
  }
  const output = finishedInput(eventInput, input, [], source);
  if (output.mode !== "finished") return output;
  const rawCertificates = record(raw.certificates);
  const rawPodium = Array.isArray(raw.podium) ? raw.podium : [];
  const rawAwards = Array.isArray(raw.awards) ? raw.awards : [];
  return {
    ...output,
    certificates: {
      ...output.certificates,
      status: rawCertificates.status === "published" ? "published" : output.certificates.status,
      publishedCount: typeof rawCertificates.publishedCount === "number" ? rawCertificates.publishedCount : output.certificates.publishedCount,
      expectedCount: typeof rawCertificates.expectedCount === "number" ? rawCertificates.expectedCount : EXPECTED_CERTIFICATE_COUNT,
      isCurrent: output.certificates.isCurrent || rawCertificates.status === "published",
      isComplete: output.certificates.isComplete || rawCertificates.status === "published",
    },
    podium: rawPodium.length ? rawPodium as never : output.podium,
    awards: rawAwards.length ? rawAwards as never : output.awards,
    matches: Array.isArray(raw.matches) ? raw.matches as never : output.matches,
    standings: Array.isArray(raw.standings) ? raw.standings as never : output.standings,
  };
}

async function callOptional(modelName: string, methodName: string, args: unknown): Promise<unknown> {
  const model = (prisma as unknown as Record<string, unknown>)[modelName] as Record<string, unknown> | undefined;
  const method = model?.[methodName];
  if (typeof method !== "function") return null;
  return (method as (input: unknown) => Promise<unknown>).call(model, args);
}

async function compatibilitySnapshot(event: AnyRecord, viewer: PublicViewer, now: Date): Promise<CompatiblePublicEventInput> {
  const eventId = text(event.id);
  const [teams, matches, registrations, completion, publication] = await Promise.all([
    callOptional("team", "findMany", { where: { eventId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }).catch(() => []),
    callOptional("match", "findMany", { where: { eventId }, orderBy: [{ round: "asc" }, { slot: "asc" }, { id: "asc" }] }).catch(() => []),
    callOptional("teamRegistrationRequest", "findMany", { where: { eventId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }).catch(() => []),
    callOptional("tournamentCompletion", "findUnique", { where: { eventId }, include: { podiumPlacements: { orderBy: { rank: "asc" } }, awards: { include: { decision: true } } } }).catch(() => null),
    callOptional("certificatePublication", "findFirst", { where: { eventId }, orderBy: { version: "desc" } }).catch(() => null),
  ]);
  const publicationRecord = record(publication);
  const rawCertificateIds = publicationRecord.certificateIds;
  const ids = Array.isArray(rawCertificateIds) ? rawCertificateIds.filter((id: unknown): id is string => typeof id === "string") : [];
  const certificates = ids.length
    ? await callOptional("certificate", "findMany", { where: { eventId, id: { in: ids } } }).catch(() => [])
    : [];
  return {
    event: event as CompatiblePublicEventRecord,
    viewer,
    now,
    teams: Array.isArray(teams) ? teams as CompatiblePublicTeam[] : [],
    matches: Array.isArray(matches) ? matches as CompatiblePublicMatch[] : [],
    registrations: Array.isArray(registrations) ? registrations as CompatiblePublicEventInput["registrations"] : [],
    completion: completion as CompatiblePublicEventInput["completion"],
    publication: publication as CompatiblePublicEventInput["publication"],
    certificates: Array.isArray(certificates) ? certificates as CompatiblePublicCertificate[] : [],
  };
}

export async function readPublicV3Event(slug: string, viewer: PublicViewer, now = new Date()): Promise<PublicV3EventViewModel | null> {
  let event = await callOptional("event", "findUnique", { where: { slug } }).catch(() => null);
  if (!event) event = await callOptional("event", "findFirst", { where: { slug } }).catch(() => null);
  if (!event) return null;
  const row = event as AnyRecord;
  const status = text(row.status);
  if (!PUBLIC_STATUSES.has(status)) return null;
  let authoritative: unknown = null;
  try {
    if (status === "Ongoing") authoritative = await readPublicOngoing(slug, now);
    else if (status === "Finished") authoritative = await readPublicFinished(slug);
    else {
      authoritative = await readPublicDrawing(slug);
      if (!authoritative) authoritative = await readPublicRegistration(slug, viewer, now);
    }
  } catch {
    authoritative = null;
  }
  const normalized = normalizeAuthoritative(row, authoritative, "authoritative");
  if (normalized) return normalized;
  return projectCompatiblePublicV3Event(await compatibilitySnapshot(row, viewer, now));
}
