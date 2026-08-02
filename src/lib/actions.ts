"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole, signIn, signOut } from "@/lib/auth/session";
import { parseAndValidateTeamImport } from "@/lib/imports/team-import";
import {
  addPlayer,
  approveStatSubmission,
  createEvent,
  getImportSnapshot,
  importTeams,
  registerTeam,
  rejectStatSubmission,
  setEventStatus,
  setMatchResult,
  updateEventStream,
  upsertStatSubmission,
} from "@/lib/platform/repository";

async function requireAdminSession() {
  const user = await requireRole("admin");

  if (!user) {
    redirect("/login");
  }

  return user;
}

async function requireCaptainSession() {
  const user = await requireRole("captain");

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function loginAction(formData: FormData) {
  const email = z.string().email().parse(formData.get("email"));
  const password = z.string().min(1).parse(formData.get("password"));
  const result = await signIn(email, password);

  if (!result.ok) {
    redirect("/login?error=invalid");
  }

  redirect(result.user.role === "admin" ? "/admin" : "/captain");
}

export async function logoutAction() {
  await signOut();
  redirect("/");
}

export async function captainRegisterTeamAction(formData: FormData) {
  const captain = await requireCaptainSession();
  const input = z.object({
    eventId: z.string().min(1),
    name: z.string().min(2),
    tag: z.string().min(2).max(4),
  }).parse({
    eventId: formData.get("eventId"),
    name: formData.get("name"),
    tag: formData.get("tag"),
  });

  await registerTeam({ ...input, captainId: captain.id });
  redirect("/captain?success=team-created");
}

export async function captainAddPlayerAction(formData: FormData) {
  await requireCaptainSession();

  const input = z.object({
    teamId: z.string().min(1),
    eventId: z.string().min(1),
    displayName: z.string().min(2),
    nickname: z.string().min(2),
    position: z.string().min(2),
  }).parse({
    teamId: formData.get("teamId"),
    eventId: formData.get("eventId"),
    displayName: formData.get("displayName"),
    nickname: formData.get("nickname"),
    position: formData.get("position"),
  });

  const jerseyRaw = formData.get("jerseyNumber");
  const jerseyNumber =
    jerseyRaw && String(jerseyRaw).trim() !== ""
      ? parseInt(String(jerseyRaw), 10)
      : undefined;

  await addPlayer({ ...input, jerseyNumber });
  redirect("/captain?success=player-added");
}

export async function adminCreateEventAction(formData: FormData) {
  await requireAdminSession();

  const input = z.object({
    name: z.string().min(3),
    slug: z.string().min(3),
    gameModeId: z.string().min(1),
    format: z.enum(["Single Elimination", "League"]),
    participantCap: z.union([z.literal(8), z.literal(12), z.literal(16), z.literal(24)]),
  }).parse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    gameModeId: formData.get("gameModeId"),
    format: formData.get("format"),
    participantCap: Number(formData.get("participantCap")),
  });

  await createEvent(input);
  revalidatePath("/", "layout");
  redirect("/admin?success=event-created");
}

export async function adminUpdateEventStatusAction(formData: FormData) {
  await requireAdminSession();

  const input = z.object({
    eventId: z.string().min(1),
    status: z.enum(["Draft", "Published", "Registration Closed", "Ongoing", "Finished"]),
  }).parse({
    eventId: formData.get("eventId"),
    status: formData.get("status"),
  });

  const event = await setEventStatus(input.eventId, input.status);

  if (!event) {
    redirect("/admin?error=Event%20not%20found.");
  }

  revalidatePath("/", "layout");
  redirect(`/admin?success=event-status-updated&event=${event.slug}`);
}

export async function adminUpdateMatchResultAction(formData: FormData) {
  await requireAdminSession();

  const input = z.object({
    eventId: z.string().min(1),
    matchId: z.string().min(1),
    homeScore: z.coerce.number().int().min(0),
    awayScore: z.coerce.number().int().min(0),
  }).parse({
    eventId: formData.get("eventId"),
    matchId: formData.get("matchId"),
    homeScore: formData.get("homeScore"),
    awayScore: formData.get("awayScore"),
  });

  let match;

  try {
    match = await setMatchResult(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save match result.";
    redirect(`/admin?error=${encodeURIComponent(message)}`);
  }

  if (!match) redirect("/admin?error=Match%20not%20found.");
  revalidatePath("/", "layout");
  redirect(`/admin?success=match-result-updated&match=${match.id}`);
}

export async function adminImportTeamsCsvAction(formData: FormData) {
  await requireAdminSession();

  const file = formData.get("csv");

  if (!(file instanceof File) || file.size === 0) {
    redirect("/admin?error=Please%20choose%20a%20CSV%20file%20before%20importing.");
  }

  const result = parseAndValidateTeamImport(await file.text(), await getImportSnapshot());

  if (!result.ok) {
    redirect(`/admin?error=${encodeURIComponent(result.message)}`);
  }

  await importTeams(result.rows);
  revalidatePath("/", "layout");
  redirect(`/admin?success=teams-imported&count=${result.rows.length}`);
}

export async function adminUpdateStreamAction(formData: FormData) {
  await requireAdminSession();

  const input = z.object({
    eventId: z.string().min(1),
    url: z.string().url(),
    label: z.string().min(2),
  }).parse({
    eventId: formData.get("eventId"),
    url: formData.get("url"),
    label: formData.get("label"),
  });

  await updateEventStream(input.eventId, input.url, input.label);
  revalidatePath("/", "layout");
  redirect("/admin?success=stream-updated");
}

export async function captainSubmitStatsAction(formData: FormData) {
  const user = await requireRole("captain");
  if (!user) redirect("/login");

  const matchId = formData.get("matchId") as string;
  const teamId = formData.get("teamId") as string;
  const eventId = formData.get("eventId") as string;

  // Collect all stat keys in form: stat_{playerId}_{statKey}
  const stats: Record<string, Record<string, number>> = {};
  for (const [key, value] of formData.entries()) {
    const m = key.match(/^stat_(.+)_(.+)$/);
    if (!m) continue;
    const [, playerId, statKey] = m;
    if (!stats[playerId]) stats[playerId] = {};
    stats[playerId][statKey] = parseInt(value as string, 10) || 0;
  }

  await upsertStatSubmission({ matchId, teamId, eventId, submittedBy: user.id, stats });
  revalidatePath("/captain/stats");
}

export async function adminApproveStatAction(formData: FormData) {
  const user = await requireAdminSession();
  const submissionId = formData.get("submissionId") as string;
  await approveStatSubmission(submissionId, user.id);
  revalidatePath("/", "layout");
  redirect("/admin?success=stat-approved");
}

export async function adminRejectStatAction(formData: FormData) {
  const user = await requireAdminSession();
  const submissionId = formData.get("submissionId") as string;
  const note =
    (formData.get("rejectionNote") as string)?.trim() || "Please review and resubmit.";
  await rejectStatSubmission(submissionId, user.id, note);
  revalidatePath("/", "layout");
  redirect("/admin?success=stat-rejected");
}
