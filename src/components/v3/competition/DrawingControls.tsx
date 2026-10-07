"use client";

import React from "react";
import { ArrowDown, ArrowUp, Shuffle, Trophy } from "lucide-react";

import { Button } from "@/components/v3/Button";
import type { CompetitionWorkspaceState } from "@/lib/competition/workspace-types";
import { generateCompetitionGraph } from "@/lib/tournament/competition";
import type { Run, Translate } from "./CompetitionWorkspace";

const drawingPanel = "min-w-0 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5";

export function DrawingControls({
  state,
  busy,
  run,
  t,
}: {
  state: CompetitionWorkspaceState;
  busy: boolean;
  run: Run;
  t: Translate;
}) {
  const [orderedIds, setOrderedIds] = React.useState(() => {
    const selected = state.drawing?.teams
      .slice()
      .sort((left, right) => left.seed - right.seed)
      .map((team) => team.id);
    return selected?.length ? selected : state.teams.map((team) => team.id);
  });
  const names = React.useMemo(
    () => new Map(state.teams.map((team) => [team.id, team.name])),
    [state.teams],
  );
  const seeded = orderedIds.map((id, index) => ({ id, seed: index + 1 }));
  const preview = React.useMemo(() => {
    if (!state.event.config || seeded.length < 2) return [];
    try {
      const graph = generateCompetitionGraph({
        eventId: state.event.id,
        config: state.event.config,
        teams: seeded,
      });
      const firstRound = Math.min(...graph.matches.map((match) => match.round));
      return graph.matches.filter((match) => match.round === firstRound).map((match) => ({
        id: match.id,
        home: match.home.kind === "team" ? names.get(match.home.teamId) ?? match.home.teamId : t("TBD", "TBD"),
        away: match.away.kind === "team" ? names.get(match.away.teamId) ?? match.away.teamId : t("TBD", "TBD"),
      }));
    } catch {
      return [];
    }
  }, [names, seeded, state.event.config, state.event.id, t]);

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= orderedIds.length) return;
    setOrderedIds((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function shuffle() {
    setOrderedIds((current) => {
      const next = [...current];
      for (let index = next.length - 1; index > 0; index--) {
        const swapWith = Math.floor(Math.random() * (index + 1));
        [next[index], next[swapWith]] = [next[swapWith], next[index]];
      }
      return next;
    });
  }

  return (
    <section className={drawingPanel} aria-labelledby="drawing-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="drawing-title" className="flex items-center gap-2 text-lg font-bold">
            <Trophy aria-hidden="true" size={20} />
            {t("Official drawing", "Drawing resmi")}
          </h2>
          <p className="mt-1 text-sm text-[var(--color-text-subtle)]">
            {!state.matches.length ? <strong>{t("No matches yet", "Belum ada pertandingan")}. </strong> : null}
            {t(
              "Registration order never becomes a public seed automatically. Review this order, save a private draft, then publish it explicitly.",
              "Urutan pendaftaran tidak pernah otomatis menjadi seed publik. Tinjau urutan ini, simpan draft privat, lalu terbitkan secara eksplisit.",
            )}
          </p>
        </div>
        <span className="rounded-full border border-[var(--color-border-strong)] px-3 py-1 text-xs font-bold uppercase tracking-wide">
          {state.drawing?.status === "draft" ? t("Private draft", "Draft privat") : t("Not saved", "Belum disimpan")}
        </span>
      </div>

      <ol className="mt-4 grid gap-2">
        {orderedIds.map((id, index) => {
          const name = names.get(id) ?? id;
          return (
            <li key={id} className="flex min-h-11 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-2">
              <span className="w-8 text-center font-bold tabular-nums">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">{name}</span>
              <Button
                variant="secondary"
                disabled={busy || index === 0}
                aria-label={t(`Move ${name} up`, `Naikkan ${name}`)}
                onClick={() => move(index, -1)}
              >
                <ArrowUp aria-hidden="true" size={16} />
                <span className="sr-only">{t(`Move ${name} up`, `Naikkan ${name}`)}</span>
              </Button>
              <Button
                variant="secondary"
                disabled={busy || index === orderedIds.length - 1}
                aria-label={t(`Move ${name} down`, `Turunkan ${name}`)}
                onClick={() => move(index, 1)}
              >
                <ArrowDown aria-hidden="true" size={16} />
                <span className="sr-only">{t(`Move ${name} down`, `Turunkan ${name}`)}</span>
              </Button>
            </li>
          );
        })}
      </ol>

      <div className="mt-3 flex flex-wrap gap-3">
        <Button variant="secondary" disabled={busy || orderedIds.length < 2} onClick={shuffle}>
          <Shuffle aria-hidden="true" size={16} /> {t("Shuffle", "Acak")}
        </Button>
        <Button
          disabled={busy || !state.event.config || orderedIds.length < 2}
          onClick={() => state.event.config && void run({
            kind: "drawing_save",
            config: state.event.config,
            teams: seeded,
          })}
        >
          {t("Save drawing draft", "Simpan draft drawing")}
        </Button>
        {state.drawing?.status === "draft" ? (
          <>
            <Button disabled={busy} onClick={() => void run({ kind: "drawing_publish" })}>
              {t("Publish drawing", "Terbitkan drawing")}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => void run({ kind: "drawing_reset" })}>
              {t("Reset drawing", "Reset drawing")}
            </Button>
          </>
        ) : null}
      </div>

      <div className="mt-5" aria-label={t("Drawing preview", "Pratinjau drawing")}>
        <h3 className="font-bold">{t("Preview", "Pratinjau")}</h3>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {preview.map((match) => (
            <p key={match.id} className="rounded-lg border border-[var(--color-border)] p-3 text-sm">
              {match.home} <span className="px-2 text-[var(--color-brand-cyan)]">vs</span> {match.away}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
