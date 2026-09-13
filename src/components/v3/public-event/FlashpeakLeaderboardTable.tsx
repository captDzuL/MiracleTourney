"use client";

import React, { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Search } from "lucide-react";

import {
  sortFlashpeakLeaderboard,
  type FlashpeakLeaderboardEntry,
  type LeaderboardSortDirection,
  type LeaderboardSortKey,
} from "@/lib/player-stats/flashpeak";

const SORT_KEYS: LeaderboardSortKey[] = ["game", "score", "goal", "assist", "passing", "defense"];

const copy = {
  id: {
    search: "Cari pemain",
    allTeams: "Semua tim",
    allPositions: "Semua posisi",
    rank: "Peringkat",
    player: "Pemain",
    position: "Posisi",
    game: "Game",
    score: "Skor",
    goal: "Gol",
    assist: "Assist",
    passing: "Umpan",
    defense: "Defense",
    empty: "Tidak ada pemain yang cocok dengan filter.",
  },
  en: {
    search: "Search players",
    allTeams: "All teams",
    allPositions: "All positions",
    rank: "Rank",
    player: "Player",
    position: "Position",
    game: "Games",
    score: "Score",
    goal: "Goals",
    assist: "Assists",
    passing: "Passing",
    defense: "Defense",
    empty: "No players match the filters.",
  },
} as const;

export function FlashpeakLeaderboardTable({
  entries,
  locale,
}: {
  entries: readonly FlashpeakLeaderboardEntry[];
  locale: "id" | "en";
}) {
  const t = copy[locale];
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState("all");
  const [position, setPosition] = useState("all");
  const [sortKey, setSortKey] = useState<LeaderboardSortKey>("score");
  const [direction, setDirection] = useState<LeaderboardSortDirection>("desc");
  const teams = useMemo(() => [...new Map(entries.map((entry) => [entry.teamId, entry.teamName])).entries()]
    .sort((left, right) => left[1].localeCompare(right[1])), [entries]);
  const positions = useMemo(() => [...new Set(entries.map((entry) => entry.position).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right)), [entries]);
  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase(locale);
    const filtered = entries.filter((entry) => {
      const matchesQuery = !normalizedQuery
        || entry.nickname.toLocaleLowerCase(locale).includes(normalizedQuery)
        || entry.playerName.toLocaleLowerCase(locale).includes(normalizedQuery);
      return matchesQuery
        && (team === "all" || entry.teamId === team)
        && (position === "all" || entry.position === position);
    });
    return sortFlashpeakLeaderboard(filtered, sortKey, direction);
  }, [direction, entries, locale, position, query, sortKey, team]);

  function toggle(key: LeaderboardSortKey) {
    if (key === sortKey) {
      setDirection((current) => current === "desc" ? "asc" : "desc");
      return;
    }
    setSortKey(key);
    setDirection("desc");
  }

  return (
    <div className="grid min-w-0 gap-4">
      <div className="grid gap-3 md:grid-cols-[minmax(14rem,1fr)_12rem_12rem]">
        <label className="relative">
          <span className="sr-only">{t.search}</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-[var(--color-text-subtle)]" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.search}
            className="min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface-subtle)] pl-10 pr-3 miracle-focus-ring"
          />
        </label>
        <label>
          <span className="sr-only">{t.allTeams}</span>
          <select value={team} onChange={(event) => setTeam(event.target.value)} className="min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface-subtle)] px-3 miracle-focus-ring">
            <option value="all">{t.allTeams}</option>
            {teams.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">{t.allPositions}</span>
          <select value={position} onChange={(event) => setPosition(event.target.value)} className="min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface-subtle)] px-3 miracle-focus-ring">
            <option value="all">{t.allPositions}</option>
            {positions.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-panel)] border border-[var(--color-border)]">
        <table className="w-full min-w-[880px] border-collapse text-left text-sm">
          <thead className="bg-[var(--color-surface-subtle)] text-xs uppercase tracking-wider text-[var(--color-text-subtle)]">
            <tr>
              <th className="px-4 py-3">{t.rank}</th>
              <th className="px-4 py-3">{t.player}</th>
              <th className="px-4 py-3">{t.position}</th>
              {SORT_KEYS.map((key) => {
                const active = sortKey === key;
                return (
                  <th
                    key={key}
                    aria-sort={active ? direction === "desc" ? "descending" : "ascending" : undefined}
                    className="px-2 py-1"
                  >
                    <button
                      type="button"
                      data-sort-key={key}
                      onClick={() => toggle(key)}
                      className="miracle-focus-ring inline-flex min-h-11 w-full items-center justify-end gap-1 rounded-md px-2 font-bold"
                    >
                      {t[key]}
                      {active ? direction === "desc" ? <ArrowDown aria-hidden="true" size={14} /> : <ArrowUp aria-hidden="true" size={14} /> : null}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((entry, index) => (
              <tr key={entry.playerId} className="border-t border-[var(--color-border)]">
                <td className="px-4 py-3 font-bold tabular-nums">{index + 1}</td>
                <td className="px-4 py-3">
                  <span className="block font-bold">{entry.nickname}</span>
                  <span className="block text-xs text-[var(--color-text-subtle)]">{entry.teamName}</span>
                </td>
                <td className="px-4 py-3">{entry.position || "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums">{entry.game}</td>
                <td className="px-4 py-3 text-right font-bold tabular-nums">{entry.score === null ? "—" : entry.score.toFixed(1)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{entry.goal}</td>
                <td className="px-4 py-3 text-right tabular-nums">{entry.assist}</td>
                <td className="px-4 py-3 text-right tabular-nums">{entry.passing}</td>
                <td className="px-4 py-3 text-right tabular-nums">{entry.defense}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length ? <p className="p-6 text-center text-sm text-[var(--color-text-subtle)]">{t.empty}</p> : null}
      </div>
    </div>
  );
}
