"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";

import { redirectToActiveLocale } from "@/i18n/redirect";
import { requireAnyRole, requireRole } from "@/lib/auth/session";
import type { ActorContext } from "@/modules/identity";
import { ConflictError, NotFoundError, toActorContext, toEventReadActorCompatibility } from "@/modules/identity";

import {
  addPlayer,
  assertCaptainCanManageTeam,
  assertActorCanManageTeam,
  assignCaptainForActor,
  deletePlayer,
  deleteTeamForActor,
  setTeamCaptainDisplay,
  updateCaptainTeamLogo,
  updatePlayer,
  updateTeamLogoForActor,
} from "./service";
import { uploadTeamLogoImage } from "./upload";

const managerRoles: Array<"organizer" | "platform_admin" | "admin"> = ["organizer", "platform_admin", "admin"];
const MAX_LOGO_IMAGE_BYTES = 2 * 1024 * 1024;

async function requireTeamManager(): Promise<ActorContext> {
  const user = await requireAnyRole(managerRoles);
  if (!user) return redirectToActiveLocale("/login");

  // Migration window: keep legacy admin sessions as organizer/self-tenant actors.
  const actor = user.role === "admin" ? toEventReadActorCompatibility(user) : toActorContext(user);
  if (!actor) return redirectToActiveLocale("/login");
  return actor;
}

async function requireCaptain() {
  const user = await requireRole("captain");
  if (!user) return redirectToActiveLocale("/login");
  return user;
}

/** Assigns or clears the captain user for an imported team. Organizer must own the team's event. */
export async function adminAssignCaptainAction(formData: FormData) {
  const actor = await requireTeamManager();
  const teamId = z.string().min(1).parse(formData.get("teamId"));
  const captainUserId = String(formData.get("captainUserId") ?? "").trim() || null;

  try {
    await assignCaptainForActor(actor, teamId, captainUserId);
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof ConflictError) {
      return redirectToActiveLocale(`/admin?error=${encodeURIComponent(err.message)}` as never);
    }
    // Authorization denials (and any other unexpected error) propagate rather
    // than being silently redirected, preserving legacy observability for
    // cross-tenant access attempts.
    throw err;
  }

  revalidatePath("/", "layout");
  return redirectToActiveLocale("/admin?success=captain-assigned" as never);
}

/** Deletes a team from a Draft-status event. Blocks if the event has started. */
export async function adminDeleteTeamAction(formData: FormData) {
  const actor = await requireTeamManager();
  const teamId = z.string().min(1).parse(formData.get("teamId"));

  try {
    await deleteTeamForActor(actor, teamId);
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof ConflictError) {
      return redirectToActiveLocale(`/admin?error=${encodeURIComponent(err.message)}` as never);
    }
    // Authorization denials (and any other unexpected error) propagate rather
    // than being silently redirected, preserving legacy observability for
    // cross-tenant access attempts.
    throw err;
  }

  revalidatePath("/", "layout");
  return redirectToActiveLocale("/admin?success=team-deleted" as never);
}

/**
 * Uploads an organizer-supplied team logo. Ownership is preflighted before the
 * Blob/filesystem side effect, then re-verified at the write inside
 * `updateTeamLogoForActor` so denial never rests solely on the preflight.
 */
export async function adminUploadTeamLogoAction(formData: FormData) {
  const actor = await requireTeamManager();
  const teamId = z.string().min(1).parse(formData.get("teamId"));

  try {
    await assertActorCanManageTeam(actor, teamId);

    const asset = await uploadTeamLogoImage({
      file: formData.get("teamLogo"),
      entityId: teamId,
      maxBytes: MAX_LOGO_IMAGE_BYTES,
      errorPath: "/admin",
    });
    await updateTeamLogoForActor(actor, teamId, asset.url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    await redirectToActiveLocale(`/admin?error=${encodeURIComponent(message)}`);
  }

  revalidateTag("teams");
  revalidatePath("/", "layout");
  await redirectToActiveLocale(`/admin?success=team-logo-uploaded`);
}

export async function captainUploadTeamLogoAction(formData: FormData) {
  const captain = await requireCaptain();

  try {
    const teamId = z.string().min(1).parse(formData.get("teamId"));
    await assertCaptainCanManageTeam(captain.id, teamId);
    const asset = await uploadTeamLogoImage({
      file: formData.get("teamLogo"),
      entityId: teamId,
      maxBytes: MAX_LOGO_IMAGE_BYTES,
      errorPath: "/captain?tab=roster",
    });
    await updateCaptainTeamLogo(captain.id, teamId, asset.url);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return redirectToActiveLocale(`/captain?tab=roster&error=${encodeURIComponent(message)}` as never);
  }

  revalidateTag("teams");
  revalidatePath("/captain");
  return redirectToActiveLocale("/captain?tab=roster&success=team-logo-updated" as never);
}

export async function captainAddPlayerAction(formData: FormData) {
  const captain = await requireCaptain();
  const input = z.object({
    teamId: z.string().min(1),
    eventId: z.string().trim().optional(),
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
  const jerseyNumber = jerseyRaw && String(jerseyRaw).trim() !== "" ? parseInt(String(jerseyRaw), 10) : undefined;

  try {
    await addPlayer(captain.id, { ...input, position: input.position ?? "", jerseyNumber });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tidak dapat menambahkan pemain.";
    return redirectToActiveLocale(`/captain?error=${encodeURIComponent(message)}` as never);
  }
  return redirectToActiveLocale("/captain?success=player-added" as never);
}

export async function captainUpdatePlayerAction(formData: FormData) {
  const captain = await requireCaptain();
  const id = z.string().min(1).parse(formData.get("playerId"));
  const jerseyRaw = formData.get("jerseyNumber");
  const jerseyNumber = jerseyRaw && String(jerseyRaw).trim() !== "" ? parseInt(String(jerseyRaw), 10) : undefined;
  const data = {
    displayName: z.string().trim().min(2).parse(formData.get("displayName")),
    nickname: z.string().trim().min(2).parse(formData.get("nickname")),
    position: String(formData.get("position") ?? "").trim(),
    jerseyNumber,
  };

  try {
    await updatePlayer(id, captain.id, data);
  } catch {
    return redirectToActiveLocale("/captain?error=Tidak+dapat+mengedit+pemain+ini." as never);
  }
  revalidatePath("/captain");
  return redirectToActiveLocale("/captain?success=player-updated" as never);
}

export async function captainDeletePlayerAction(formData: FormData) {
  const captain = await requireCaptain();
  const id = z.string().min(1).parse(formData.get("playerId"));

  try {
    await deletePlayer(id, captain.id);
  } catch {
    return redirectToActiveLocale("/captain?error=Tidak+dapat+menghapus+pemain+ini." as never);
  }
  revalidatePath("/captain");
  return redirectToActiveLocale("/captain?success=player-deleted" as never);
}

export async function captainSetDisplayCaptainAction(formData: FormData) {
  const captain = await requireCaptain();
  const teamId = z.string().min(1).parse(formData.get("teamId"));
  const playerId = z.string().min(1).parse(formData.get("playerId"));

  try {
    await setTeamCaptainDisplay(teamId, captain.id, playerId);
  } catch {
    return redirectToActiveLocale(`/captain?error=${encodeURIComponent("Tidak dapat mengubah tampilan kapten.")}` as never);
  }
  revalidatePath("/", "layout");
  return redirectToActiveLocale("/captain?success=captain-display-updated" as never);
}
