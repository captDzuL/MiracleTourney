import { randomUUID } from "node:crypto";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { CompletionWorkspace } from "@/components/v3/completion/CompletionWorkspace";
import { redirectToActiveLocale } from "@/i18n/redirect";
import { requireAnyRole } from "@/lib/auth/session";
import { loadCompletionWorkspace } from "@/lib/completion/workspace";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getManageableEventDraft } from "@/lib/platform/repository";

type CompletionPageProps = {
  params: Promise<{ locale: string; eventId: string }>;
};

export default async function CompletionPage({ params }: CompletionPageProps) {
  const { locale, eventId } = await params;
  if (locale !== "id" && locale !== "en") notFound();
  setRequestLocale(locale);

  if (!isFeatureEnabled("completion_workspace_v3")) {
    return redirectToActiveLocale(`/organizer/events/${eventId}/overview`);
  }

  const user = await requireAnyRole(["organizer", "platform_admin", "admin"]);
  if (!user) return redirectToActiveLocale("/login");
  if (user.role === "organizer" && user.mustChangePassword) {
    return redirectToActiveLocale("/organizer/change-password");
  }

  const event = await getManageableEventDraft(user, eventId);
  if (!event) notFound();

  const state = await loadCompletionWorkspace(event, locale);

  return <CompletionWorkspace
    completionIdempotencyKey={randomUUID()}
    reopenIdempotencyKey={randomUUID()}
    state={state}
  />;
}
