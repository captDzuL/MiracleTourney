import { workspacePage, type WorkspacePageProps } from "@/lib/competition/workspace-page";
import React from "react";
import {notFound} from "next/navigation";
import {isFeatureEnabled} from "@/lib/feature-flags";
import {requireAnyRole} from "@/lib/auth/session";
import {redirectToActiveLocale} from "@/i18n/redirect";
import {readCompetitionWorkspace} from "@/lib/competition/workspace-read";
import {readEventMatchStatistics} from "@/lib/platform/repository";
import {MatchResultStatisticsWorkspace} from "@/components/v3/organizer/matches/MatchResultStatisticsWorkspace";

export default async function MatchPage(props:WorkspacePageProps){
 if(!isFeatureEnabled("organizer_master_shell_v3"))return workspacePage(props,"match");
 const {locale,eventId,matchId:requested}=await props.params;
 if((locale!=="en"&&locale!=="id")||!isFeatureEnabled("organizer_workspace_v3")||!isFeatureEnabled("competition_operations_v3"))notFound();
 try{
  const actor=await requireAnyRole(["organizer","admin","platform_admin"]);
  if(!actor)return redirectToActiveLocale("/login");
  if(actor.role==="organizer"&&actor.mustChangePassword)return redirectToActiveLocale("/organizer/change-password");
  const state=await readCompetitionWorkspace(eventId);
  let matchId=requested;
  if(matchId&&!state.matches.some(row=>row.id===matchId)){try{matchId=decodeURIComponent(matchId);}catch{notFound();}}
  if(!matchId||!state.matches.some(row=>row.id===matchId))notFound();
  if(state.compatibility)return workspacePage(props,"match");
  const statistics=await readEventMatchStatistics(eventId,matchId,actor.id);
  const query=await props.searchParams;
  const view=typeof query?.view==="string"&&["result","statistics","history"].includes(query.view)?query.view:"result";
  return <MatchResultStatisticsWorkspace key={eventId+":"+matchId} initialState={state} statistics={statistics} matchId={matchId} locale={locale} view={view}/>;
 }catch(error){
  const message=error instanceof Error?error.message:"";
  if(message==="Unauthorized")return redirectToActiveLocale("/login");
  if(message==="Password change required")return redirectToActiveLocale("/organizer/change-password");
  if(message==="Not authorized"||message==="Match not found"||message.includes("unavailable"))notFound();
  throw error;
 }
}
