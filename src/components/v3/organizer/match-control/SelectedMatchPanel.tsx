"use client";
import React from "react";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/v3/Button";
import type { CompetitionWorkspaceState, WorkspaceMatch } from "@/lib/competition/workspace-types";
import type { Run } from "../../competition/CompetitionWorkspace";
import { activeCompetition, link, matchLabel, matchStatus, surface, teamName, terminal } from "./presentation";

export function SelectedMatchPanel({state, match, locale, busy, run, missing = false}:{
  state:CompetitionWorkspaceState;match?:WorkspaceMatch;locale:"id"|"en";busy:boolean;run:Run;missing?:boolean;
}) {
  const t=useTranslations("organizerOperations");
  if(!match) return <aside className={surface} aria-label={t("selected")}><h2 className="text-lg font-bold">{t("selected")}</h2><p className="mt-3 text-sm text-[var(--color-text-subtle)]">{t(missing?"missingSelection":"selectPrompt")}</p></aside>;
  const locked=busy || !activeCompetition(state) || !(state.drawingPublished ?? state.drawing?.status==="published") || terminal(match);
  const assignment=state.publishedSchedule?.draft.assignments.find(row=>row.matchId===match.id);
  const scheduled=!!assignment && state.publishedSchedule?.version===state.event.publishedScheduleVersion && match.scheduleVersion===state.event.publishedScheduleVersion && !!match.start && !!match.end && !!match.room && Date.parse(match.end)>Date.parse(match.start) && assignment.roomId===match.room && Date.parse(assignment.start)===Date.parse(match.start) && Date.parse(assignment.end)===Date.parse(match.end);
  const participants=[match.homeTeamId,match.awayTeamId].filter(id=>state.teams.some(team=>team.id===id));
  const ready=participants.length===2 && participants[0]!==participants[1] && participants.every(teamId=>state.readiness.some(row=>row.matchId===match.id && row.teamId===teamId && row.status==="ready"));
  return <aside className={surface+" self-start"} aria-label={t("selected")}>
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-cyan)]">{t("selected")}</p><h2 className="mt-2 text-lg font-bold">{matchLabel(state,match,t)}</h2></div><span className="rounded-full border border-[var(--color-border-strong)] px-3 py-1 text-xs">{t(matchStatus(match))}</span></div>
    <h3 className="mt-5 break-words text-xl font-bold">{teamName(state,match.homeTeamId,t)} <span className="text-[var(--color-text-subtle)]">—</span> {teamName(state,match.awayTeamId,t)}</h3>
    <p className="mt-2 break-words text-sm text-[var(--color-text-subtle)]">{match.room||t("roomPending")} · {t("bestOf",{count:match.bestOf})}</p>
    <h3 className="mt-5 flex items-center gap-2 font-bold"><ShieldCheck size={18} aria-hidden="true"/>{t("readiness")}</h3>
    <div className="mt-3 grid gap-3">{participants.map(teamId=>{
      const row=state.readiness.find(row=>row.matchId===match.id&&row.teamId===teamId);
      const status=["ready","checked_in","not_ready"].includes(row?.status??"") ? row!.status : "pending";
      return <div key={teamId} className="min-w-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-3"><div className="flex flex-wrap justify-between gap-2 text-sm"><strong className="break-words">{teamName(state,teamId,t)}</strong><span>{t(status)}</span></div>{row?.note && <p className="mt-2 break-words text-xs text-[var(--color-text-subtle)]">{row.note}</p>}<Button data-readiness className="mt-3" variant="secondary" disabled={locked||status==="ready"} onClick={()=>void run({kind:"readiness_update",matchId:match.id,teamId,status:"ready"})}>{t("markReady",{team:teamName(state,teamId,t)})}</Button></div>;
    })}</div>
    <p className="my-4 text-sm text-[var(--color-text-subtle)]">{t(locked&&!busy?"operationalLock":"startBlocked")}</p>
    <div className="grid gap-3"><Button disabled={locked||!scheduled||!ready} onClick={()=>void run({kind:"match_start",matchId:match.id})}>{t("start")}</Button><a data-match-detail className={link} href={`/${locale}/organizer/events/${encodeURIComponent(state.event.id)}/matches/${encodeURIComponent(match.id)}?view=result`}>{t("openMatch")}</a></div>
    <p className="mt-4 text-xs text-[var(--color-text-subtle)]">{t("incidentCount",{count:state.incidents.filter(row=>row.matchId===match.id&&!row.resolvedAt).length})} · {t("actionCount",{count:state.actions.filter(row=>row.matchId===match.id).length})}</p>
    <ul className="mt-3 grid max-h-48 gap-2 overflow-y-auto">{state.incidents.filter(row=>row.matchId===match.id&&!row.resolvedAt).map(row=><li key={row.id} className="break-words rounded-lg border border-[var(--color-border)] p-3 text-sm">{row.description}</li>)}</ul>
  </aside>;
}
