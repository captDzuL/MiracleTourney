import React from "react";
import { notFound } from "next/navigation";
import { redirectToActiveLocale } from "@/i18n/redirect";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { CompetitionWorkspace } from "@/components/v3/competition/CompetitionWorkspace";
import type { WorkspaceView } from "./workspace-types";
import { readCompetitionWorkspace } from "./workspace-read";

export type WorkspacePageProps = { params: Promise<{ locale: string; eventId: string; matchId?: string }> };
export async function workspacePage({ params }: WorkspacePageProps, view: WorkspaceView) {
  const { locale, eventId, matchId } = await params;
  if ((locale !== "en" && locale !== "id") || !isFeatureEnabled("competition_operations_v3") || !isFeatureEnabled("organizer_workspace_v3")) notFound();
  let state;
  try { state = await readCompetitionWorkspace(eventId); }
  catch (error) {
    if (error instanceof Error) {
      if (error.message === "Unauthorized") return redirectToActiveLocale("/login");
      if (error.message === "Password change required") return redirectToActiveLocale("/organizer/change-password");
      if (error.message === "Not authorized" || error.message.includes("unavailable")) notFound();
    }
    throw error;
  }
  if (view === "match" && !state.matches.some(m => m.id === matchId)) notFound();
  return <CompetitionWorkspace key={`${eventId}:${view}:${matchId || ""}`} initialState={state} locale={locale} view={view} matchId={matchId} />;
}
