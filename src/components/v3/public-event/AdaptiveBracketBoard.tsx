import React from "react";
import type { AdaptivePhaseStanding } from "@/lib/events/adaptive-public-phases";

type Match = {
  id: string;
  roundLabel: string;
  home: string | null;
  away: string | null;
  status: "scheduled" | "delayed" | "postponed" | "live" | "completed";
  homeScore: number | null;
  awayScore: number | null;
};

export function AdaptiveBracketBoard({ locale, format, matches, standings, registrationSlots = 0 }: { locale: "id" | "en"; format: string; matches: Match[]; standings: AdaptivePhaseStanding[]; registrationSlots?: number }) {
  const id = locale === "id";
  const league = format === "round_robin";
  const rounds = [...Map.groupBy(matches, (match) => match.roundLabel).entries()];

  if (registrationSlots > 0 && !league) {
    return <section className="min-w-0" aria-labelledby="bracket-template-heading">
      <h2 id="bracket-template-heading" className="text-xl font-extrabold">{id ? "Template bracket" : "Bracket template"}</h2>
      <p className="mt-2 text-[var(--color-text-muted)]">{id ? "Seed akan ditentukan dan diterbitkan oleh organizer." : "Seeds will be decided and published by the organizer."}</p>
      <div className="mt-5 max-w-full overflow-x-auto overscroll-x-contain pb-2"><ol className="grid min-w-[36rem] grid-cols-2 gap-3">{Array.from({ length: registrationSlots }, (_, index) => <li key={index} className="rounded-[var(--radius-control)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4"><span className="mr-3 text-sm text-[var(--color-text-muted)]">#{index + 1}</span><strong>TBD</strong></li>)}</ol></div>
    </section>;
  }

  return <div className="grid min-w-0 gap-6">
    {standings.length ? <section aria-labelledby="adaptive-standings-heading"><h2 id="adaptive-standings-heading" className="text-xl font-extrabold">{id ? "Klasemen" : "Standings"}</h2><div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-2">{standings.map((table, tableIndex) => <div key={`${table.phaseId}:${table.groupId}`} className="min-w-0 overflow-x-auto rounded-[var(--radius-control)] border border-[var(--color-border)]"><table className="w-full min-w-[32rem] text-sm"><caption className="p-3 text-left font-bold">{table.groupId ? `${id ? "Grup" : "Group"} ${tableIndex + 1}` : (id ? "Klasemen umum" : "Overall standings")}</caption><thead><tr className="border-y border-[var(--color-border)] text-left"><th className="p-3">#</th><th className="p-3">{id ? "Tim" : "Team"}</th><th className="p-3">{id ? "Main" : "Played"}</th><th className="p-3">{id ? "Poin" : "Points"}</th></tr></thead><tbody>{table.rows.map((row) => <tr key={row.teamId} className="border-b border-[var(--color-border)] last:border-0"><td className="p-3 tabular-nums">{row.rank}</td><td className="p-3 font-bold">{row.name}</td><td className="p-3 tabular-nums">{row.played}</td><td className="p-3 tabular-nums">{row.points}</td></tr>)}</tbody></table></div>)}</div></section> : null}

    {!league && rounds.length ? <section aria-labelledby="adaptive-bracket-heading"><h2 id="adaptive-bracket-heading" className="text-xl font-extrabold">Bracket</h2><div className="mt-4 max-w-full overflow-x-auto overscroll-x-contain pb-2"><div className="flex min-w-max items-stretch gap-5">{rounds.map(([roundLabel, roundMatches]) => <section key={roundLabel} className="flex w-72 shrink-0 flex-col rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4"><h3 className="font-extrabold">{roundLabel}</h3><div className="mt-4 flex flex-1 flex-col justify-around gap-4">{roundMatches.map((match) => <article key={match.id} className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"><p className="break-words font-bold">{match.home ?? "TBD"}</p><p className="my-2 text-sm text-[var(--color-text-muted)]">vs</p><p className="break-words font-bold">{match.away ?? "TBD"}</p>{match.status === "completed" ? <p className="mt-3 border-t border-[var(--color-border)] pt-3 text-xl font-extrabold tabular-nums">{match.homeScore} – {match.awayScore}</p> : <p className="mt-3 text-sm text-[var(--color-text-muted)]">{match.status === "live" ? "Live" : id ? "Menunggu hasil" : "Awaiting result"}</p>}</article>)}</div></section>)}</div></div></section> : null}

    {!standings.length && (league || !rounds.length) ? <p role="status" className="rounded-[var(--radius-control)] border border-dashed border-[var(--color-border)] p-6 text-[var(--color-text-muted)]">{id ? "Bracket atau klasemen resmi belum tersedia." : "The official bracket or standings are not available yet."}</p> : null}
  </div>;
}
