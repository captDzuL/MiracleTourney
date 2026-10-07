"use client";
import React,{useState} from "react";
import {useTranslations} from "next-intl";
import {Button} from "@/components/v3/Button";
import type {EventMatchStatistics} from "@/lib/platform/repository";
import {getPlayerStatNumericValue,parsePlayerStatForm,validatePlayerStatPayload} from "@/lib/player-stats/form";
import {control,surface} from "../match-control/presentation";

export function PlayerStatisticsForm({team,data,disabled,onSave}:{team:EventMatchStatistics["teams"][number];data:EventMatchStatistics;disabled:boolean;onSave:(form:FormData)=>Promise<void>}) {
 const t=useTranslations("organizerMatch"),[invalid,setInvalid]=useState(false),[invalidFields,setInvalidFields]=useState<string[]>([]);
 return <form noValidate data-player-form={team.id} aria-label={team.name} className={surface+" grid gap-4"} onSubmit={event=>{
   event.preventDefault();if(disabled)return;
   const form=new FormData(event.currentTarget);
   const options={allowedStatKeys:data.allowedStatKeys,scoreSlotCount:data.scoreGameNumbers?.length??null};
   const fields=[...event.currentTarget.querySelectorAll<HTMLInputElement>('input[type="number"]')].filter(input=>!input.validity.valid);
   setInvalidFields(fields.map(field=>field.name));
   if(fields.length){setInvalid(true);fields[0].focus();return;}
   try{validatePlayerStatPayload(parsePlayerStatForm(form,options),options);setInvalid(false);void onSave(form);}catch{setInvalid(true);}
 }}>
   <input type="hidden" name="teamId" value={team.id}/>
   <h3 className="text-lg font-bold">{team.name}</h3>
   {!team.players.length?<p>{t("emptyRoster")}</p>:<>
   <div className="max-h-[32rem] max-w-full overflow-auto rounded-lg border border-[var(--color-border)]" tabIndex={0} role="region" aria-label={team.name}>
    <table className="w-full border-collapse text-sm">
     <thead><tr><th className="p-3 text-left" scope="col">{t("player")}</th>{data.scoreGameNumbers?.map(number=><th className="min-w-28 p-3 text-left" scope="col" key={number}>{t("score",{number})}</th>)}{data.allowedStatKeys.map(key=><th className="min-w-28 p-3 text-left" scope="col" key={key}>{t.has(key)?t(key):t("details")}</th>)}</tr></thead>
     <tbody>{team.players.map(player=>{
       const stored=data.stats[player.id],scores=stored?.scores;
       return <tr key={player.id} className="border-t border-[var(--color-border)]">
        <th scope="row" className="min-w-36 p-3 text-left font-semibold">{player.nickname}</th>
        {data.scoreGameNumbers?.map((number,index)=>{const name=`score_${player.id}_${number}`,bad=invalidFields.includes(name);return <td className="p-2" key={number}><input className={control} type="number" inputMode="decimal" min={0} max={10} step={0.1} name={name} aria-label={`${player.nickname}: ${t("score",{number})}`} defaultValue={Array.isArray(scores)?scores[index]??"":""} disabled={disabled} aria-invalid={bad} aria-describedby={bad?`player-score-guide error-${name}`:"player-score-guide"}/>{bad&&<p id={`error-${name}`} className="mt-2 text-xs">{t("scoreGuide")}</p>}</td>;})}
        {data.allowedStatKeys.map(key=>{const name=`stat_${player.id}_${key}`,bad=invalidFields.includes(name);return <td className="p-2" key={key}><input className={control} type="number" inputMode="numeric" min={0} max={9999} step={1} name={name} aria-label={`${player.nickname}: ${t.has(key)?t(key):t("details")}`} defaultValue={getPlayerStatNumericValue(stored,key)} disabled={disabled} aria-invalid={bad} aria-describedby={bad?`error-${name}`:undefined}/>{bad&&<p id={`error-${name}`} className="mt-2 text-xs">{t("invalid")}</p>}</td>;})}
       </tr>;
     })}</tbody>
    </table>
   </div>
   {invalid&&<p role="alert" className="text-sm text-[var(--color-danger)]">{t("invalid")}</p>}
   <Button type="submit" disabled={disabled}>{t("save")}</Button>
   </>}
 </form>;
}
