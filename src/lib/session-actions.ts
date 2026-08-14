"use server";

import { redirectToActiveLocale } from "@/i18n/redirect";
import { signOut } from "@/lib/auth/session";

/** Clears the session cookie and redirects to the home page. */
export async function logoutAction() {
  await signOut();
  await redirectToActiveLocale("/");
}
