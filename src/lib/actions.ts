"use server";

import { createHash } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";

import { redirectToActiveLocale } from "@/i18n/redirect";
import { prisma } from "@/lib/platform/db";
import { requireRole } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { parsePlayerStatForm } from "@/lib/player-stats/form";
import type { AppUser } from "@/lib/platform/types";
import { toSafeActionMessage } from "@/lib/security/public-error";
import { setMatchResult } from "@/lib/bracket/repository";
import { setMatchGames, upsertRoundConfig } from "@/lib/bracket/rounds-repository";
import { autoTransitionEventToOngoing } from "@/lib/events/repository";
import { assertUserCanManageEvent, assertUserCanManageTeam, assertUserCanReviewStatSubmission } from "@/lib/platform/shared/authz";
import { assertCaptainCanSubmitStats, getPlayerStatFormContext } from "@/lib/player-stats/repository";
import { approveStatSubmission, rejectStatSubmission, upsertStatSubmission, adminWriteMatchPlayerStats } from "@/lib/player-stats/write-repository";
import { addPlayer, deletePlayer, updateTeamLogo, updateCaptainTeamLogo, updatePlayer, setTeamCaptainDisplay } from "@/lib/teams/repository";
import { assertWorkspaceEventAction, requireAdminSession, requireCaptainSession } from "@/lib/actions/shared/session";
import { actionEntityId, redirectToRequestedLocale } from "@/lib/actions/shared/request";
import { MAX_LOGO_IMAGE_BYTES } from "@/lib/actions/shared/limits";
import { uploadImageAsset } from "@/lib/actions/shared/uploads";



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

export async function captainUploadTeamLogoAction(formData: FormData) {
  const captain = await requireCaptainSession();

  let team: { id: string; eventId: string | null } | null = null;
  let teamId = "";
  try {
    teamId = actionEntityId.parse(formData.get("teamId"));
    team = await prisma.team.findFirst({
      where: { id: teamId, captainId: captain.id },
      select: { id: true, eventId: true },
    });
    if (!team || !team.eventId) throw new Error("Not authorized");
  } catch (err) {
    const message = toSafeActionMessage(err, "Upload failed");
    return await redirectToActiveLocale(`/captain?tab=roster&error=${encodeURIComponent(message)}`);
  }

  if (!(await checkRateLimit(`team-logo:${captain.id}:${team.eventId}:${team.id}`, 5, 15 * 60 * 1000))) {
    await redirectToActiveLocale("/captain?tab=roster&error=rate-limited");
  }

  try {
    const asset = await uploadImageAsset({
      file: formData.get("teamLogo"),
      folder: "team-logos",
      entityId: teamId,
      label: "Team logo",
      maxBytes: MAX_LOGO_IMAGE_BYTES,
      errorPath: "/captain?tab=roster",
    });
    await updateCaptainTeamLogo(captain.id, teamId, asset.url);
  } catch (err) {
    const message = toSafeActionMessage(err, "Upload failed");
    return await redirectToActiveLocale(`/captain?tab=roster&error=${encodeURIComponent(message)}`);
  }

  revalidateTag("teams");
  revalidatePath("/captain");
  await redirectToActiveLocale("/captain?tab=roster&success=team-logo-updated");
}

/** Adds a player to the captain's team. UID and IGN are required; position is optional. */
export async function captainAddPlayerAction(formData: FormData) {
  const captain = await requireCaptainSession();

  const input = z.object({
    teamId: actionEntityId,
    eventId: actionEntityId.optional(),
    displayName: z.string().trim().min(2, "UID minimal 2 karakter."),
    nickname: z.string().trim().min(2, "IGN minimal 2 karakter."),
    position: z.string().trim().optional(),
  }).parse({
    teamId: formData.get("teamId"),
    eventId: String(formData.get("eventId") ?? "") || undefined,
    displayName: formData.get("displayName"),
    nickname: formData.get("nickname"),
    position: String(formData.get("position") ?? ""),
  });

  const jerseyRaw = formData.get("jerseyNumber");
  const jerseyNumber =
    jerseyRaw && String(jerseyRaw).trim() !== ""
      ? parseInt(String(jerseyRaw), 10)
      : undefined;

  try {
    await addPlayer({ ...input, captainId: captain.id, position: input.position ?? "", jerseyNumber });
  } catch (e) {
    const msg = toSafeActionMessage(e, "Tidak dapat menambahkan pemain.");
    return await redirectToActiveLocale("/captain?error=" + encodeURIComponent(msg));
  }
  await redirectToActiveLocale("/captain?success=player-added");
}

/**
 * Updates a player's profile. Ownership is enforced server-side via the captain's session ID;
 * the action redirects with an error if the player does not belong to the authenticated captain.
 */
export async function captainUpdatePlayerAction(formData: FormData) {
  const user = await requireCaptainSession();

  const id = actionEntityId.parse(formData.get("playerId"));
  const jerseyRaw = formData.get("jerseyNumber");
  const jerseyNumber =
    jerseyRaw && String(jerseyRaw).trim() !== ""
      ? parseInt(String(jerseyRaw), 10)
      : null;

  const data = {
    displayName: z.string().trim().min(2).parse(formData.get("displayName")),
    nickname: z.string().trim().min(2).parse(formData.get("nickname")),
    position: String(formData.get("position") ?? "").trim(),
    jerseyNumber: jerseyNumber ?? undefined,
  };

  try {
    await updatePlayer(id, user.id, data);
  } catch {
    await redirectToActiveLocale("/captain?error=Tidak+dapat+mengedit+pemain+ini.");
  }

  revalidatePath("/captain");
  await redirectToActiveLocale("/captain?success=player-updated");
}

