"use server";

import bcrypt from "bcryptjs";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { redirectToActiveLocale } from "@/i18n/redirect";
import { routing } from "@/i18n/routing";
import { requireRole, signIn, signOut } from "@/lib/auth/session";
import { parseAndValidateTeamImport } from "@/lib/imports/team-import";
import type { AppUser } from "@/lib/platform/types";
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
  autoTransitionEventToOngoing,
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

async function requireAdminSession(): Promise<AppUser> {
  const user = await requireRole("admin");

  if (!user) {
    return redirectToActiveLocale("/login");
  }

  return user;
}

async function requireCaptainSession(): Promise<AppUser> {
  const user = await requireRole("captain");

  if (!user) {
    return redirectToActiveLocale("/login");
  }

  return user;
}

async function redirectToRequestedLocale(path: string, locale?: string): Promise<never> {
  if (locale && routing.locales.includes(locale as "id" | "en")) {
    const [pathname, search = ""] = path.split("?");
    const query = search ? `?${search}` : "";
    const target = pathname === "/" ? `/${locale}${query}` : `/${locale}${pathname}${query}`;
    redirect(target);
  }

  return redirectToActiveLocale(path);
}

/**
 * Registers a new captain account and their team in a single atomic transaction.
 * Validates all fields, checks for duplicate email and team tag, hashes the password,
 * and signs in automatically after creation. Redirects to /captain on success.
 */
export async function captainSignUpAction(formData: FormData) {
  const signUpError = async (msg: string) =>
    redirectToActiveLocale(`/register?error=${encodeURIComponent(msg)}` as never);

  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const eventId = String(formData.get("eventId") ?? "").trim();
  const teamName = String(formData.get("teamName") ?? "").trim();
  const teamTag = String(formData.get("teamTag") ?? "").trim().toUpperCase();

  if (!fullName || fullName.length < 2) await signUpError("Nama lengkap minimal 2 karakter.");
  if (!z.string().email().safeParse(email).success) await signUpError("Format email tidak valid.");
  if (password.length < 8) await signUpError("Password minimal 8 karakter.");
  if (!eventId) await signUpError("Pilih event terlebih dahulu.");
  if (teamName.length < 2) await signUpError("Nama tim minimal 2 karakter.");
  if (teamTag.length < 2 || teamTag.length > 4) await signUpError("Tag tim harus 2-4 karakter.");

  const existingUser = await getUserByEmail(email);
  if (existingUser) await signUpError("Email ini sudah terdaftar. Coba login.");

  const publishedEvents = await getPublishedEvents();
  if (!publishedEvents.find((e) => e.id === eventId)) await signUpError("Event tidak valid atau sudah tidak tersedia.");

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    await createCaptainWithTeam({ email, name: fullName, passwordHash, eventId, teamName, teamTag });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal membuat akun.";
    if (msg.includes("Unique constraint")) await signUpError("Tag atau nama tim sudah digunakan di event ini.");
    await signUpError(msg);
  }

  const result = await signIn(email, password);
  if (!result.ok) await signUpError("Akun berhasil dibuat, tapi login gagal. Silakan login manual.");

  await redirectToActiveLocale("/captain?success=registered" as never);
}

/** Authenticates a user by email/password and redirects to /admin or /captain based on role. */
export async function loginAction(formData: FormData) {
  const requestedLocale = String(formData.get("locale") ?? "").trim();
  const email = z.string().email().parse(formData.get("email"));
  const password = z.string().min(1).parse(formData.get("password"));
  const result = await signIn(email, password);

  if (!result.ok) {
    return await redirectToRequestedLocale("/login?error=invalid", requestedLocale);
  }

  const user = result.user;
  if (!user) {
    return await redirectToRequestedLocale("/login?error=invalid", requestedLocale);
  }

  await redirectToRequestedLocale(user.role === "admin" ? "/admin" : "/captain", requestedLocale);
}

/** Clears the session cookie and redirects to the home page. */
export async function logoutAction() {
  await signOut();
  await redirectToActiveLocale("/");
}

/** Registers a team for a published event. Captain ID comes from the authenticated session, not the form. */
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
  await redirectToActiveLocale("/captain?success=team-created");
}

/**
 * Changes the captain's password after verifying the current one.
 * Validates that new and confirm passwords match and meet the 8-character minimum.
 */
export async function changePasswordAction(formData: FormData) {
  const user = await requireCaptainSession();

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const settingsError = async (msg: string) =>
    redirectToActiveLocale(`/captain/settings?error=${encodeURIComponent(msg)}` as never);

  if (!currentPassword || !newPassword || !confirmPassword) {
    await settingsError("Semua field harus diisi.");
  }
  if (newPassword.length < 8) {
    await settingsError("Password baru minimal 8 karakter.");
  }
  if (newPassword !== confirmPassword) {
    await settingsError("Konfirmasi password tidak cocok.");
  }

  const currentHash = await getUserPasswordHashById(user.id);
  if (!currentHash) {
    return settingsError("Terjadi kesalahan. Coba lagi.");
  }

  const valid = await bcrypt.compare(currentPassword, currentHash);
  if (!valid) {
    return settingsError("Password saat ini tidak tepat.");
  }

  await updateCaptainPassword(user.id, await bcrypt.hash(newPassword, 10));
  await redirectToActiveLocale("/captain?success=password-changed");
}

