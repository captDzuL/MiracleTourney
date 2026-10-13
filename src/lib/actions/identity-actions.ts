"use server";

// Server actions for accounts: sign up, login, password change and reset, assign captain, deactivate user.
// Moved out of lib/actions.ts without changes (refactor PR 3.1).

import { redirectToActiveLocale } from "@/i18n/redirect";
import { isSafeEntityId } from "@/lib/actions/shared/ids";
import { actionEntityId, redirectToRequestedLocale } from "@/lib/actions/shared/request";
import { assertWorkspaceEventAction, requireAdminSession, requireCaptainSession } from "@/lib/actions/shared/session";
import { resolvePostLoginPath } from "@/lib/auth/post-login-path";
import { requireRole, signIn } from "@/lib/auth/session";
import { sendEmail } from "@/lib/email/send";
import { getEventsByIds } from "@/lib/events/repository";
import { createCaptainAccount, findAssignableCaptain, getUserByEmail, getUserPasswordHashById, setTeamCaptain, updateCaptainPassword } from "@/lib/identity/repository";
import { getTeamEventRef } from "@/lib/teams/repository";
import { getSafeReturnTo } from "@/lib/navigation/safe-return-to";
import { withServerActionLog } from "@/lib/observability/logger";
import { prisma } from "@/lib/platform/db";
import { consumePasswordResetToken, createPasswordResetToken, equalizePasswordResetResponse } from "@/lib/platform/password-reset";
import { assertUserCanManageEvent } from "@/lib/platform/shared/authz";
import { checkRateLimit } from "@/lib/rate-limit";
import { toSafeActionMessage } from "@/lib/security/public-error";
import { isDisposableEmail } from "@/lib/validation/email";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";

function isDatabaseConnectionError(error: unknown) {
  if (!(error instanceof Error)) return false;

  return (
    error.name === "PrismaClientInitializationError"
    || error.message.includes("Can't reach database server")
  );
}

/**
 * Registers a new captain account without requiring an active event.
 * Team draft and event registration happen later from the captain dashboard.
 */
export async function captainSignUpAction(formData: FormData) {
  const returnTo = getSafeReturnTo(formData.get("returnTo"));
  const requestedLocale = String(formData.get("locale") ?? "").trim();
  const eventId = String(formData.get("eventId") ?? "").trim();
  const hasSafeEventId = Boolean(eventId && isSafeEntityId(eventId));
  const signUpError = async (msg: string) => {
    const context = new URLSearchParams();
    if (hasSafeEventId) context.set("eventId", eventId);
    if (returnTo) context.set("returnTo", returnTo);
    context.set("error", msg);
    return redirectToRequestedLocale(`/register?${context.toString()}`, requestedLocale);
  };

  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!fullName || fullName.length < 2) await signUpError("Nama lengkap minimal 2 karakter.");
  if (!z.string().email().safeParse(email).success) await signUpError("Format email tidak valid.");
  if (password.length < 8) await signUpError("Password minimal 8 karakter.");

  if (eventId) {
    if (!hasSafeEventId) await signUpError("Event tidak valid.");
    const [event] = await getEventsByIds([eventId]);
    if (!event || !["Published", "Registration Closed"].includes(event.status)) {
      await signUpError("Event tidak tersedia.");
    }
  }

  const ip = (await headers()).get("x-forwarded-for") ?? "unknown";
  if (!(await checkRateLimit(`register:${ip}`, 5, 15 * 60 * 1000))) {
    await signUpError("Terlalu banyak percobaan pendaftaran. Coba lagi dalam 15 menit.");
  }

  if (isDisposableEmail(email)) {
    await signUpError("Email sementara tidak diizinkan. Gunakan email aktif.");
  }

  const existingUser = await getUserByEmail(email);
  if (existingUser) await signUpError("Email ini sudah terdaftar. Coba login.");

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    await createCaptainAccount({ email, name: fullName, passwordHash });
  } catch (err) {
    const msg = toSafeActionMessage(err, "Gagal membuat akun.");
    await signUpError(msg);
  }

  const result = await signIn(email, password);
  if (!result.ok) await signUpError("Akun berhasil dibuat, tapi login gagal. Silakan login manual.");

  await redirectToRequestedLocale(
    eventId
      ? `/captain?tab=registration&eventId=${encodeURIComponent(eventId)}`
      : returnTo ?? "/captain?success=registered",
    requestedLocale,
  );
}

