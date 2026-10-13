// Normalization of authoritative event data into the public V3 shape.
// Moved out of public-v3-read.ts without changes (refactor Phase 4, 4c-v3read).

import type { CompatiblePublicEventInput, CompatiblePublicTeam, PublicV3Certificate, PublicV3EventViewModel, PublicV3Shared } from "@/lib/events/public-v3-types";
import { authoritativeBracketSlots, authoritativeCertificate, authoritativeDrawingSchedule, authoritativeDrawingStandings, authoritativeLeaderboard, authoritativeMatches, authoritativeOngoingSchedule, authoritativeOngoingStandings, authoritativeRegistrationCta, authoritativeSeeds, authoritativeStream, normalizedUpdates, teamsFromRaw } from "@/lib/events/public-v3/authoritative";
import { AWARD_ORDER, EXPECTED_CERTIFICATE_COUNT, dateText, isoDate, nonNegative, record, text } from "@/lib/events/public-v3/basics";
import type { AnyRecord } from "@/lib/events/public-v3/basics";
import { identityEvent } from "@/lib/events/public-v3/identity";
import { publicScore, teamsFor } from "@/lib/events/public-v3/parts";
import { certificatePublicationIsComplete, drawingInput, finishedInput, ongoingInput } from "@/lib/events/public-v3/phases";
import { registrationInput } from "@/lib/events/public-v3/registration";

export function readerInput(event: AnyRecord, view: unknown): CompatiblePublicEventInput {
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

export function normalizeAuthoritative(
  event: AnyRecord,
  view: unknown,
  source: "authoritative",
  snapshotTeams: CompatiblePublicTeam[] = [],
  persistedUpdates: PublicV3Shared["updates"] = [],
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
    return { ...output, updates: normalizedUpdates(raw, persistedUpdates), viewer: { state: viewer.state, cta: viewer.cta } };
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
      updates: normalizedUpdates(raw, persistedUpdates),
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
      updates: normalizedUpdates(raw, persistedUpdates),
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
    awards: awardsWithCertificates.map((entry) => ({ ...entry, certificate: complete ? certificateByType.get(entry.type) ?? null : null })),
    matches,
    standings: authoritativeDrawingStandings(raw.standings),
    leaderboard: authoritativeLeaderboard(raw.leaderboard),
    updates: normalizedUpdates(raw, persistedUpdates),
  };
}
