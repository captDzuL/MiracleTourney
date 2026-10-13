"use server";

// Server actions for match results, round config, match games and player stats.
// Moved out of lib/actions.ts without changes (refactor PR 3.7).

import { redirectToActiveLocale } from "@/i18n/redirect";
import { actionEntityId, redirectToRequestedLocale } from "@/lib/actions/shared/request";
import { assertWorkspaceEventAction, requireAdminSession } from "@/lib/actions/shared/session";
import { requireRole } from "@/lib/auth/session";
import { setMatchResult } from "@/lib/bracket/repository";
import { setMatchGames, upsertRoundConfig } from "@/lib/bracket/rounds-repository";
import { autoTransitionEventToOngoing } from "@/lib/events/repository";
import { assertUserCanManageEvent, assertUserCanReviewStatSubmission } from "@/lib/platform/shared/authz";
import type { AppUser } from "@/lib/platform/types";
import { parsePlayerStatForm } from "@/lib/player-stats/form";
import { assertCaptainCanSubmitStats, getPlayerStatFormContext } from "@/lib/player-stats/repository";
import { adminWriteMatchPlayerStats, approveStatSubmission, rejectStatSubmission, upsertStatSubmission } from "@/lib/player-stats/write-repository";
import { toSafeActionMessage } from "@/lib/security/public-error";
import { revalidatePath, revalidateTag } from "next/cache";
import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * Generates the champion certificate for a finished Final.
 *
 * Never throws: certificate rendering depends on a headless browser and remote storage, and a
 * failure there must not roll back the match result the admin just saved. The failure is persisted
 * on the certificate row by the generator itself, and the admin panel offers a retry.
 */
async function generateCertificateForFinalMatch(matchId: string, eventId: string) {
  try {
    const { generateCertificateIfFinal } = await import("@/lib/certificate/generate");
    await generateCertificateIfFinal(matchId, eventId);
  } catch {
    console.error("Certificate generation failed", { eventIdHash: createHash("sha256").update(eventId).digest("hex").slice(0, 16) });
  }
}

/**
 * Records a BO1 match result (direct home/away score). Also auto-transitions the event
 * status from Published/Registration Closed to Ongoing if it hasn't been set yet.
 */
// Destination is selected by the authenticated role, never a client return URL.
// Callers authorize the mutation event before using this fixed route family.
function legacyMatchReturn(user: AppUser, eventId: string, matchId: string | undefined, feedback: string, success = false) {
  return user.role === "organizer"
    ? `/organizer/events/${encodeURIComponent(eventId)}/legacy-match-day?${matchId ? `matchId=${encodeURIComponent(matchId)}&` : ""}${feedback}`
    : `/admin?${success ? "phase=run&" : ""}matchEventId=${encodeURIComponent(eventId)}&${feedback}`;
}

export async function adminUpdateMatchResultAction(formData: FormData) {
  const user = await requireAdminSession();
  const locale = formData.get("locale")?.toString();

  const matchEventId = actionEntityId.parse(formData.get("matchEventId"));
  const input = z.object({
    eventId: actionEntityId,
    matchId: actionEntityId,
    homeScore: z.coerce.number().int().min(0),
    awayScore: z.coerce.number().int().min(0),
  }).parse({
    eventId: formData.get("eventId"),
    matchId: formData.get("matchId"),
    homeScore: formData.get("homeScore"),
    awayScore: formData.get("awayScore"),
  });

  await assertUserCanManageEvent(user, input.eventId);
  assertWorkspaceEventAction(user, input.eventId);

  let match;
  const returnEventId = user.role === "organizer" ? input.eventId : matchEventId;

  try {
    match = await setMatchResult(input);
  } catch (error) {
    const message = toSafeActionMessage(error, "Unable to save match result.");
    await redirectToRequestedLocale(legacyMatchReturn(user, returnEventId, input.matchId, `error=${encodeURIComponent(message)}`), locale);
  }

  if (!match) await redirectToRequestedLocale(legacyMatchReturn(user, returnEventId, input.matchId, "error=Match%20not%20found."), locale);
  await autoTransitionEventToOngoing(input.eventId);
  if (match?.roundLabel === "Final" && match.winnerTeamId) {
    try {
      await generateCertificateForFinalMatch(match.id, input.eventId);
    } catch {
      console.error("[certificate] generation failed");
    }
  }
  revalidateTag("teams");
  revalidateTag("events");
  revalidatePath("/", "layout");
  await redirectToRequestedLocale(legacyMatchReturn(user, returnEventId, input.matchId, "success=match-result-updated", true), locale);
}

