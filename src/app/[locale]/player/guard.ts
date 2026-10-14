import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { redirectToActiveLocale } from "@/i18n/redirect";
import { requireRole } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/feature-flags";
import type { AppUser } from "@/lib/platform/types";

export type PlayerLocale = "id" | "en";

/**
 * Opens a page of the player area: a known language, solo tournaments switched on, and a signed-in
 * player. Anybody else is sent to sign in, so no page reads anything for a caller who is not the player.
 */
export async function openPlayerPage(params: Promise<{ locale: string }>): Promise<{ locale: PlayerLocale; user: AppUser }> {
  const { locale } = await params;
  if (locale !== "id" && locale !== "en") notFound();
  setRequestLocale(locale);
  if (!isFeatureEnabled("solo_tournament_v1")) notFound();

  const user = await requireRole("player");
  if (!user) return redirectToActiveLocale("/login");
  return { locale, user };
}