/**
 * Removes a player. Ownership check is delegated to the repository layer;
 * any exception redirects to /captain with an error message.
 */
export async function captainDeletePlayerAction(formData: FormData) {
  const user = await requireCaptainSession();
  const id = actionEntityId.parse(formData.get("playerId"));

  try {
    await deletePlayer(id, user.id);
  } catch {
    await redirectToActiveLocale("/captain?error=Tidak+dapat+menghapus+pemain+ini.");
  }

  revalidatePath("/captain");
  await redirectToActiveLocale("/captain?success=player-deleted");
}

export async function captainSetDisplayCaptainAction(formData: FormData) {
  const user = await requireCaptainSession();
  const teamId = actionEntityId.parse(formData.get("teamId"));
  const playerId = actionEntityId.parse(formData.get("playerId"));

  try {
    await setTeamCaptainDisplay(teamId, user.id, playerId);
  } catch {
    return await redirectToActiveLocale("/captain?error=" + encodeURIComponent("Tidak dapat mengubah tampilan kapten."));
  }

  revalidatePath("/", "layout");
  await redirectToActiveLocale("/captain?success=captain-display-updated");
}

/** Deletes a team from a Draft-status event. Blocks if event has started. */
export async function adminDeleteTeamAction(formData: FormData) {
  const user = await requireAdminSession();
  const teamId = actionEntityId.parse(formData.get("teamId"));

  let access: { eventId: string };
  try {
    access = await assertUserCanManageTeam(user, teamId);
    assertWorkspaceEventAction(user, access.eventId);
  } catch {
    return redirectToActiveLocale(`/admin?error=${encodeURIComponent("Tim tidak ditemukan.")}` as never);
  }

  const team = await prisma.team.findFirst({
    where: { id: teamId, eventId: access.eventId },
    include: { event: { select: { id: true, status: true } } },
  });
  if (!team?.event || !team.eventId) {
    return redirectToActiveLocale(`/admin?error=${encodeURIComponent("Tim tidak ditemukan.")}` as never);
  }
  if (team.event.status !== "Draft") {
    return redirectToActiveLocale(
      `/admin?error=${encodeURIComponent("Tim hanya dapat dihapus dari event Draft.")}` as never
    );
  }
  await prisma.team.delete({ where: { id: teamId } });
  revalidatePath("/", "layout");
  return redirectToActiveLocale("/admin?success=team-deleted" as never);
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

export async function adminUploadTeamLogoAction(formData: FormData) {
  const user = await requireAdminSession();
  const teamId = actionEntityId.parse(formData.get("teamId"));

  let eventId = "";
  try {
    ({ eventId } = await assertUserCanManageTeam(user, teamId));
    assertWorkspaceEventAction(user, eventId);
  } catch (err) {
    const message = toSafeActionMessage(err, "Upload failed");
    await redirectToActiveLocale(`/admin?error=${encodeURIComponent(message)}`);
  }

  if (!(await checkRateLimit(`team-logo:${user.id}:${eventId}:${teamId}`, 5, 15 * 60 * 1000))) {
    await redirectToActiveLocale("/admin?error=rate-limited");
  }

  try {
    const asset = await uploadImageAsset({
      file: formData.get("teamLogo"),
      folder: "team-logos",
      entityId: teamId,
      label: "Team logo",
      maxBytes: MAX_LOGO_IMAGE_BYTES,
    });
    await updateTeamLogo(user, teamId, asset.url);
  } catch (err) {
    const message = toSafeActionMessage(err, "Upload failed");
    await redirectToActiveLocale(`/admin?error=${encodeURIComponent(message)}`);
  }

  revalidateTag("teams");
  revalidatePath("/", "layout");
  await redirectToActiveLocale(`/admin?success=team-logo-uploaded`);
}

/**
 * Re-renders the champion certificate for an event, replacing whatever is stored.
 *
 * Used to recover from a failed generation (headless Chromium is the usual culprit) and to pick up
 * a new accent color or character art. Rate limited because each run boots a browser.
 */
export async function adminRegenerateCertificateAction(formData: FormData) {
  const user = await requireAdminSession();
  const eventId = actionEntityId.parse(formData.get("eventId"));
  await assertUserCanManageEvent(user, eventId);
  assertWorkspaceEventAction(user, eventId);

  if (!(await checkRateLimit(`cert-regen:${eventId}`, 3, 5 * 60 * 1000))) {
    await redirectToActiveLocale(
      `/admin?error=${encodeURIComponent("Terlalu banyak percobaan. Coba lagi dalam beberapa menit.")}`,
    );
  }

  const finalMatch = await prisma.match.findFirst({
    where: { eventId, roundLabel: "Final", winnerTeamId: { not: null } },
  });
  const winnerTeamId = finalMatch?.winnerTeamId;
  if (!winnerTeamId) {
    await redirectToActiveLocale(
      `/admin?error=${encodeURIComponent("Belum ada juara. Simpan hasil match Final terlebih dahulu.")}`,
    );
    return;
  }

  try {
    const { generateCertificate } = await import("@/lib/certificate/generate");
    await generateCertificate(eventId, winnerTeamId);
  } catch (err) {
    const message = toSafeActionMessage(err, "Certificate generation failed");
    revalidatePath("/admin");
    await redirectToActiveLocale(`/admin?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/admin");
  await redirectToActiveLocale(`/admin?success=certificate-regenerated`);
}

