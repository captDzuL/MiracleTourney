import React from "react";
import { notFound } from "next/navigation";
import { redirectToActiveLocale } from "@/i18n/redirect";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { CompetitionWorkspace } from "@/components/v3/competition/CompetitionWorkspace";
import type { WorkspaceView, WorkspaceQuery } from "./workspace-types";
import { readCompetitionWorkspace } from "./workspace-read";

export type WorkspacePageProps = { params: Promise<{ locale: string; eventId: string; matchId?: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> };
export async function workspacePage({ params, searchParams }: WorkspacePageProps, view: WorkspaceView) {
  const { locale, eventId, matchId: requestedMatchId } = await params;
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
  let matchId = requestedMatchId;
  // Locale middleware can retain one escaped path layer. Prefer a literal owned
  // ID, otherwise decode once; never use the URL value without the scoped lookup.
  if (matchId && !state.matches.some(m => m.id === matchId)) {
    try { matchId = decodeURIComponent(matchId); } catch { notFound(); }
  }
  if (view === "match" && !state.matches.some(m => m.id === matchId)) notFound();
  const rawQuery = await searchParams ?? {};
  const query: WorkspaceQuery = {};
  for (const key of ["filter", "group", "round", "matchday", "phase", "match", "page"] as const) {
    const value = rawQuery[key];
    if (typeof value === "string" && value.length <= 300) query[key] = value;
  }
  return <CompetitionWorkspace key={`${eventId}:${view}:${matchId || ""}`} initialState={state} locale={locale} view={view} matchId={matchId} masterShell={isFeatureEnabled("organizer_master_shell_v3")} query={query} />;
}