/** Adds a player to the captain's team. Jersey number is optional; omitted if the field is blank. */
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
  await redirectToActiveLocale("/captain?success=player-added");
}

/**
 * Updates a player's profile. Ownership is enforced server-side via the captain's session ID;
 * the action redirects with an error if the player does not belong to the authenticated captain.
 */
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
  const id = z.string().min(1).parse(formData.get("playerId"));

  try {
    await deletePlayer(id, user.id);
  } catch {
    await redirectToActiveLocale("/captain?error=Tidak+dapat+menghapus+pemain+ini.");
  }

  revalidatePath("/captain");
  await redirectToActiveLocale("/captain?success=player-deleted");
}

/** Creates a new tournament event. Supported participant caps: 8, 12, 16, 24, 32, 64, 128, 256. */
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
  await redirectToActiveLocale("/admin?success=event-created");
}

/** Changes an event's lifecycle status (Draft → Published → Registration Closed → Ongoing → Finished). */
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
    return redirectToActiveLocale("/admin?error=Event%20not%20found.");
  }

  revalidatePath("/", "layout");
  await redirectToActiveLocale(`/admin?success=event-status-updated&event=${event.slug}`);
}

/**
 * Records a BO1 match result (direct home/away score). Also auto-transitions the event
 * status from Published/Registration Closed to Ongoing if it hasn't been set yet.
 */
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
    await redirectToActiveLocale(`/admin?matchEventId=${matchEventId}&error=${encodeURIComponent(message)}` as never);
  }

  if (!match) await redirectToActiveLocale(`/admin?matchEventId=${matchEventId}&error=Match%20not%20found.` as never);
  await autoTransitionEventToOngoing(input.eventId);
  revalidateTag("teams");
  revalidatePath("/", "layout");
  await redirectToActiveLocale(`/admin?matchEventId=${matchEventId}&success=match-result-updated` as never);
}

/**
 * Parses and imports teams from an uploaded CSV file.
 * Validates file presence, then delegates to `parseAndValidateTeamImport` for structural
 * and business-rule checks before persisting. Redirects with error on any failure.
 */
export async function adminImportTeamsCsvAction(formData: FormData) {
  await requireAdminSession();

  const file = formData.get("csv");

  if (!(file instanceof File) || file.size === 0) {
    return redirectToActiveLocale("/admin?error=Please%20choose%20a%20CSV%20file%20before%20importing.");
  }

  const result = parseAndValidateTeamImport(await file.text(), await getImportSnapshot());

  if (!result.ok) {
    return redirectToActiveLocale(`/admin?error=${encodeURIComponent(result.message)}`);
  }

  await importTeams(result.rows);
  revalidatePath("/", "layout");
  await redirectToActiveLocale(`/admin?success=teams-imported&count=${result.rows.length}`);
}

/** Updates the live-stream URL and label for an event. URL must be a valid absolute URL. */
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
  await redirectToActiveLocale("/admin?success=stream-updated");
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

/** Approves a captain's stat submission, making it visible on the public leaderboard. */
export async function adminApproveStatAction(formData: FormData) {
  const user = await requireAdminSession();
  const submissionId = formData.get("submissionId") as string;
  await approveStatSubmission(submissionId, user.id);
  revalidatePath("/", "layout");
  await redirectToActiveLocale("/admin?success=stat-approved");
}

/** Rejects a stat submission with an optional rejection note shown to the captain. Defaults to "Please review and resubmit." if no note is provided. */
export async function adminRejectStatAction(formData: FormData) {
  const user = await requireAdminSession();
  const submissionId = formData.get("submissionId") as string;
  const note =
    (formData.get("rejectionNote") as string)?.trim() || "Please review and resubmit.";
  await rejectStatSubmission(submissionId, user.id, note);
  revalidatePath("/", "layout");
  await redirectToActiveLocale("/admin?success=stat-rejected");
}

/** Sets the Best-of-N configuration for a specific round label in an event. Valid bestOf values are 1, 3, or 5. */
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
  await redirectToActiveLocale(`/admin?matchEventId=${input.eventId}&success=round-config-saved` as never);
}

/**
 * Records per-game scores for a Best-of-N match. Form fields follow the pattern
 * `game{N}_home` / `game{N}_away`; empty rows are skipped. At least one game score
 * must be provided. Also auto-transitions the event to Ongoing if needed.
 */
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

  if (games.length === 0) await redirectToActiveLocale(`/admin?matchEventId=${matchEventId}&error=Masukkan+skor+minimal+1+game.` as never);

  try {
    await setMatchGames(matchId, matchEventId, games, bestOf);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save match games.";
    await redirectToActiveLocale(`/admin?matchEventId=${matchEventId}&error=${encodeURIComponent(message)}` as never);
  }

  await autoTransitionEventToOngoing(matchEventId);
  revalidateTag("teams");
  revalidatePath("/", "layout");
  await redirectToActiveLocale(`/admin?matchEventId=${matchEventId}&success=match-games-saved` as never);
}
