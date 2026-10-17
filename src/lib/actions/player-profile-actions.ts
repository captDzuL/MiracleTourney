"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { withServerActionLog, writeServerLog } from "@/lib/observability/logger";
import { normalizeWhatsapp } from "@/lib/player/profile";
import { savePlayerWhatsapp } from "@/lib/player/profile-repository";
import { checkRateLimit } from "@/lib/rate-limit";
import { describeActionError } from "@/lib/security/public-error";

import { redirectToLocale } from "./locale-redirect";

const ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;
const PROFILE_PATH = "/player/profile";

const back = (locale: string, key: "success" | "error", value: string) =>
  redirectToLocale(`${PROFILE_PATH}?${new URLSearchParams({ [key]: value })}`, locale);

/** Saves the signed-in player's WhatsApp number. Always ends in a redirect to the profile page. */
export async function updatePlayerProfileAction(formData: FormData): Promise<never> {
  return withServerActionLog("player_profile_update", "/server-actions/player-profile", () => updateProfile(formData));
}

async function updateProfile(formData: FormData): Promise<never> {
  const locale = String(formData.get("locale") ?? "").trim();
  if (!isFeatureEnabled("solo_tournament_v1")) return redirectToLocale("/login", locale);

  const player = await requireRole("player");
  if (!player) return redirectToLocale("/login", locale);

  const whatsapp = normalizeWhatsapp(String(formData.get("whatsapp") ?? ""));
  if (whatsapp === null) return back(locale, "error", "invalid-whatsapp");
  if (!(await checkRateLimit(`player-profile:${player.id}`, ATTEMPTS, WINDOW_MS))) return back(locale, "error", "too-many");

  // A redirect works by throwing, so it must stay outside the try block or the catch would swallow it.
  try {
    await savePlayerWhatsapp(player.id, whatsapp);
  } catch (error) {
    const { name, code } = describeActionError(error);
    writeServerLog({ phase: "failed", operation: "player_profile_update", route: "/server-actions/player-profile", requestId: randomUUID(), durationMs: 0, status: 500, errorCode: code ?? name });
    return back(locale, "error", "save-failed");
  }
  revalidatePath(PROFILE_PATH);
  return back(locale, "success", "saved");
}
