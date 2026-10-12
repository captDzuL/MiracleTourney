// Request helpers shared by the server actions. Plain module on purpose: not a server action file.
// Moved out of actions.ts without changes (refactor PR 1.4).

import { getLocalizedRedirectPath, redirectToActiveLocale } from "@/i18n/redirect";
import { safeEntityIdSchema } from "@/lib/security/request-guard";
import { redirect } from "next/navigation";

export const actionEntityId = safeEntityIdSchema;

export async function redirectToRequestedLocale(path: string, locale?: string): Promise<never> {
  if (locale === "id" || locale === "en") {
    redirect(getLocalizedRedirectPath(path, locale));
  }

  return redirectToActiveLocale(path);
}
