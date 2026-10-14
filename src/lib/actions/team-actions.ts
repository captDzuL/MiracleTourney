"use server";

// Server actions for teams and players: logo, roster, display captain, delete team.
// Moved out of lib/actions.ts without changes (refactor PR 3.6).

import { redirectToActiveLocale } from "@/i18n/redirect";
import { MAX_LOGO_IMAGE_BYTES, MAX_LOGO_IMAGE_DIMENSION } from "@/lib/actions/shared/limits";
import { actionEntityId } from "@/lib/actions/shared/request";
import { assertWorkspaceEventAction, requireAdminSession, requireCaptainSession } from "@/lib/actions/shared/session";
import { uploadImageAsset } from "@/lib/actions/shared/uploads";
import { assertUserCanManageTeam } from "@/lib/platform/shared/authz";
import { checkRateLimit } from "@/lib/rate-limit";
import { toSafeActionMessage } from "@/lib/security/public-error";
import { addPlayer, deletePlayer, deleteTeam, findCaptainTeamRef, getTeamForDeletion, setTeamCaptainDisplay, updateCaptainTeamLogo, updatePlayer, updateTeamLogo } from "@/lib/teams/repository";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";

export async function captainUploadTeamLogoAction(formData: FormData) {
  const captain = await requireCaptainSession();

  let team: { id: string; eventId: string | null } | null = null;
  let teamId = "";
  try {
    teamId = actionEntityId.parse(formData.get("teamId"));
    team = await findCaptainTeamRef(teamId, captain.id);
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
      maxDimension: MAX_LOGO_IMAGE_DIMENSION,
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

  const team = await getTeamForDeletion(teamId, access.eventId);
  if (!team) {
    return redirectToActiveLocale(`/admin?error=${encodeURIComponent("Tim tidak ditemukan.")}` as never);
  }
  if (team.eventStatus !== "Draft") {
    return redirectToActiveLocale(
      `/admin?error=${encodeURIComponent("Tim hanya dapat dihapus dari event Draft.")}` as never
    );
  }
  await deleteTeam(teamId);
  revalidatePath("/", "layout");
  return redirectToActiveLocale("/admin?success=team-deleted" as never);
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
      maxDimension: MAX_LOGO_IMAGE_DIMENSION,
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
