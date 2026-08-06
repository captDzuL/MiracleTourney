"use server";

import bcrypt from "bcryptjs";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole, signIn, signOut } from "@/lib/auth/session";
import { parseAndValidateTeamImport } from "@/lib/imports/team-import";
import {
  addPlayer,
  approveStatSubmission,
  createCaptainWithTeam,
  createEvent,
  deletePlayer,
  getImportSnapshot,
  getPublishedEvents,
  getUserByEmail,
  getUserPasswordHashById,
  importTeams,
  registerTeam,
  rejectStatSubmission,
  setEventStatus,
  setMatchGames,
  setMatchResult,
  updateCaptainPassword,
  updateEventStream,
  updatePlayer,
  upsertRoundConfig,
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

export async function captainSignUpAction(formData: FormData) {
  const signUpError = (msg: string) =>
    redirect(`/register?error=${encodeURIComponent(msg)}` as never);

  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const eventId = String(formData.get("eventId") ?? "").trim();
  const teamName = String(formData.get("teamName") ?? "").trim();
  const teamTag = String(formData.get("teamTag") ?? "").trim().toUpperCase();

  if (!fullName || fullName.length < 2) signUpError("Nama lengkap minimal 2 karakter.");
  if (!z.string().email().safeParse(email).success) signUpError("Format email tidak valid.");
  if (password.length < 8) signUpError("Password minimal 8 karakter.");
  if (!eventId) signUpError("Pilih event terlebih dahulu.");
  if (teamName.length < 2) signUpError("Nama tim minimal 2 karakter.");
  if (teamTag.length < 2 || teamTag.length > 4) signUpError("Tag tim harus 2-4 karakter.");

  const existingUser = await getUserByEmail(email);
  if (existingUser) signUpError("Email ini sudah terdaftar. Coba login.");

  const publishedEvents = await getPublishedEvents();
  if (!publishedEvents.find((e) => e.id === eventId)) signUpError("Event tidak valid atau sudah tidak tersedia.");

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    await createCaptainWithTeam({ email, name: fullName, passwordHash, eventId, teamName, teamTag });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal membuat akun.";
    if (msg.includes("Unique constraint")) signUpError("Tag atau nama tim sudah digunakan di event ini.");
    signUpError(msg);
  }

  const result = await signIn(email, password);
  if (!result.ok) signUpError("Akun berhasil dibuat, tapi login gagal. Silakan login manual.");

  redirect("/captain?success=registered" as never);
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

export async function changePasswordAction(formData: FormData) {
  const user = await requireCaptainSession();

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const settingsError = (msg: string) =>
    redirect(`/captain/settings?error=${encodeURIComponent(msg)}` as never);

  if (!currentPassword || !newPassword || !confirmPassword) {
    settingsError("Semua field harus diisi.");
  }
  if (newPassword.length < 8) {
    settingsError("Password baru minimal 8 karakter.");
  }
  if (newPassword !== confirmPassword) {
    settingsError("Konfirmasi password tidak cocok.");
  }

  const currentHash = await getUserPasswordHashById(user.id);
  if (!currentHash) settingsError("Terjadi kesalahan. Coba lagi.");

  const valid = await bcrypt.compare(currentPassword, currentHash!);
  if (!valid) settingsError("Password saat ini tidak tepat.");

  await updateCaptainPassword(user.id, await bcrypt.hash(newPassword, 10));
  redirect("/captain?success=password-changed");
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

export async function captainUpdatePlayerAction(formData: FormData) {
  const user = await requireCaptainSession();

  const id = z.string().min(1).parse(formData.get("playerId"));
  const jerseyRaw = formData.get("jerseyNumber");
  const jerseyNumber =
    jerseyRaw && String(jerseyRaw).trim() !== ""
      ? parseInt(String(jerseyRaw), 10)
      : null;

  const data = {
    displayName: z.string().min(2).parse(formData.get("displayName")),
    nickname: z.string().min(2).parse(formData.get("nickname")),
    position: z.string().min(2).parse(formData.get("position")),
    jerseyNumber: jerseyNumber ?? undefined,
  };

  try {
    await updatePlayer(id, user.id, data);
  } catch {
    redirect("/captain?error=Tidak+dapat+mengedit+pemain+ini.");
  }

  revalidatePath("/captain");
  redirect("/captain?success=player-updated");
}

export async function captainDeletePlayerAction(formData: FormData) {
  const user = await requireCaptainSession();
  const id = z.string().min(1).parse(formData.get("playerId"));

  try {
    await deletePlayer(id, user.id);
  } catch {
    redirect("/captain?error=Tidak+dapat+menghapus+pemain+ini.");
  }

  revalidatePath("/captain");
  redirect("/captain?success=player-deleted");
}

export async function adminCreateEventAction(formData: FormData) {
  await requireAdminSession();

  const input = z.object({
    name: z.string().min(3),
    slug: z.string().min(3),
    gameModeId: z.string().min(1),
    format: z.enum(["Single Elimination", "League"]),
    participantCap: z.union([z.literal(8), z.literal(12), z.literal(16), z.literal(24), z.literal(32), z.literal(64), z.literal(128), z.literal(256)]),
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

  const matchEventId = z.string().min(1).parse(formData.get("matchEventId"));
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
    redirect(`/admin?matchEventId=${matchEventId}&error=${encodeURIComponent(message)}` as never);
  }

  if (!match) redirect(`/admin?matchEventId=${matchEventId}&error=Match%20not%20found.` as never);
  revalidateTag("teams");
  revalidatePath("/", "layout");
  redirect(`/admin?matchEventId=${matchEventId}&success=match-result-updated` as never);
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

export async function adminSetRoundConfigAction(formData: FormData) {
  await requireAdminSession();

  const input = z.object({
    eventId: z.string().min(1),
    roundLabel: z.string().min(1),
    bestOf: z.coerce.number().int().refine((n) => [1, 3, 5].includes(n), { message: "bestOf must be 1, 3, or 5" }),
  }).parse({
    eventId: formData.get("eventId"),
    roundLabel: formData.get("roundLabel"),
    bestOf: formData.get("bestOf"),
  });

  await upsertRoundConfig(input.eventId, input.roundLabel, input.bestOf);
  revalidatePath("/", "layout");
  redirect(`/admin?matchEventId=${input.eventId}&success=round-config-saved` as never);
}

export async function adminSetMatchGamesAction(formData: FormData) {
  await requireAdminSession();

  const matchId = z.string().min(1).parse(formData.get("matchId"));
  const matchEventId = z.string().min(1).parse(formData.get("matchEventId"));
  const bestOf = z.coerce.number().int().min(1).max(5).parse(formData.get("bestOf"));

  const games: { gameNumber: number; homeScore: number; awayScore: number }[] = [];
  for (let i = 1; i <= bestOf; i++) {
    const homeRaw = formData.get(`game${i}_home`);
    const awayRaw = formData.get(`game${i}_away`);
    if (homeRaw === null || homeRaw === "" || awayRaw === null || awayRaw === "") continue;
    const homeScore = z.coerce.number().int().min(0).parse(homeRaw);
    const awayScore = z.coerce.number().int().min(0).parse(awayRaw);
    games.push({ gameNumber: i, homeScore, awayScore });
  }

  if (games.length === 0) redirect(`/admin?matchEventId=${matchEventId}&error=Masukkan+skor+minimal+1+game.` as never);

  try {
    await setMatchGames(matchId, matchEventId, games, bestOf);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save match games.";
    redirect(`/admin?matchEventId=${matchEventId}&error=${encodeURIComponent(message)}` as never);
  }

  revalidateTag("teams");
  revalidatePath("/", "layout");
  redirect(`/admin?matchEventId=${matchEventId}&success=match-games-saved` as never);
}
