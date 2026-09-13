"use client";

import React, { useMemo, useState } from "react";

export type PublicScheduleMatch = {
  id: string;
  roundLabel: string;
  home: string | null;
  away: string | null;
  status: "scheduled" | "delayed" | "postponed" | "live" | "completed";
  homeScore: number | null;
  awayScore: number | null;
  start: string | null;
  room: string | null;
  bestOf: number;
};

function wib(value: string, locale: "id" | "en") {
  return `${new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value))} WIB`;
}

export function PublicScheduleBoard({ matches, locale, timezone, unpublished = false }: { matches: PublicScheduleMatch[]; locale: "id" | "en"; timezone: string; unpublished?: boolean }) {
  const [round, setRound] = useState("all");
  const id = locale === "id";
  const rounds = useMemo(() => [...new Set(matches.map((match) => match.roundLabel))], [matches]);
  const visible = round === "all" ? matches : matches.filter((match) => match.roundLabel === round);
  if (!matches.length) return <p role="status" data-event-timezone={timezone} className="rounded-[var(--radius-control)] border border-dashed border-[var(--color-border)] p-6 text-[var(--color-text-muted)]">{unpublished ? (id ? "Organizer belum menerbitkan jadwal." : "The organizer has not published the schedule yet.") : (id ? "Belum ada pertandingan." : "No matches are available yet.")}</p>;

  return <div className="grid min-w-0 gap-5" data-event-timezone={timezone}>
    <label className="grid max-w-sm gap-2 text-sm font-bold">{id ? "Babak" : "Round"}<select name="round" className="min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3" value={round} onChange={(event) => setRound(event.target.value)}><option value="all">{id ? "Semua babak" : "All rounds"}</option>{rounds.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
    <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map((match) => <article key={match.id} className="min-w-0 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{match.roundLabel} · BO{match.bestOf}</span><span className="font-bold text-[var(--color-brand-cyan)]">{match.status === "completed" ? (id ? "Selesai" : "Completed") : match.status === "live" ? "Live" : match.status}</span></div>
      <h2 className="mt-3 break-words text-lg font-extrabold">{match.home ?? "TBD"} <span className="font-normal text-[var(--color-text-muted)]">vs</span> {match.away ?? "TBD"}</h2>
      {match.status === "completed" ? <p className="mt-2 text-2xl font-extrabold tabular-nums">{match.homeScore} – {match.awayScore}</p> : null}
      <p className="mt-3 text-sm text-[var(--color-text-muted)]">{match.start ? wib(match.start, locale) : "TBD"}{match.room ? ` · ${match.room}` : ""}</p>
      <details className="mt-4 border-t border-[var(--color-border)] pt-3"><summary className="min-h-11 cursor-pointer py-2 font-bold">{id ? "Detail pertandingan" : "Match detail"}</summary><dl className="grid grid-cols-2 gap-2 text-sm"><dt>{id ? "Format" : "Format"}</dt><dd className="text-right">BO{match.bestOf}</dd><dt>{id ? "Lokasi" : "Location"}</dt><dd className="text-right">{match.room ?? "TBD"}</dd><dt>{id ? "Waktu" : "Time"}</dt><dd className="text-right">{match.start ? wib(match.start, locale) : "TBD"}</dd></dl></details>
    </article>)}</div>
  </div>;
}
