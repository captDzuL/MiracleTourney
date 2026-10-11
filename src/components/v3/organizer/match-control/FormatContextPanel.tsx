"use client";
import React from "react";
import { useTranslations } from "next-intl";
import type { CompetitionWorkspaceState } from "@/lib/competition/workspace-types";
import type { OperationCommand } from "@/lib/tournament/operations";
import { DisqualifyTeamPanel } from "../../competition/DisqualifyTeamPanel";
import { link, matchLabel, surface, teamName } from "./presentation";

export function FormatContextPanel({state,locale,groupId,phaseId,compact=false,run,busy=false,canDisqualify=false}:{
  state:CompetitionWorkspaceState;locale:"id"|"en";groupId?:string;phaseId?:string;compact?:boolean;
  run?:(command:OperationCommand)=>Promise<void>;busy?:boolean;canDisqualify?:boolean;
}){
  const t=useTranslations("organizerOperations");
  const [target,setTarget]=React.useState<string|null>(null);
  const closeTarget=React.useCallback(()=>setTarget(null),[]);
  const disqualify=canDisqualify&&!compact&&!!run;
  const groups=state.graph?.groups.filter(group=>!groupId||group.id===groupId)??[];
  const tables=state.standings.filter(table=>(!groupId||table.groupId===groupId)&&(!phaseId||table.phaseId===phaseId));
  return <section id={compact ? undefined : "competition-standings"} className={surface+" scroll-mt-4"} aria-label={t("standings")}>
    <h2 className="text-lg font-bold">{t(state.event.config?.kind==="round_robin"?"round_robin":"standings")}</h2>
    {groups.map(group=><div key={group.id} className="mt-4 rounded-lg border border-[var(--color-border)] p-3 text-sm"><strong>{t("groupLabel",{label:group.label})}</strong><p className="mt-1 text-[var(--color-brand-cyan)]">{t("qualification",{count:group.qualificationCutline})}</p><p className="mt-1 text-xs text-[var(--color-text-subtle)]">{t(state.standings.find(table=>table.groupId===group.id)?.complete?"qualificationComplete":"qualificationPending")}</p></div>)}
    {tables.map(table=><div key={table.groupId||table.phaseId} className="mt-4">
      {table.groupId && <h3 className="mb-2 font-semibold">{t("groupLabel",{label:state.graph?.groups.find(group=>group.id===table.groupId)?.label??""})}</h3>}
      {!table.rows.length ? <p className="text-sm text-[var(--color-text-subtle)]">{t("emptyStandings")}</p> :
      <div tabIndex={0} role="region" aria-label={t("standings")} className="miracle-focus-ring max-h-96 max-w-full overflow-auto"><table className={"w-full text-left text-sm "+(compact?"min-w-[280px]":"min-w-[480px]")}><thead><tr>{["rank","teams","played","points",...(disqualify?["disqualify"]:[])].map(key=><th scope="col" key={key} className="border-b border-[var(--color-border)] p-2 text-xs text-[var(--color-text-subtle)]">{key==="disqualify"?<span className="sr-only">{t(key)}</span>:t(key)}</th>)}</tr></thead><tbody>{table.rows.map(row=><tr key={row.teamId} className="border-b border-[var(--color-border)]"><td className="p-2 tabular-nums">{row.rank}</td><td className="p-2 font-semibold">{teamName(state,row.teamId,t)}{row.tied&&<span className="block text-xs text-[var(--color-text-subtle)]">{t("tied")}</span>}{row.rank<=(groups.find(group=>group.id===table.groupId)?.qualificationCutline??0)&&<span className="block text-xs text-[var(--color-brand-cyan)]">{t("qualified")}</span>}</td><td className="p-2">{row.played}</td><td className="p-2 font-bold">{row.points}</td>{disqualify&&<td className="p-2"><button type="button" disabled={busy} onClick={()=>setTarget(row.teamId)} className={link+" text-[var(--color-danger,#dc2626)]"} aria-label={`${t("disqualify")} ${teamName(state,row.teamId,t)}`}>{t("disqualify")}</button></td>}</tr>)}</tbody></table></div>}
      {!!table.disqualified?.length&&<div className="mt-3 rounded-lg border border-[var(--color-border)] p-3 text-sm"><strong>{t("disqualifiedTeams")}</strong><ul className="mt-2 grid gap-1">{table.disqualified.map(id=>{const entry=state.graph?.disqualifications?.find(item=>item.teamId===id);return <li key={id} className="break-words"><span className="line-through">{teamName(state,id,t)}</span> <span className="text-xs font-semibold text-[var(--color-text-subtle)]">· {t("disqualified")}{entry?.reason?` — ${entry.reason}`:""}</span></li>;})}</ul></div>}
    </div>)}
    {disqualify&&target&&run&&<div className="mt-4"><DisqualifyTeamPanel key={target} state={state} teamId={target} locale={locale} busy={busy} run={run} onClose={closeTarget}/></div>}
    {!compact && state.graph?.phases.filter(phase=>(!phaseId||phase.id===phaseId)&&phase.kind!=="groups"&&phase.kind!=="round_robin").map(phase=><section key={phase.id} className="mt-5">
      <h3 className="mb-3 font-bold">{state.event.config?.kind==="group_playoffs"&&<span>{t("playoffs")} · </span>}{t(phase.kind)}</h3>
      <div role="region" aria-label={t("canvas")} tabIndex={0} className="miracle-focus-ring grid max-h-[32rem] max-w-full gap-3 overflow-auto rounded-lg border border-[var(--color-border)] p-3 md:grid-cols-2">
        {state.matches.filter(match=>match.phaseId===phase.id).map(match=><a className={link+" min-w-0 flex-col items-start gap-2 break-words"} key={match.id} href={`/${locale}/organizer/events/${encodeURIComponent(state.event.id)}/match-control?match=${encodeURIComponent(match.id)}`}><span className="text-xs text-[var(--color-text-subtle)]">{matchLabel(state,match,t)}</span><span>{teamName(state,match.homeTeamId,t)} — {teamName(state,match.awayTeamId,t)}</span></a>)}
      </div>
    </section>)}
  </section>;
}
