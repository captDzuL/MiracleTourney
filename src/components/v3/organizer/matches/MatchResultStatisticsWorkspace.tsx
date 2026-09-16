"use client";
import React,{useRef,useState} from "react";
import {useTranslations} from "next-intl";
import {useRouter} from "next/navigation";
import {Button} from "@/components/v3/Button";
import type {CompetitionWorkspaceState} from "@/lib/competition/workspace-types";
import type {EventMatchStatistics} from "@/lib/platform/repository";
import {saveEventPlayerStatsAction,approveEventPlayerStatsAction,rejectEventPlayerStatsAction,type PlayerStatsActionResult} from "@/lib/actions/player-stats-v3-actions";
import {useWorkspace} from "../../competition/useWorkspace";
import {MatchGameScoreForm,MatchOperations} from "./MatchGameScoreForm";
import {PlayerStatisticsForm} from "./PlayerStatisticsForm";
import {StatSubmissionReview} from "./StatSubmissionReview";
import {link,surface,matchLabel} from "../match-control/presentation";

type Decision="save"|"approve"|"reject";
type Pending={form:FormData;decision:Decision};
export function MatchResultStatisticsWorkspace({initialState,statistics:data,matchId,locale,view:requestedView}:{
 initialState:CompetitionWorkspaceState;statistics:EventMatchStatistics;matchId:string;locale:"id"|"en";view:string;
}) {
 const t=useTranslations("organizerMatch"),operationsText=useTranslations("organizerOperations");
 const workspace=useWorkspace(initialState),router=useRouter();
 const {state}=workspace,match=state.matches.find(match=>match.id===matchId)!;
 const view=["result","statistics","history"].includes(requestedView)?requestedView:"result";
 const [saving,setSaving]=useState(false),[feedback,setFeedback]=useState<PlayerStatsActionResult["status"]|null>(null);
 const [uncertain,setUncertain]=useState(false),pending=useRef<Pending|null>(null),inFlight=useRef(false);
 const base=`/${locale}/organizer/events/${encodeURIComponent(state.event.id)}/matches/${encodeURIComponent(matchId)}`;
 const stale=data.eventVersion!==state.event.version||data.resultVersion!==match.resultVersion;
 const disabled=workspace.busy||saving||uncertain||stale||match.status!=="Completed"||data.scoreContextUnavailable;
 const date=(value:string)=>new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"short",timeZone:state.event.timezone}).format(new Date(value));
 async function execute(request:Pending){
  if(inFlight.current)return;inFlight.current=true;setSaving(true);setFeedback(null);pending.current=request;
  try{
   const action=request.decision==="save"?saveEventPlayerStatsAction:request.decision==="approve"?approveEventPlayerStatsAction:rejectEventPlayerStatsAction;
   const result=await action(request.form);setFeedback(result.status);
   if(result.status==="failed"){setUncertain(true);return;}
   pending.current=null;setUncertain(false);
   if(result.status==="saved"||result.status==="conflict"){router.refresh();await workspace.refresh();}
  }catch{setFeedback("failed");setUncertain(true);}
  finally{inFlight.current=false;setSaving(false);}
 }
 async function submit(form:FormData,decision:Decision){
  if(disabled||inFlight.current)return;
  Object.entries({locale,eventId:state.event.id,matchId,expectedVersion:String(data.eventVersion),expectedResultVersion:String(data.resultVersion),operationId:crypto.randomUUID()}).forEach(([key,value])=>form.set(key,value));
  await execute({form,decision});
 }
 const displayMatch=data.resultVersion===match.resultVersion?{...match,games:data.games}:match;
 const auditAction=(action:string)=>t(action==="player_stats_save"?"actionSave":action==="player_stats_approve"?"actionApprove":action==="player_stats_reject"?"actionReject":action==="result_submit"||action==="result_correct"?"actionResult":"actionOther");
 return <section data-match-workspace className="miracle-v3-feedback grid min-w-0 max-w-full gap-5 text-[var(--color-text)]" style={{fontFamily:"var(--font-miracle-v3)","--font-jakarta":"var(--font-miracle-v3)","--font-mono":"var(--font-miracle-v3)"} as React.CSSProperties}>
  <div className="flex flex-wrap items-center justify-between gap-3"><a className={link} href={`/${locale}/organizer/events/${encodeURIComponent(state.event.id)}/match-control?match=${encodeURIComponent(matchId)}`}>{t("back")}</a><Button variant="secondary" disabled={saving} onClick={()=>{router.refresh();void workspace.refresh();}}>{t("refresh")}</Button></div>
  <header><h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1><p className="mt-2 text-sm text-[var(--color-text-subtle)]">{t("description")}</p></header>
  <section className={surface+" grid gap-4"} aria-label={t("official")}>
   <p className="text-sm text-[var(--color-text-subtle)]">{matchLabel(state,match,operationsText)} · BO{match.bestOf}</p>
   <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-center">
    <h2 className="break-words text-base font-bold sm:text-xl">{state.teams.find(team=>team.id===match.homeTeamId)?.name??operationsText("tbd")}</h2>
    <strong data-official-score className="text-2xl text-[var(--color-brand-cyan)] sm:text-4xl">{match.resultVersion?`${match.homeScore} : ${match.awayScore}`:"—"}</strong>
    <h2 className="break-words text-base font-bold sm:text-xl">{state.teams.find(team=>team.id===match.awayTeamId)?.name??operationsText("tbd")}</h2>
   </div>
   <p className="text-center text-sm text-[var(--color-text-subtle)]">{match.resultVersion?t("version",{version:match.resultVersion}):t("noResult")} · {t("eventVersion",{version:state.event.version})}</p>
  </section>
  <nav aria-label={t("title")} className="flex flex-wrap gap-2">{["result","statistics","history"].map(item=><a key={item} data-match-view={item} href={`${base}?view=${item}`} aria-current={view===item?"page":undefined} className={link+(view===item?" bg-[var(--color-surface-active)]":"")}>{t(item)}</a>)}</nav>
  {workspace.connectionError&&<p role="alert" className={surface}>{t("connection")}</p>}
  {workspace.actionError&&<div role="alert" className={surface}>{t(workspace.actionError==="conflict"?"conflict":workspace.actionError==="unauthorized"?"unauthorized":"failed")}{workspace.canRetry&&<Button disabled={workspace.busy} onClick={()=>void workspace.retry()}>{t("retry")}</Button>}</div>}
  {(saving||feedback||workspace.busy||workspace.saved)&&<p role={feedback&&feedback!=="saved"?"alert":"status"}>{saving||workspace.busy?t("saving"):feedback?t(feedback):t("saved")}</p>}
  {uncertain&&<Button disabled={saving} onClick={()=>pending.current&&void execute(pending.current)}>{t("retry")}</Button>}
  <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
   <div className="grid min-w-0 gap-5">
    {view==="result"&&<><MatchGameScoreForm state={state} match={displayMatch} busy={workspace.busy||saving||uncertain} run={workspace.run}/>{!["Completed","Bye"].includes(match.status)&&<MatchOperations state={state} match={match} locale={locale} busy={workspace.busy||saving||uncertain} run={workspace.run}/>}</>}
    {view==="statistics"&&<>
     <p id="player-score-guide" className={surface+" text-sm text-[var(--color-text-subtle)]"}>{t("scoreGuide")}</p>
     {match.status!=="Completed"&&<p role="status" className={surface}>{t("recordFirst")}</p>}
     {data.scoreContextUnavailable&&<p role="alert">{t("contextUnavailable")}</p>}
     {stale&&<p role="alert">{t("stale")}</p>}
     {data.teams.map(team=><PlayerStatisticsForm key={`${team.id}:${data.eventVersion}`} team={team} data={data} disabled={disabled} onSave={form=>submit(form,"save")}/>)}
     <h2 className="text-xl font-bold">{t("captain")}</h2><p className="text-sm text-[var(--color-text-subtle)]">{t("pendingGuide")}</p>
     {!data.submissions.length&&<p className={surface}>{t("noSubmissions")}</p>}
     {data.submissions.map(submission=><StatSubmissionReview key={`${submission.id}:${submission.submittedAt}:${data.eventVersion}`} submission={submission} data={data} locale={locale} timeZone={state.event.timezone} disabled={disabled} onReview={submit}/>)}
    </>}
    {view==="history"&&<>
     <section className={surface}><h2 className="text-xl font-bold">{t("resultHistory")}</h2><p className="mt-2 text-xs text-[var(--color-text-subtle)]">{t("latest")}</p><ol className="mt-4 grid max-h-[32rem] gap-4 overflow-auto">{data.revisions.map(revision=><li data-result-revision key={revision.id} className="break-words border-t border-[var(--color-border)] pt-3 text-sm"><strong>{t("revision",{version:revision.version})} · {revision.homeScore} : {revision.awayScore}</strong><p>{revision.reason==="Official result submission"?t("actionResult"):revision.reason}</p><p>{t("recordedBy",{actor:revision.actorUserId})} · {date(revision.createdAt)}</p></li>)}</ol>{!data.revisions.length&&<p>{t("noHistory")}</p>}</section>
     <section className={surface}><h2 className="text-xl font-bold">{t("reviewHistory")}</h2><ol className="mt-4 grid gap-3">{data.submissions.map(submission=><li key={submission.id} className="break-words border-t border-[var(--color-border)] pt-3 text-sm"><strong>{data.teams.find(team=>team.id===submission.teamId)?.name} · {t(["pending","approved","rejected"].includes(submission.status)?submission.status:"unknown")}</strong><p>{submission.rejectionNote}</p><p>{date(submission.reviewedAt??submission.submittedAt)} {submission.reviewedBy&&t("recordedBy",{actor:submission.reviewedBy})}</p></li>)}</ol></section>
     <section className={surface}><h2 className="text-xl font-bold">{t("audit")}</h2><ol className="mt-4 grid max-h-80 gap-3 overflow-auto">{state.audit.filter(row=>row.matchId===matchId).map(row=><li key={row.id} className="break-words border-t border-[var(--color-border)] pt-3 text-sm"><strong>{auditAction(row.action)}</strong>{row.reason&&row.reason!=="Official result submission"&&<p>{row.reason}</p>}<p>{row.at&&date(row.at)} · {row.actor}</p></li>)}</ol></section>
    </>}
   </div>
   <aside className={surface}><details open><summary className="miracle-focus-ring flex min-h-11 cursor-pointer items-center font-semibold">{t("guide")}</summary><p className="mt-3 text-sm leading-relaxed text-[var(--color-text-subtle)]">{t("guideBody")}</p></details></aside>
  </div>
 </section>;
}
