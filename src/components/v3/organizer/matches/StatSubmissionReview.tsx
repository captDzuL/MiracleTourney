"use client";
import React,{useState} from "react";
import {useTranslations} from "next-intl";
import {Button} from "@/components/v3/Button";
import type {EventMatchStatistics} from "@/lib/platform/repository";
import {getPlayerStatNumericValue} from "@/lib/player-stats/form";
import {control,surface} from "../match-control/presentation";
export function StatSubmissionReview({submission,data,locale,timeZone,disabled,onReview}:{submission:EventMatchStatistics["submissions"][number];data:EventMatchStatistics;locale:"id"|"en";timeZone:string;disabled:boolean;onReview:(form:FormData,decision:"approve"|"reject")=>Promise<void>}) {
 const t=useTranslations("organizerMatch"),[invalid,setInvalid]=useState(false);
 const team=data.teams.find(team=>team.id===submission.teamId);
 const decimal=new Intl.NumberFormat(locale,{minimumFractionDigits:1,maximumFractionDigits:1});
 const date=(value:string)=>new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"short",timeZone}).format(new Date(value));
 function review(form:HTMLFormElement,decision:"approve"|"reject"){
  if(disabled)return;
  const values=new FormData(form);if(decision==="reject"&&!String(values.get("rejectionNote")??"").trim()){setInvalid(true);form.querySelector("textarea")?.focus();return;}
  setInvalid(false);void onReview(values,decision);
 }
 return <form data-submission={submission.id} className={surface+" grid gap-4"} onSubmit={event=>{event.preventDefault();review(event.currentTarget,"reject");}}>
  <input type="hidden" name="submissionId" value={submission.id}/><input type="hidden" name="submittedAt" value={submission.submittedAt}/>
  <div className="flex flex-wrap justify-between gap-3"><h3 className="font-bold">{team?.name??t("unknown")}</h3><span className="text-sm text-[var(--color-brand-cyan)]">{t(["pending","approved","rejected"].includes(submission.status)?submission.status:"unknown")}</span></div>
  <p className="text-sm text-[var(--color-text-subtle)]">{t("submitted",{time:date(submission.submittedAt)})}</p>
  <div className="max-h-80 max-w-full overflow-auto" tabIndex={0} role="region" aria-label={t("captain")}>
   <table className="w-full border-collapse text-sm"><thead><tr><th scope="col" className="p-2 text-left">{t("player")}</th>{data.scoreGameNumbers?.map(number=><th scope="col" className="min-w-28 p-2" key={number}>{t("score",{number})}</th>)}{data.allowedStatKeys.map(key=><th scope="col" className="min-w-24 p-2" key={key}>{t.has(key)?t(key):t("details")}</th>)}</tr></thead>
    <tbody>{Object.entries(submission.stats).map(([id,stats])=><tr key={id} className="border-t border-[var(--color-border)]"><th scope="row" className="p-2 text-left">{team?.players.find(p=>p.id===id)?.nickname??t("unknown")}</th>{data.scoreGameNumbers?.map((number,index)=><td key={number} className="p-2 text-center">{Array.isArray(stats.scores)&&stats.scores[index]!=null?decimal.format(stats.scores[index]!):"—"}</td>)}{data.allowedStatKeys.map(key=><td key={key} className="p-2 text-center">{getPlayerStatNumericValue(stats,key).toLocaleString(locale)}</td>)}</tr>)}</tbody>
   </table>
  </div>
  {submission.status==="pending"?<>
   <label className="grid gap-2 text-sm">{t("rejectionNote")}<textarea name="rejectionNote" className={control} maxLength={4000} disabled={disabled} aria-invalid={invalid} aria-describedby={invalid?"review-error-"+submission.id:undefined}/></label>
   {invalid&&<p role="alert" id={"review-error-"+submission.id}>{t("rejectionNote")}</p>}
   <div className="flex flex-wrap gap-3"><Button type="button" disabled={disabled} onClick={event=>review(event.currentTarget.form!,"approve")}>{t("approve")}</Button><Button type="submit" variant="secondary" disabled={disabled}>{t("reject")}</Button></div>
  </>:<>{submission.rejectionNote&&<p className="break-words">{submission.rejectionNote}</p>}{submission.reviewedAt&&<p className="text-sm">{t("reviewed",{time:date(submission.reviewedAt)})}</p>}</>}
 </form>;
}
