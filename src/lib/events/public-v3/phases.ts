// Drawing, ongoing and finished phase inputs of a public V3 event.
// Moved out of public-v3-read.ts without changes (refactor Phase 4, 4c-v3read).

import type { CompatiblePublicEventInput, CompatiblePublicEventRecord, PublicV3Certificate, PublicV3DataSource, PublicV3EventViewModel, PublicV3Team } from "@/lib/events/public-v3-types";
import { podiumCertificateType, requiredCertificateTypes } from "@/lib/certificate/templates/miracle-v3-contract";
import { AWARD_ORDER, CERTIFICATE_TYPES, record, text } from "@/lib/events/public-v3/basics";
import { shared } from "@/lib/events/public-v3/identity";
import { leaderboardFor, publicMatch, tbdSlots, teamNames } from "@/lib/events/public-v3/parts";
import { compatibleUpdates } from "@/lib/events/public-v3/updates";
import { createHash } from "node:crypto";

export function drawingInput(event: CompatiblePublicEventRecord, input: CompatiblePublicEventInput, teams: PublicV3Team[], source: PublicV3DataSource): PublicV3EventViewModel {
  const mode = "drawing" as const;
  const names = teamNames(input);
  const matches = (Array.isArray(input.matches) ? input.matches : []).map((match) => publicMatch(match, names, mode));
  const sharedView = shared(event, mode, source, teams, compatibleUpdates(input));
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

export function ongoingInput(event: CompatiblePublicEventRecord, input: CompatiblePublicEventInput, teams: PublicV3Team[], source: PublicV3DataSource): PublicV3EventViewModel {
  const mode = "ongoing" as const;
  const names = teamNames(input);
  const matches = (Array.isArray(input.matches) ? input.matches : []).map((match) => publicMatch(match, names, mode));
  const sharedView = shared(event, mode, source, teams, compatibleUpdates(input));
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

export function completionVersion(completion: CompatiblePublicEventInput["completion"]): number | null {
  const version = record(completion?.sourceSnapshot).version;
  return Number.isSafeInteger(version) && Number(version) >= 0 ? Number(version) : null;
}

export function certificatePublicationIsComplete(input: {
  published: boolean;
  completionCompleted: boolean;
  expectedCount: number;
  /** Types the set must contain: seven, or six when the podium has no third place. */
  requiredTypes: readonly string[];
  publicationIds: string[];
  certificates: PublicV3Certificate[];
}): boolean {
  const required = input.requiredTypes.length;
  const types = new Set(input.certificates.map((certificate) => certificate.type));
  const ids = new Set(input.publicationIds);
  return input.published
    && input.completionCompleted
    && input.expectedCount === required
    && input.publicationIds.length === required
    && ids.size === required
    && input.certificates.length === required
    && types.size === required
    && input.certificates.every((certificate) => CERTIFICATE_TYPES.has(certificate.type))
    && input.requiredTypes.every((type) => types.has(type));
}

function completionPodiumRanks(completion: CompatiblePublicEventInput["completion"]): number[] {
  return (completion?.podiumPlacements ?? completion?.podium ?? []).map(({ rank }) => rank);
}

export function certificateRows(input: CompatiblePublicEventInput, completion: CompatiblePublicEventInput["completion"]): {
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
  const requiredTypes = requiredCertificateTypes(completionPodiumRanks(completion));
  const complete = certificatePublicationIsComplete({
    published: current,
    completionCompleted: completion?.status === "completed",
    expectedCount: requiredTypes.length,
    requiredTypes,
    publicationIds: ids,
    certificates,
  });
  return {
    state: {
      status: complete ? "published" : "preparing",
      publishedCount: complete ? certificates.length : 0,
      expectedCount: requiredTypes.length,
      isCurrent: current,
      isComplete: complete,
      publicationVersion: typeof publication?.version === "number" ? publication.version : null,
    },
    items: complete ? certificates : [],
  };
}

export function finishedInput(event: CompatiblePublicEventRecord, input: CompatiblePublicEventInput, teams: PublicV3Team[], source: PublicV3DataSource): PublicV3EventViewModel {
  const mode = "finished" as const;
  const names = teamNames(input);
  const matches = (Array.isArray(input.matches) ? input.matches : []).map((match) => publicMatch(match, names, mode));
  const sharedView = shared(event, mode, source, teams, compatibleUpdates(input));
  const completion = input.completion;
  const rows = certificateRows(input, completion);
  const byType = new Map(rows.items.map((certificate) => [certificate.type, certificate]));
  const completionCompleted = completion?.status === "completed";
  const podiumRows = completionCompleted ? completion?.podiumPlacements ?? completion?.podium ?? [] : [];
  const podium = podiumRows.map((placement) => ({
    rank: placement.rank,
    teamId: placement.teamId,
    teamName: placement.teamName,
    certificate: byType.get(podiumCertificateType(placement.rank)) ?? null,
  }));
  const awards = completionCompleted
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
