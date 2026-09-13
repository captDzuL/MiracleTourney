"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

export type PublicParticipantTeam = {
  id: string;
  name: string;
  tag: string;
  captain: string;
  players: Array<{ id: string; nickname: string; displayName: string; position: string }>;
};

const PAGE_SIZE = 12;

export function PublicParticipantsDirectory({ teams, locale }: { teams: PublicParticipantTeam[]; locale: "id" | "en" }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<PublicParticipantTeam | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const rosterTriggerRef = useRef<HTMLButtonElement | null>(null);
  const id = locale === "id";
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return teams.filter((team) => {
      const rosterComplete = team.players.length > 0;
      const statusMatch = status === "all" || (status === "complete" ? rosterComplete : !rosterComplete);
      const searchMatch = !needle || [team.name, team.tag, team.captain, ...team.players.flatMap((player) => [player.nickname, player.displayName, player.position])]
        .some((value) => value.toLocaleLowerCase().includes(needle));
      return statusMatch && searchMatch;
    });
  }, [query, status, teams]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const resetPage = () => setPage(1);

  useEffect(() => {
    if (!selected) return;
    const dialog = dialogRef.current;
    const trigger = rosterTriggerRef.current;
    if (!dialog) return;
    const focusable = () => [...dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )];
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSelected(null);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      trigger?.focus();
    };
  }, [selected]);

  return <div className="grid min-w-0 gap-5">
    <div className="grid gap-3 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 md:grid-cols-[minmax(0,1fr)_auto]">
      <label className="grid gap-2 text-sm font-bold">
        {id ? "Cari tim atau pemain" : "Search teams or players"}
        <input className="min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3" type="search" value={query} onChange={(event) => { setQuery(event.target.value); resetPage(); }} placeholder={id ? "Nama tim, nickname, posisi…" : "Team, nickname, position…"} />
      </label>
      <label className="grid gap-2 text-sm font-bold">
        {id ? "Status roster" : "Roster status"}
        <select className="min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3" name="roster-status" value={status} onChange={(event) => { setStatus(event.target.value); resetPage(); }}>
          <option value="all">{id ? "Semua status" : "All statuses"}</option>
          <option value="complete">{id ? "Roster lengkap" : "Roster complete"}</option>
          <option value="pending">{id ? "Roster menunggu" : "Roster pending"}</option>
        </select>
      </label>
    </div>

    {visible.length ? <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">{visible.map((team) => <article key={team.id} className="min-w-0 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-lg font-extrabold">{team.name}</p><p className="text-sm text-[var(--color-text-muted)]">{team.tag} · {id ? "Kapten" : "Captain"}: {team.captain}</p></div><span className="rounded-full border border-[var(--color-border)] px-2 py-1 text-xs">{team.players.length ? (id ? "Diterima" : "Accepted") : (id ? "Roster menunggu" : "Roster pending")}</span></div>
      <button className="mt-4 min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-4 text-sm font-bold" type="button" onClick={(event) => { rosterTriggerRef.current = event.currentTarget; setSelected(team); }}>{id ? "Lihat roster" : "View roster"} ({team.players.length})</button>
    </article>)}</div> : <p role="status" className="rounded-[var(--radius-control)] border border-dashed border-[var(--color-border)] p-6 text-[var(--color-text-muted)]">{id ? "Tidak ada peserta yang cocok." : "No matching participants."}</p>}

    <nav aria-label={id ? "Paginasi peserta" : "Participant pagination"} className="flex items-center justify-between gap-3">
      <button type="button" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border)] px-4 disabled:opacity-40">{id ? "Sebelumnya" : "Previous"}</button>
      <span className="text-sm tabular-nums">{currentPage} / {totalPages}</span>
      <button type="button" disabled={currentPage === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border)] px-4 disabled:opacity-40">{id ? "Berikutnya" : "Next"}</button>
    </nav>

    {selected ? <div ref={dialogRef} className="fixed inset-0 z-50 grid place-items-center bg-slate-950/75 p-4" role="dialog" aria-modal="true" aria-labelledby="participant-roster-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
      <section className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4"><div><h2 id="participant-roster-title" className="text-2xl font-extrabold">{selected.name}</h2><p className="text-[var(--color-text-muted)]">{selected.tag}</p></div><button type="button" className="min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border)] px-4" onClick={() => setSelected(null)}>{id ? "Tutup" : "Close"}</button></div>
        {selected.players.length ? <ul className="mt-5 grid gap-3">{selected.players.map((player) => <li key={player.id} className="rounded-[var(--radius-control)] bg-[var(--color-surface-subtle)] p-4"><p className="font-bold">{player.nickname}</p><p className="text-sm text-[var(--color-text-muted)]">{player.displayName} · {player.position}</p></li>)}</ul> : <p className="mt-5 text-[var(--color-text-muted)]">{id ? "Roster belum diterbitkan." : "Roster has not been published."}</p>}
      </section>
    </div> : null}
  </div>;
}