/** Authenticates a user by email/password and redirects to their role-specific workspace. */
export async function loginAction(formData: FormData) {
  const requestedLocale = String(formData.get("locale") ?? "").trim();
  const returnTo = getSafeReturnTo(formData.get("returnTo"));
  const eventId = String(formData.get("eventId") ?? "").trim();
  const hasSafeEventId = Boolean(eventId && isSafeEntityId(eventId));
  const loginErrorPath = (error: "database" | "invalid") => {
    const context = new URLSearchParams();
    if (returnTo) context.set("returnTo", returnTo);
    else if (hasSafeEventId) context.set("eventId", eventId);
    context.set("error", error);
    return `/login?${context.toString()}`;
  };
  const email = z.string().email().parse(formData.get("email"));
  const password = z.string().min(1).parse(formData.get("password"));
  const requestIp = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await checkRateLimit(`login:${requestIp}`, 20, 5 * 60 * 1000))) {
    return await redirectToRequestedLocale(loginErrorPath("invalid"), requestedLocale);
  }
  let result;

  try {
    result = await signIn(email, password);
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return await redirectToRequestedLocale(loginErrorPath("database"), requestedLocale);
    }

    console.error("[loginAction] signIn failed");
    return await redirectToRequestedLocale(loginErrorPath("invalid"), requestedLocale);
  }

  if (!result.ok) {
    return await redirectToRequestedLocale(loginErrorPath("invalid"), requestedLocale);
  }

  const user = result.user;
  if (!user) {
    return await redirectToRequestedLocale(loginErrorPath("invalid"), requestedLocale);
  }

  await redirectToRequestedLocale(
    resolvePostLoginPath({ role: user.role, mustChangePassword: user.mustChangePassword, returnTo, eventId }),
    requestedLocale,
  );
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

/** Assigns or clears the captain user for an imported team. */
export async function adminAssignCaptainAction(formData: FormData) {
  const user = await requireAdminSession();
  const teamId = actionEntityId.parse(formData.get("teamId"));
  const captainUserIdRaw = String(formData.get("captainUserId") ?? "").trim();
  const captainUserId = captainUserIdRaw ? actionEntityId.parse(captainUserIdRaw) : null;

  const team = await getTeamEventRef(teamId);
  if (!team?.eventId) {
    return redirectToActiveLocale(`/admin?error=${encodeURIComponent("Tim tidak ditemukan.")}` as never);
  }
  await assertUserCanManageEvent(user, team.eventId);
  assertWorkspaceEventAction(user, team.eventId);

  if (captainUserId) {
    // An organizer can only pick captains who already belong to one of their own events.
    const captain = await findAssignableCaptain(user, captainUserId);
    if (!captain) {
      return redirectToActiveLocale(`/admin?error=${encodeURIComponent("Kapten tidak ditemukan.")}` as never);
    }
    await setTeamCaptain(teamId, captain);
  } else {
    await setTeamCaptain(teamId, null);
  }

  revalidatePath("/", "layout");
  return redirectToActiveLocale("/admin?success=captain-assigned" as never);
}

/** Deactivates a captain account (platform_admin only). Deactivated users cannot log in. */
export async function adminDeactivateUserAction(formData: FormData) {
  const user = await requireRole("platform_admin");
  if (!user) {
    return redirectToActiveLocale("/login" as never);
  }
  const targetUserId = actionEntityId.parse(formData.get("userId"));
  if (targetUserId === user.id) {
    return redirectToActiveLocale(
      `/admin?error=${encodeURIComponent("Tidak dapat menonaktifkan akun sendiri.")}` as never
    );
  }
  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, role: true } });
  if (!target || target.role !== "captain") {
    return redirectToActiveLocale(
      `/admin?error=${encodeURIComponent("Hanya akun kapten yang dapat dinonaktifkan.")}` as never
    );
  }
  await prisma.user.update({ where: { id: targetUserId }, data: { deactivatedAt: new Date() } });
  revalidatePath("/", "layout");
  return redirectToActiveLocale("/admin?success=user-deactivated" as never);
}

/** Roles that may self-serve a password reset by email. Admin accounts are intentionally excluded. */
const PASSWORD_RESET_ROLES: ReadonlySet<string> = new Set(["captain", "organizer"]);

/** Absolute base for reset links; an email must never carry a relative (unclickable) URL, so a missing base fails the delivery. */
function getPasswordResetBaseUrl(): string {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(baseUrl)) throw new Error("password_reset_base_url_missing");
  return baseUrl;
}

/**
 * Requests a password reset link for a captain or organizer account.
 * Always redirects to sent=1 regardless of whether the email exists (security best practice).
 * Queues the reset link through Next's post-response hook; delivery failures are
 * converted into a safe structured signal by the deferred logger boundary.
 */
