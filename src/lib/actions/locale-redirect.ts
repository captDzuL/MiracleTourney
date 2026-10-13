import { redirect } from "next/navigation";

import { getLocalizedRedirectPath, redirectToActiveLocale } from "@/i18n/redirect";

/** Redirects within the locale the page asked for, or the active one when none was given. */
export async function redirectToLocale(path: string, locale: string): Promise<never> {
  if (locale === "id" || locale === "en") {
    redirect(getLocalizedRedirectPath(path, locale));
  }
  return redirectToActiveLocale(path);
}