/**
 * Submits per-player match statistics for a captain's team.
 * Stat keys are parsed from form fields matching the pattern `stat_{playerId}_{statKey}`.
 * Non-numeric values default to 0.
 */
export async function captainSubmitStatsAction(formData: FormData) {
  const user = await requireRole("captain");
  if (!user) {
    return redirectToActiveLocale("/login");
  }

  const { matchId, teamId, eventId } = z.object({
    matchId: actionEntityId,
    teamId: actionEntityId,
    eventId: actionEntityId,
  }).parse({
    matchId: formData.get("matchId"),
    teamId: formData.get("teamId"),
    eventId: formData.get("eventId"),
  });

  await assertCaptainCanSubmitStats({ captainId: user.id, matchId, teamId, eventId });
  const context = await getPlayerStatFormContext(matchId, eventId);
  const stats = parsePlayerStatForm(formData, {
    allowedStatKeys: context.allowedStatKeys,
    scoreSlotCount: context.scoreGameNumbers?.length ?? null,
  });
  await upsertStatSubmission({ matchId, teamId, eventId, submittedBy: user.id, stats });
  revalidatePath("/captain/stats");
}

/** Approves a captain's stat submission, making it visible on the public leaderboard. */
export async function adminApproveStatAction(formData: FormData) {
  const user = await requireAdminSession();
  const submissionId = actionEntityId.parse(formData.get("submissionId"));
  await assertUserCanReviewStatSubmission(user, submissionId);
  await approveStatSubmission(submissionId, user.id);
  revalidatePath("/", "layout");
  await redirectToActiveLocale("/admin?success=stat-approved");
}

/** Rejects a stat submission with an optional rejection note shown to the captain. Defaults to "Please review and resubmit." if no note is provided. */
export async function adminRejectStatAction(formData: FormData) {
  const user = await requireAdminSession();
  const submissionId = actionEntityId.parse(formData.get("submissionId"));
  const note =
    (formData.get("rejectionNote") as string)?.trim() || "Please review and resubmit.";
  await assertUserCanReviewStatSubmission(user, submissionId);
  await rejectStatSubmission(submissionId, user.id, note);
  revalidatePath("/", "layout");
  await redirectToActiveLocale("/admin?success=stat-rejected");
}

/**
 * Writes player match statistics directly from the Admin page.
 * Bypasses the captain submission queue and upserts PlayerStat rows immediately.
 * Only allowed for Completed matches. Uses the same validation as the captain flow.
 */
export async function adminSaveMatchPlayerStatsAction(formData: FormData) {
  const user = await requireAdminSession();

  const { matchId, teamId, eventId } = z.object({
    matchId: actionEntityId,
    teamId: actionEntityId,
    eventId: actionEntityId,
  }).parse({
    matchId: formData.get("matchId"),
    teamId: formData.get("teamId"),
    eventId: formData.get("eventId"),
  });

  await assertUserCanManageEvent(user, eventId);
  assertWorkspaceEventAction(user, eventId);

  const context = await getPlayerStatFormContext(matchId, eventId);
  const match = context.match;
  if (match.homeTeamId !== teamId && match.awayTeamId !== teamId) throw new Error("Team is not part of this match");
  if (match.eventId !== eventId) throw new Error("Match does not belong to this event");

  const stats = parsePlayerStatForm(formData, {
    allowedStatKeys: context.allowedStatKeys,
    scoreSlotCount: context.scoreGameNumbers?.length ?? null,
  });

  await adminWriteMatchPlayerStats({ matchId, teamId, eventId, adminId: user.id, stats });
  revalidateTag("stats");
  revalidatePath("/", "layout");
  await redirectToActiveLocale(`/admin?phase=run&activeEventId=${eventId}&matchId=${matchId}&success=player-stats-saved`);
}

