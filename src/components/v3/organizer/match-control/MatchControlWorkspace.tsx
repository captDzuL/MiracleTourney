"use client";
import React from "react";
import { useTranslations } from "next-intl";
import { Activity, AlertTriangle, CalendarDays } from "lucide-react";
import { Button } from "@/components/v3/Button";
import type { CompetitionWorkspaceState, WorkspaceQuery } from "@/lib/competition/workspace-types";
import { useWorkspace } from "../../competition/useWorkspace";
import { DrawingControls } from "../../competition/DrawingControls";
import { ScheduleControls } from "../../competition/ScheduleControls";
import type { Translate } from "../../competition/CompetitionWorkspace";
import { MatchQueue } from "./MatchQueue";
import { SelectedMatchPanel } from "./SelectedMatchPanel";
import { FormatContextPanel } from "./FormatContextPanel";
import { actionLabel, activeCompetition, control, link, localDay, matchLabel, matchesFilter, surface, workspaceHref } from "./presentation";

export function MatchControlWorkspace({initialState,locale,view,query={}}:{
  initialState:CompetitionWorkspaceState;locale:"id"|"en";view:"competition"|"schedule"|"match-control";query?:WorkspaceQuery;
}) {
  const t=useTranslations("organizerOperations");
  const workspace=useWorkspace(initialState);
  const {state,busy,run}=workspace;
  const base=`/${locale}/organizer/events/${encodeURIComponent(state.event.id)}/${view}`;
  const title=view==="competition"?"titleCompetition":view==="schedule"?"titleSchedule":"titleControl";
  const description=view==="competition"?"descriptionCompetition":view==="schedule"?"descriptionSchedule":"descriptionControl";
  const filters=["all","live","next","needs-result","readiness","action","incidents","delayed","completed"];
  const filter=filters.includes(query.filter??"") ? query.filter! : "all";
  const groups=state.graph?.groups??[];
  const group=groups.some(group=>group.id===query.group)?query.group:undefined;
  const phases=state.graph?.phases??[];
  const phase=phases.some(phase=>phase.id===query.phase)?query.phase:undefined;
  const rounds=[...new Set(state.graph?.matches.filter(match=>(!group||match.groupId===group)&&(!phase||match.phaseId===phase)).map(match=>match.round)??[])].sort((a,b)=>a-b);
  const round=rounds.includes(Number(query.round))?query.round:undefined;
  const days=[...new Set(state.matches.map(match=>localDay(match.start,state.event.timezone)).filter(Boolean))].sort();
  const day=days.includes(query.matchday??"")?query.matchday:undefined;
  const matches=state.matches.filter(match=>
    (!group||match.groupId===group)&&(!phase||match.phaseId===phase)&&
    (!round||state.graph?.matches.find(node=>node.id===match.id)?.round===Number(round))&&
    (!day||localDay(match.start,state.event.timezone)===day)&&
    (view==="competition"||matchesFilter(state,match,filter)));
  // Keep selection stable across filtering and polling; never select a foreign ID.
  const selected=query.match ? state.matches.find(match=>match.id===query.match) : matches[0];
  const controls=t.raw("controls") as {source:string;label:string}[];
  const translateControl:Translate=(english)=>{
    const move=/^Move (.*) (up|down)$/.exec(english);
    if(move) return t(move[2]==="up"?"moveUp":"moveDown",{name:move[1]});
    return controls.find(row=>row.source===english)?.label??t("details");
  };
  const diagnostic = (row: {code:string;message:string;matchIds:string[]}) => ({...row,message:t(t.has("diagnostics."+row.code)?"diagnostics."+row.code:"diagnostics.UNKNOWN")});
  const localizeSchedule = (schedule: CompetitionWorkspaceState["schedule"]) => schedule ? {...schedule,draft:{...schedule.draft,conflicts:schedule.draft.conflicts.map(diagnostic),warnings:schedule.draft.warnings.map(diagnostic)}} : null;
  const localizedState:CompetitionWorkspaceState={...state,schedule:localizeSchedule(state.schedule),publishedSchedule:localizeSchedule(state.publishedSchedule),teams:[...state.teams,...[...new Set(state.matches.flatMap(match=>[match.homeTeamId,match.awayTeamId]))].filter(id=>!state.teams.some(team=>team.id===id)).map(id=>({id,name:t("tbd")}))],matches:state.matches.map(match=>({...match,roundLabel:matchLabel(state,match,t)}))};
  const formQuery={...query,group:group??"",phase:phase??"",round:round??"",matchday:day??""};
  const actionMatch=(matchId:string|null)=>state.matches.find(match=>match.id===matchId);
  const lifecycleLocked=!activeCompetition(state);
  const drawingPublished=state.drawingPublished ?? state.drawing?.status==="published";
  const drawingMutable=state.event.status==="Registration Closed" && !drawingPublished && !state.matches.some(match=>match.resultVersion>0||["Live","Completed"].includes(match.status));
  const select=(name:"group"|"round"|"matchday"|"phase",options:{value:string;label:string}[])=>options.length>0&&<label className="grid min-w-0 gap-2 text-sm">{t(name)}<select className={control} name={name} defaultValue={formQuery[name]}><option value="">{t("all")}</option>{options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  return <section data-operations className="miracle-v3-feedback grid min-w-0 max-w-full gap-5 text-[var(--color-text)]" style={{fontFamily:"var(--font-miracle-v3)", "--font-jakarta":"var(--font-miracle-v3)", "--font-mono":"var(--font-miracle-v3)"} as React.CSSProperties} aria-label={t(title)}>
    <header className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><p className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-subtle)]"><Activity aria-hidden="true" size={16}/>{state.event.timezone} · {t("revision",{version:state.event.version})}</p><h1 className="text-2xl font-extrabold tracking-tight">{t(title)}</h1><p className="mt-2 max-w-2xl text-sm text-[var(--color-text-subtle)]">{t(description)}</p></div><Button variant="secondary" onClick={()=>void workspace.refresh()}>{t("refresh")}</Button></header>
    {workspace.connectionError&&<div role="alert" className={surface}><p>{t("connection")}</p><Button className="mt-3" onClick={()=>void workspace.refresh()}>{t("retry")}</Button></div>}
    {workspace.actionError&&<div role="alert" className={surface}><p>{t(workspace.actionError==="conflict"?"conflict":workspace.actionError==="unauthorized"?"unauthorized":"failed")}</p>{workspace.canRetry&&<Button className="mt-3" disabled={busy} onClick={()=>void workspace.retry()}>{t("retryAction")}</Button>}</div>}
    {!!state.unavailableSections.length&&<p role="alert" className={surface}>{t("partial")}</p>}
    <p role="status" aria-live="polite" className="text-sm text-[var(--color-text-subtle)]">{busy?t("saving"):workspace.saved?t("saved"):""}</p>
    {view==="match-control"&&<>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{["live","needs-result","readiness","action"].map(key=><a key={key} href={workspaceHref(base,query,{filter:key,page:"1"})} className={surface+" miracle-focus-ring hover:border-[var(--color-brand-cyan)]"}><span className="block text-xs text-[var(--color-text-subtle)]">{t(key)}</span><strong data-action-count={key==="action"?"":undefined} className="mt-2 block text-2xl font-bold tabular-nums">{key==="action"?state.actions.length:state.matches.filter(match=>matchesFilter(state,match,key)).length}</strong></a>)}</div>
      {!!state.actions.length && <section className={surface} aria-label={t("action")}>
        <h2 className="flex items-center gap-2 text-lg font-bold"><AlertTriangle aria-hidden="true" size={18}/>{t("action")}</h2>
        <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto">{state.actions.map(action => {
          const match = actionMatch(action.matchId);
          const destination = action.matchId
            ? workspaceHref(base, query, {match:action.matchId, filter:"action", page:"1"})
            : `/${locale}/organizer/events/${encodeURIComponent(state.event.id)}/competition#competition-standings`;
          return <a key={action.id} data-event-action={action.matchId ? undefined : action.id} className="miracle-focus-ring flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] p-3 text-sm" href={destination}>
            <span className="font-semibold">{t(action.priority==="critical"?"priorityCritical":action.priority==="urgent"?"priorityUrgent":"prioritySoon")} · {match ? matchLabel(state,match,t) : t("eventAction")}</span>
            <span className="min-w-0">
              <span className="block font-semibold text-[var(--color-brand-cyan)]">{actionLabel(action.title,t)}</span>
              {!action.matchId && action.detail==="Unresolved ranks cannot qualify automatically" && <span className="mt-1 block text-[var(--color-text-subtle)]">{t("tiebreakQualificationBlocked")}</span>}
              {!action.matchId && <span className="mt-2 block text-xs font-semibold text-[var(--color-brand-cyan)]">{t("reviewStandings")}</span>}
            </span>
          </a>;
        })}</div>
      </section>}
    </>}
    <form key={JSON.stringify(formQuery)} method="get" action={base} aria-label={t("filter")} className={surface+" grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-4"}>
      {view!=="competition"&&<label className="grid min-w-0 gap-2 text-sm">{t("filter")}<select name="filter" defaultValue={filter} className={control}>{filters.map(value=><option key={value} value={value}>{t(value)}</option>)}</select></label>}
      {select("phase",phases.map(phase=>({value:phase.id,label:t(phase.kind)})))}
      {select("group",groups.map(group=>({value:group.id,label:t("groupLabel",{label:group.label})})))}
      {view!=="competition"&&select("round",rounds.map(round=>({value:String(round),label:t(state.event.config?.kind==="round_robin"||group?"dayLabel":"roundLabel",{round})})))}
      {view!=="competition"&&select("matchday",days.map(value=>({value,label:new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeZone:"UTC"}).format(new Date(value+"T00:00:00Z"))})))}
      {query.match&&<input type="hidden" name="match" value={query.match}/>}
      <div className="flex flex-wrap gap-2"><Button type="submit">{t("apply")}</Button><a className={link} href={base}>{t("reset")}</a></div>
    </form>
    {view==="competition"?<>
      {state.event.status==="Finished"?<p className={surface}>{t("finished")}</p>:drawingMutable?<DrawingControls key={state.event.id} state={localizedState} busy={busy} run={run} t={translateControl}/>:<p className={surface}>{t(drawingPublished?"drawingLocked":"closeRegistration")}</p>}
      <FormatContextPanel state={state} locale={locale} groupId={group} phaseId={phase}/>
    </>:view==="schedule"?<>
      <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--color-text-subtle)]"><CalendarDays aria-hidden="true" size={18}/>{state.event.publishedScheduleVersion===null?t("unpublished"):t("published",{version:state.event.publishedScheduleVersion})}</div>
      <MatchQueue state={state} matches={matches} selectedId={selected?.id} base={base} query={query} locale={locale} schedule/>
      {!!state.matches.length&&<ScheduleControls state={localizedState} busy={busy||lifecycleLocked} run={run} t={translateControl} publicationDisabled={!(state.drawingPublished ?? state.drawing?.status==="published")} visibleMatchIds={matches.map(match=>match.id)} />}
      {query.match&&<SelectedMatchPanel state={state} match={selected} missing={!selected} busy={busy} run={run} locale={locale}/>}
    </>:<div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
      <MatchQueue state={state} matches={matches} selectedId={selected?.id} base={base} query={query} locale={locale}/>
      <div className="grid min-w-0 gap-5"><SelectedMatchPanel state={state} match={selected} missing={!!query.match&&!selected} busy={busy} run={run} locale={locale}/>{(groups.length>0||state.event.config?.kind==="round_robin")&&<FormatContextPanel state={state} locale={locale} groupId={group??selected?.groupId??groups[0]?.id} phaseId={phase} compact/>}</div>
    </div>}
  </section>;
}
