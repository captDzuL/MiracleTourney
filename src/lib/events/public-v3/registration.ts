// Registration state and call to action of a public V3 event.
// Moved out of public-v3-read.ts without changes (refactor Phase 4, 4c-v3read).

import { buildRegistrationCta, getRegistrationAvailability } from "@/lib/events/adaptive-public-event";
import type { RegistrationAvailability, RegistrationCta, RegistrationViewerState } from "@/lib/events/adaptive-public-event";
import { publicV3LocalizedHref } from "@/lib/events/public-v3-types";
import type { CompatiblePublicEventInput, CompatiblePublicEventRecord, PublicV3Cta, PublicV3DataSource, PublicV3EventViewModel, PublicV3Match, PublicV3Team } from "@/lib/events/public-v3-types";
import { dateText, nonNegative, record, text } from "@/lib/events/public-v3/basics";
import type { AnyRecord } from "@/lib/events/public-v3/basics";
import { shared } from "@/lib/events/public-v3/identity";
import { leaderboardFor, registrationTemplateSlots } from "@/lib/events/public-v3/parts";
import { compatibleUpdates } from "@/lib/events/public-v3/updates";
import { findGameModeConfig } from "@/lib/platform/config";

export const REGISTRATION_STATES: RegistrationViewerState[] = [
  "anonymous", "wrong_role", "eligible_without_team", "eligible_with_team",
  "draft_incomplete", "pending_payment", "pending_review", "rejected",
  "expired", "approved",
];

export function registrationState(value: unknown): RegistrationViewerState {
  const candidate = text(value);
  return REGISTRATION_STATES.includes(candidate as RegistrationViewerState)
    ? candidate as RegistrationViewerState
    : "anonymous";
}

export function registrationAvailability(value: unknown, fallback: RegistrationAvailability): RegistrationAvailability {
  const candidate = text(value);
  return ["upcoming", "open", "full", "closed", "legacy"].includes(candidate)
    ? candidate as RegistrationAvailability
    : fallback;
}

export function mapRegistrationCta(value: unknown, fallback: RegistrationCta): RegistrationCta {
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

export function publicCta(cta: RegistrationCta): PublicV3Cta {
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

export function registrationInput(event: CompatiblePublicEventRecord, input: CompatiblePublicEventInput, teams: PublicV3Team[], source: PublicV3DataSource): PublicV3EventViewModel {
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
  const sharedView = shared(event, mode, source, teams, compatibleUpdates(input), activeTeamCount);
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
      bracket: { status: "tbd", slots: registrationTemplateSlots(participantCap) },
    },
    viewer: { state: registrationState((input as AnyRecord).viewerState), cta: registrationCta },
    matches,
    leaderboard: leaderboardFor(input),
  };
}