/** Sets the Best-of-N configuration for a specific round label in an event. Valid bestOf values are 1, 3, or 5. */
export async function adminSetRoundConfigAction(formData: FormData) {
  const user = await requireAdminSession();
  const locale = formData.get("locale")?.toString();

  const input = z.object({
    eventId: actionEntityId,
    roundLabel: z.string().min(1),
    bestOf: z.coerce.number().int().refine((n) => [1, 3, 5].includes(n), { message: "bestOf must be 1, 3, or 5" }),
  }).parse({
    eventId: formData.get("eventId"),
    roundLabel: formData.get("roundLabel"),
    bestOf: formData.get("bestOf"),
  });

  await assertUserCanManageEvent(user, input.eventId);
  assertWorkspaceEventAction(user, input.eventId);
  try {
    await upsertRoundConfig(input.eventId, input.roundLabel, input.bestOf);
  } catch (error) {
    const message = toSafeActionMessage(error, "Unable to save round configuration.");
    await redirectToRequestedLocale(legacyMatchReturn(user, input.eventId, undefined, `error=${encodeURIComponent(message)}`), locale);
  }
  revalidateTag("teams");
  revalidatePath("/", "layout");
  await redirectToRequestedLocale(legacyMatchReturn(user, input.eventId, undefined, "success=round-config-saved", true), locale);
}

/**
 * Records per-game scores for a Best-of-N match. Form fields follow the pattern
 * `game{N}_home` / `game{N}_away`; empty rows are skipped. At least one game score
 * must be provided. Also auto-transitions the event to Ongoing if needed.
 */
export async function adminSetMatchGamesAction(formData: FormData) {
  const user = await requireAdminSession();
  const locale = formData.get("locale")?.toString();

  const matchId = actionEntityId.parse(formData.get("matchId"));
  const matchEventId = actionEntityId.parse(formData.get("matchEventId"));
  // The hidden value is only a render-integrity hint. The repository resolves
  // the authoritative rule from this match's event and round in one transaction.
  z.coerce.number().int().refine((n) => [1, 3, 5].includes(n), { message: "bestOf must be 1, 3, or 5" }).parse(formData.get("bestOf"));
  await assertUserCanManageEvent(user, matchEventId);
  assertWorkspaceEventAction(user, matchEventId);

  const games: { gameNumber: number; homeScore: number; awayScore: number }[] = [];
  for (let i = 1; i <= 5; i++) {
    const homeRaw = formData.get(`game${i}_home`);
    const awayRaw = formData.get(`game${i}_away`);
    if (homeRaw === null || homeRaw === "" || awayRaw === null || awayRaw === "") continue;
    const homeScore = z.coerce.number().int().min(0).parse(homeRaw);
    const awayScore = z.coerce.number().int().min(0).parse(awayRaw);
    games.push({ gameNumber: i, homeScore, awayScore });
  }

  if (games.length === 0) {
    await redirectToRequestedLocale(legacyMatchReturn(user, matchEventId, matchId, "error=Masukkan+skor+minimal+1+game."), locale);
    return;
  }

  try {
    await setMatchGames(matchId, matchEventId, games);
  } catch (error) {
    const message = toSafeActionMessage(error, "Unable to save match games.");
    await redirectToRequestedLocale(legacyMatchReturn(user, matchEventId, matchId, `error=${encodeURIComponent(message)}`), locale);
  }

  await autoTransitionEventToOngoing(matchEventId);
  try {
    await generateCertificateForFinalMatch(matchId, matchEventId);
  } catch {
    console.error("[certificate] generation failed");
  }
  revalidateTag("teams");
  revalidateTag("events");
  revalidatePath("/", "layout");
  await redirectToRequestedLocale(legacyMatchReturn(user, matchEventId, matchId, "success=match-games-saved", true), locale);
}
