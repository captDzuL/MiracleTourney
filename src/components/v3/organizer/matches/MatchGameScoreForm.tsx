"use client";
import React,{useState} from "react";
import {useTranslations} from "next-intl";
import {Button} from "@/components/v3/Button";
import {ResultControls,DelayControls} from "../../competition/WorkspaceForms";
import {control,surface} from "../match-control/presentation";
import type {Run,Translate} from "../../competition/CompetitionWorkspace";
import type {CompetitionWorkspaceState,WorkspaceMatch} from "@/lib/competition/workspace-types";

export function MatchGameScoreForm({state,match,busy,run}:{state:CompetitionWorkspaceState;match:WorkspaceMatch;busy:boolean;run:Run}) {
  const t=useTranslations("organizerMatch");
  const [editing,setEditing]=useState(false);
  const controls=t.raw("controls") as {source:string;label:string}[];
  const translate:Translate=english=>controls.find(row=>row.source===english)?.label??t("details");
  return <div className="grid min-w-0 gap-4">
    {match.resultVersion>0&&<div className="grid gap-3">
      <p className="text-sm text-[var(--color-text-subtle)]">{t("correctionGuide")}</p>
      <Button variant="secondary" disabled={busy} onClick={()=>setEditing(!editing)}>{t(editing?"cancel":"reopen")}</Button>
    </div>}
    {(match.resultVersion===0||editing)&&<ResultControls state={state} match={{...match,games:[...match.games].sort((a,b)=>a.gameNumber-b.gameNumber)}} t={translate} busy={busy} run={run}/>}
  </div>;
}

export function MatchOperations({state,match,busy,run,locale}:{state:CompetitionWorkspaceState;match:WorkspaceMatch;busy:boolean;run:Run;locale:"id"|"en"}){
 const t=useTranslations("organizerMatch");
 const controls=t.raw("controls") as {source:string;label:string}[];
 const translate:Translate=english=>controls.find(row=>row.source===english)?.label??t("details");
 const locked=busy||!["Registration Closed","Ongoing"].includes(state.event.status??"")||["Live","Completed","Bye"].includes(match.status);
 return <details open className={surface}>
  <summary className="miracle-focus-ring flex min-h-11 cursor-pointer items-center font-bold">{t("operations")}</summary>
  <section className="mt-4 grid gap-4" aria-label={t("readiness")}>
   <div className="grid gap-3 sm:grid-cols-2">{[match.homeTeamId,match.awayTeamId].filter(Boolean).map(teamId=>{
    const name=state.teams.find(team=>team.id===teamId)?.name??t("unknown");
    return <div key={teamId} className="min-w-0 rounded-lg border border-[var(--color-border)] p-3"><h3 className="break-words font-bold">{name}</h3><div className="mt-3 flex flex-wrap gap-2">{(["checked_in","ready","not_ready","pending"] as const).map(status=><Button key={status} variant="secondary" disabled={locked} onClick={()=>void run({kind:"readiness_update",matchId:match.id,teamId,status})}>{name}: {t(status==="pending"?"pendingReadiness":status)}</Button>)}</div></div>;
   })}</div>
   <Button variant="secondary" disabled={locked} onClick={()=>void run({kind:"readiness_deadline",matchId:match.id})}>{t("deadline")}</Button>
   <form aria-label={t("start")} className="grid gap-3" onSubmit={event=>{event.preventDefault();if(!locked)void run({kind:"match_start",matchId:match.id,reason:String(new FormData(event.currentTarget).get("reason")??"")});}}>
    <label className="grid gap-2 text-sm">{t("override")}<input name="reason" className={control} maxLength={4000} disabled={locked}/></label><Button type="submit" disabled={locked}>{t("start")}</Button>
   </form>
   <DelayControls state={state} match={match} t={translate} busy={busy} run={run} locale={locale}/>
  </section>
 </details>;
}
