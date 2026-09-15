"use client";
import React from "react";
import { useTranslations } from "next-intl";
import type { CompetitionWorkspaceState, WorkspaceMatch, WorkspaceQuery } from "@/lib/competition/workspace-types";
import { link, surface, matchLabel, matchStatus, teamName, workspaceHref } from "./presentation";

export function MatchQueue({ state, matches, selectedId, base, query, locale, schedule = false }: {
  state: CompetitionWorkspaceState; matches: WorkspaceMatch[]; selectedId?: string; base: string; query: WorkspaceQuery; locale: "id" | "en"; schedule?: boolean;
}) {
  const t = useTranslations("organizerOperations");
  const pages = Math.max(1, Math.ceil(matches.length / 12));
  const requested = Number(query.page);
  const page = Math.min(pages, Number.isSafeInteger(requested) && requested > 0 ? requested : 1);
  const rows = matches.slice((page - 1) * 12, page * 12);
  const date = (start: string | null) => start ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: state.event.timezone }).format(new Date(start)) : t("unscheduled");
  const selectedHref = (match: WorkspaceMatch) => workspaceHref(base, query, { match: match.id, page: String(page) });
  return <section className={surface} aria-label={t(schedule ? "fixtures" : "queue")}>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">{t(schedule ? "fixtures" : "queue")}</h2><span className="text-sm tabular-nums text-[var(--color-text-subtle)]">{matches.length}</span></div>
    {!rows.length ? <p className="py-6 text-sm text-[var(--color-text-subtle)]">{t("noMatches")}</p> : schedule ?
      <div className="miracle-focus-ring max-h-[36rem] max-w-full overflow-auto" role="region" aria-label={t("fixtures")} tabIndex={0}>
        <table className="w-full min-w-[620px] text-left text-sm"><thead><tr>{["time","room","teams","round","status"].map(key=><th key={key} scope="col" className="border-b border-[var(--color-border)] p-3 text-xs font-semibold text-[var(--color-text-subtle)]">{t(key)}</th>)}</tr></thead>
        <tbody>{rows.map(match=><tr key={match.id} className="border-b border-[var(--color-border)]"><td className="p-3">{date(match.start)}</td><td className="p-3">{match.room || t("roomPending")}</td><td className="p-3"><a data-match-row={match.id} href={selectedHref(match)} className="miracle-focus-ring inline-flex min-h-11 items-center font-semibold text-[var(--color-brand-cyan)]">{teamName(state,match.homeTeamId,t)} — {teamName(state,match.awayTeamId,t)}</a></td><td className="p-3">{matchLabel(state,match,t)}</td><td className="p-3">{t(matchStatus(match))}</td></tr>)}</tbody></table>
      </div> :
      <div className="grid gap-2">{rows.map(match=><a key={match.id} data-match-row={match.id} href={selectedHref(match)} aria-current={selectedId===match.id ? "true" : undefined} className={"miracle-focus-ring grid min-h-11 min-w-0 gap-2 rounded-xl border p-3 transition-colors motion-reduce:transition-none hover:bg-[var(--color-surface-subtle)] " + (selectedId===match.id ? "border-[var(--color-brand-cyan)] bg-[var(--color-surface-subtle)]" : "border-[var(--color-border)]")}>
        <div className="flex flex-wrap justify-between gap-2 text-xs text-[var(--color-text-subtle)]"><span>{matchLabel(state,match,t)}</span><span className="font-semibold text-[var(--color-brand-cyan)]">{t(matchStatus(match))}</span></div>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 font-bold"><span className="break-words">{teamName(state,match.homeTeamId,t)}</span><span className="tabular-nums text-[var(--color-text-subtle)]">{match.resultVersion ? `${match.homeScore} : ${match.awayScore}` : "—"}</span><span className="break-words text-right">{teamName(state,match.awayTeamId,t)}</span></div>
        <p className="break-words text-xs text-[var(--color-text-subtle)]">{date(match.start)} · {match.room || t("roomPending")} · {t("bestOf",{count:match.bestOf})}</p>
      </a>)}</div>}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] pt-4"><p className="text-xs text-[var(--color-text-subtle)]">{t("page",{page,pages,total:matches.length})}</p><div className="flex gap-2">
      {page>1 && <a data-previous className={link} href={workspaceHref(base,query,{page:String(page-1)})}>{t("previous")}</a>}
      {page<pages && <a data-next className={link} href={workspaceHref(base,query,{page:String(page+1)})}>{t("nextPage")}</a>}
    </div></div>
  </section>;
}
