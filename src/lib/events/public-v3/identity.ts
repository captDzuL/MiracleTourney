// Identity and shared fields of a public V3 event.
// Moved out of public-v3-read.ts without changes (refactor Phase 4, 4c-v3read).

import { publicV3RouteTargets } from "@/lib/events/public-v3-types";
import type { CompatiblePublicEventRecord, PublicV3Cta, PublicV3DataSource, PublicV3Identity, PublicV3Shared, PublicV3Team } from "@/lib/events/public-v3-types";
import { gameIdentity, isoDate, navigation, nonNegative, record, statusExplanationCopy, statusExplanationKey, text } from "@/lib/events/public-v3/basics";
import type { AnyRecord } from "@/lib/events/public-v3/basics";
import { publicScore } from "@/lib/events/public-v3/parts";

export function projectPublicV3Identity(
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
      ? roundRobin ? routes.standings : routes.bracket
      : mode === "ongoing"
        ? routes.overview
        : routes.leaderboard;
  const cta: PublicV3Cta = {
    kind: mode === "registration" ? "start" : "link",
    label: mode === "registration"
      ? "register_team"
      : mode === "drawing"
        ? roundRobin ? "view_standings" : "view_bracket"
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

export function shared(
  event: CompatiblePublicEventRecord,
  mode: "registration" | "drawing" | "ongoing" | "finished",
  source: PublicV3DataSource,
  teams: PublicV3Team[],
  updates: PublicV3Shared["updates"] = [],
  participantCount = teams.length,
): PublicV3Shared {
  const identity = projectPublicV3Identity(event, mode, source, participantCount);
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

export function identityEvent(event: AnyRecord): CompatiblePublicEventRecord {
  return {
    id: text(event.id),
    entryMode: typeof event.entryMode === "string" ? event.entryMode : null,
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
