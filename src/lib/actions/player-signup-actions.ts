"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";

import { signIn } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getSafeReturnTo } from "@/lib/navigation/safe-return-to";
import { withServerActionLog } from "@/lib/observability/logger";
import { emailConflictMessage, parsePlayerSignUp } from "@/lib/player/signup";
import { createPlayerAccount, getUserByEmail } from "@/lib/platform/repository";
import { checkRateLimit } from "@/lib/rate-limit";
import { toSafeActionMessage } from "@/lib/security/public-error";
import { isDisposableEmail } from "@/lib/validation/email";

import { redirectToLocale } from "./locale-redirect";

const REGISTER_ATTEMPTS = 5;
const REGISTER_WINDOW_MS = 15 * 60 * 1000;
const PASSWORD_HASH_ROUNDS = 10;

/** Creates a player account, signs the player in and sends them on. Always ends in a redirect. */
export async function playerSignUpAction(formData: FormData): Promise<never> {
  return withServerActionLog("player_sign_up", "/server-actions/player-sign-up", () => signUpPlayer(formData));
}

async function signUpPlayer(formData: FormData): Promise<never> {
  const locale = String(formData.get("locale") ?? "").trim();
  const returnTo = getSafeReturnTo(formData.get("returnTo"));

  if (!isFeatureEnabled("solo_tournament_v1")) {
    return redirectToLocale(`/register?${new URLSearchParams({ error: "Pendaftaran pemain belum dibuka." })}`, locale);
  }

  const fail = (message: string) => {
    const context = new URLSearchParams({ as: "player" });
    if (returnTo) context.set("returnTo", returnTo);
    context.set("error", message);
    return redirectToLocale(`/register?${context}`, locale);
  };

  const parsed = parsePlayerSignUp({
    fullName: String(formData.get("fullName") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    whatsapp: String(formData.get("whatsapp") ?? ""),
  });
  if (!parsed.ok) return fail(parsed.message);
  const { fullName, email, password, whatsapp } = parsed.data;

  const ip = (await headers()).get("x-forwarded-for") ?? "unknown";
  if (!(await checkRateLimit(`register:${ip}`, REGISTER_ATTEMPTS, REGISTER_WINDOW_MS))) {
    return fail("Terlalu banyak percobaan pendaftaran. Coba lagi dalam 15 menit.");
  }
  if (isDisposableEmail(email)) return fail("Email sementara tidak diizinkan. Gunakan email aktif.");

  const existing = await getUserByEmail(email);
  if (existing) return fail(emailConflictMessage(existing.role, "player"));

  try {
    await createPlayerAccount({ email, name: fullName, passwordHash: await bcrypt.hash(password, PASSWORD_HASH_ROUNDS), whatsapp });
  } catch (error) {
    return fail(toSafeActionMessage(error, "Gagal membuat akun."));
  }

  const signedIn = await signIn(email, password);
  if (!signedIn.ok) return fail("Akun berhasil dibuat, tapi login gagal. Silakan login manual.");

  return redirectToLocale(returnTo ?? "/player", locale);
}