type PasswordResetActionResult =
  | { status: "ok"; redirectPath: string }
  | { status: "rate_limited"; redirectPath: string }
  | { status: "failed"; code: "delivery_failed" | "token_invalid"; statusCode: 400 | 500; redirectPath: string };

async function requestPasswordResetActionImpl(formData: FormData): Promise<PasswordResetActionResult> {
  const emailRaw = String(formData.get("email") ?? "").trim().toLowerCase();
  const email = z.string().email().safeParse(emailRaw);
  if (!email.success) {
    return {
      status: "ok",
      redirectPath: `/forgot-password?error=${encodeURIComponent("Format email tidak valid.")}`,
    };
  }
  const requestIp = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await checkRateLimit(`password-reset-request:${requestIp}`, 5, 15 * 60 * 1000))) {
    return { status: "rate_limited", redirectPath: "/forgot-password?sent=1" };
  }

  try {
    const user = await getUserByEmail(email.data);
    after(async () => {
      await withServerActionLog(
        "password_reset_request",
        "/server-actions/password-reset/request",
        async () => {
          try {
            await equalizePasswordResetResponse(async () => {
              if (!user || user.deactivatedAt || !PASSWORD_RESET_ROLES.has(user.role)) return;

              const baseUrl = getPasswordResetBaseUrl();
              const token = await createPasswordResetToken(user.id);
              const resetUrl = `${baseUrl}/forgot-password/reset?token=${token}`;
              await sendEmail({
                to: email.data,
                subject: "Reset Password Miracle League",
                html: `<p>Klik link berikut untuk reset password kamu: <a href="${resetUrl}">${resetUrl}</a></p><p>Link berlaku 30 menit.</p>`,
              });
            });
            return { status: "ok" as const };
          } catch {
            return { status: "failed" as const, code: "delivery_failed" as const, statusCode: 500 as const };
          }
        },
      );
    });
  } catch {
    // Keep lookup/scheduling failures indistinguishable to callers while emitting only a safe code.
    return {
      status: "failed",
      code: "delivery_failed",
      statusCode: 500,
      redirectPath: "/forgot-password?sent=1",
    };
  }
  // Always redirect to sent=1 regardless of whether email exists (security)
  return { status: "ok", redirectPath: "/forgot-password?sent=1" };
}

/**
 * Resets a captain's or organizer's password using a one-time token.
 * Validates token length, password length, and confirmation match before consuming the token.
 */
async function resetPasswordActionImpl(formData: FormData): Promise<PasswordResetActionResult> {
  const token = String(formData.get("token") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  const requestIp = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await checkRateLimit(`password-reset-consume:${requestIp}`, 5, 15 * 60 * 1000))) {
    return {
      status: "rate_limited",
      redirectPath: `/forgot-password/reset?token=${token}&error=${encodeURIComponent("Token tidak valid atau sudah kadaluarsa.")}`,
    };
  }

  if (!token || token.length < 64) {
    return {
      status: "failed",
      code: "token_invalid",
      statusCode: 400,
      redirectPath: `/forgot-password/reset?error=${encodeURIComponent("Token tidak valid.")}`,
    };
  }
  if (password.length < 8) {
    return {
      status: "ok",
      redirectPath: `/forgot-password/reset?token=${token}&error=${encodeURIComponent("Password minimal 8 karakter.")}`,
    };
  }
  if (password !== confirm) {
    return {
      status: "ok",
      redirectPath: `/forgot-password/reset?token=${token}&error=${encodeURIComponent("Password tidak sama.")}`,
    };
  }

  const newHash = await bcrypt.hash(password, 10);

  try {
    await consumePasswordResetToken(token, newHash);
  } catch {
    return {
      status: "failed",
      code: "token_invalid",
      statusCode: 400,
      redirectPath: `/forgot-password/reset?token=${token}&error=${encodeURIComponent("Token tidak valid atau sudah kadaluarsa.")}`,
    };
  }

  return {
    status: "ok",
    redirectPath: "/login?reset=success",
  };
}

export async function requestPasswordResetAction(formData: FormData) {
  const result = await withServerActionLog(
    "password_reset_request",
    "/server-actions/password-reset/request",
    () => requestPasswordResetActionImpl(formData),
  );
  return redirectToActiveLocale(result.redirectPath as never);
}

export async function resetPasswordAction(formData: FormData) {
  const result = await withServerActionLog(
    "password_reset_consume",
    "/server-actions/password-reset/consume",
    () => resetPasswordActionImpl(formData),
  );
  return redirectToActiveLocale(result.redirectPath as never);
}
