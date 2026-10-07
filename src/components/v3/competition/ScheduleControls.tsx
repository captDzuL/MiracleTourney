"use client";
import React, { useEffect, useState } from "react";
import { Button } from "@/components/v3/Button";
import type { CompetitionWorkspaceState } from "@/lib/competition/workspace-types";
import { eventDateToLocalInput, eventLocalInputToIso } from "@/lib/events/event-datetime";
import type { ScheduleAssignment } from "@/lib/tournament/scheduling";
import { Field, panel, type Run, type Translate } from "./CompetitionWorkspace";

function scheduleForm(state: CompetitionWorkspaceState) {
  const source = state.schedule ?? state.publishedSchedule;
  const saved = source?.input;
  const local = (value: string | null) => value ? eventDateToLocalInput(new Date(value), state.event.timezone) : "";
  const assignments: Record<string, ScheduleAssignment> = {};
  for (const match of state.matches) {
    const assignment = source?.draft.assignments.find(a => a.matchId === match.id);
    if (assignment) assignments[match.id] = assignment;
    else if (match.start && match.end && match.room) assignments[match.id] = {
      matchId: match.id, start: match.start, end: match.end, roomId: match.room,
    };
  }
  const values: Record<string, string> = {
    windowStart: local(saved?.eventWindow.start ?? state.event.startsAt),
    windowEnd: local(saved?.eventWindow.end ?? null),
    duration: String(saved?.matchDurationMinutes ?? 30),
    buffer: String(saved?.bufferMinutes ?? 5),
    rest: String(saved?.minimumRestMinutes ?? 10),
    rooms: saved?.rooms.join(", ") ?? [...new Set(Object.values(assignments).map(a => a.roomId))].join(", "),
    reason: "",
  };
  for (const match of state.matches) {
    const override = saved?.manualOverrides?.find(a => a.matchId === match.id);
    values[`override-${match.id}`] = local(override?.start ?? null);
    values[`room-${match.id}`] = override?.roomId ?? assignments[match.id]?.roomId ?? "";
  }
  return {
    revision: `${state.schedule ? "draft" : "published"}:${source?.id ?? "none"}:${source?.version ?? 0}`,
    sourceRevision: source ? { id: source.id, version: source.version, status: state.schedule ? "draft" as const : "published" as const } : undefined,
    values,
    assignments,
    locks: [...new Set([...(saved?.lockedMatchIds ?? []), ...state.matches.filter(m => ["live", "completed", "locked"].includes(m.scheduleStatus)).map(m => m.id)])],
    dirty: false,
  };
}

export function ScheduleControls({ state, busy, run, t, visibleMatchIds, publicationDisabled = false }: { state: CompetitionWorkspaceState; busy: boolean; run: Run; t: Translate; visibleMatchIds?: string[]; publicationDisabled?: boolean }) {
  const [error, setError] = useState(false);
  const [form, setForm] = useState(() => scheduleForm(state));
  const incoming = scheduleForm(state);
  const stale = form.revision !== incoming.revision;
  const dirty = form.dirty;
  useEffect(() => {
    if (stale && !dirty) setForm(scheduleForm(state));
  }, [state, stale, dirty]);
  const reload = () => { setForm(scheduleForm(state)); setError(false); };
  const field = (name: string) => ({
    name, value: form.values[name] ?? "",
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setForm(current => ({ ...current, dirty: true, values: { ...current.values, [name]: value } }));
    },
  });
  const local = (value: string | null) => value ? eventDateToLocalInput(new Date(value), state.event.timezone) : "";
  const names = (ids: string[]) => ids.map(id => state.matches.find(m => m.id === id)?.roundLabel || id).join(", ");
  return <section className={panel}>
    <h2 className="mb-3 text-lg font-bold">{t("Schedule generation", "Pembuatan jadwal")}</h2>
    <p className="mb-4 text-sm text-[var(--color-text-subtle)]">
      {t("Review changes before publishing. All times use the event timezone.", "Tinjau perubahan sebelum diterbitkan. Semua waktu mengikuti zona waktu event.")} {state.event.timezone}
    </p>
    {stale && <div role="alert" className="mb-4 grid gap-3">
      <p>{t("New schedule revision available. Your edits are preserved. Reload replaces your unsaved edits.", "Revisi jadwal baru tersedia. Isian Anda dipertahankan. Muat ulang akan mengganti isian yang belum disimpan.")}</p>
      <Button variant="secondary" onClick={reload}>{t("Reload schedule", "Muat ulang jadwal")}</Button>
    </div>}
    <form aria-label={t("Schedule generation", "Pembuatan jadwal")} className="grid gap-4" onSubmit={event => {
      event.preventDefault();
      if (stale || busy) return;
      setError(false);
      try {
        const values = form.values;
        const iso = (name: string) => eventLocalInputToIso(values[name], state.event.timezone)!;
        const duration = Number(values.duration);
        const manualOverrides = state.matches.flatMap(match => {
          if (["Live", "Completed", "Bye"].includes(match.status) || ["live", "completed", "locked"].includes(match.scheduleStatus)) return [];
          const time = values[`override-${match.id}`];
          const roomId = values[`room-${match.id}`].trim();
          const baseline = form.assignments[match.id];
          if (time) {
            const start = eventLocalInputToIso(time, state.event.timezone)!;
            if (baseline && time === local(baseline.start)) return [{ ...baseline, roomId }];
            return [{ matchId: match.id, roomId, start, end: new Date(Date.parse(start) + duration * 60000).toISOString() }];
          }
          if (roomId === (baseline?.roomId ?? "")) return [];
          if (!baseline) throw new Error("A room-only override requires a scheduled time");
          return [{ ...baseline, roomId }];
        });
        void run({
          kind: "schedule_save", reason: values.reason,
          input: {
            timezone: state.event.timezone,
            eventWindow: { start: iso("windowStart"), end: iso("windowEnd") },
            matchDurationMinutes: duration, bufferMinutes: Number(values.buffer), minimumRestMinutes: Number(values.rest),
            rooms: values.rooms.split(",").map(room => room.trim()).filter(Boolean),
            manualOverrides, lockedMatchIds: form.locks,
            sourceRevision: form.sourceRevision,
          },
        });
      } catch { setError(true); }
    }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("Window start", "Awal rentang waktu")} type="datetime-local" required {...field("windowStart")} />
        <Field label={t("Window end", "Akhir rentang waktu")} type="datetime-local" required {...field("windowEnd")} />
        <Field label={t("Duration (minutes)", "Durasi (menit)")} type="number" min={1} required {...field("duration")} />
        <Field label={t("Buffer (minutes)", "Jeda (menit)")} type="number" min={0} required {...field("buffer")} />
        <Field label={t("Minimum rest (minutes)", "Istirahat minimum (menit)")} type="number" min={0} required {...field("rest")} />
        <Field label={t("Rooms (comma separated)", "Ruangan (pisahkan dengan koma)")} required {...field("rooms")} />
      </div>
      <fieldset className="grid max-h-[32rem] min-w-0 gap-3 overflow-y-auto">
        <legend className="mb-3 font-bold">{t("Room / time overrides and locks", "Penyesuaian ruangan / waktu dan kunci")}</legend>
        {state.matches.filter(match => match.status !== "Bye" && (!visibleMatchIds || visibleMatchIds.includes(match.id))).map(match => {
          const immutable = ["Live", "Completed"].includes(match.status) || ["live", "completed", "locked"].includes(match.scheduleStatus);
          return <div key={match.id} className="grid gap-3 rounded-lg border border-[var(--color-border)] p-3 sm:grid-cols-3">
            <p className="break-words text-sm sm:col-span-3">{match.roundLabel} · {state.teams.find(team => team.id === match.homeTeamId)?.name || "TBD"} vs {state.teams.find(team => team.id === match.awayTeamId)?.name || "TBD"}</p>
            <Field label={t("Override time", "Ubah waktu")} type="datetime-local" disabled={immutable} {...field(`override-${match.id}`)} />
            <Field label={t("Room", "Ruangan")} disabled={immutable} {...field(`room-${match.id}`)} />
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input className="size-5 miracle-focus-ring" type="checkbox" name={`lock-${match.id}`} disabled={immutable || !form.sourceRevision || !form.assignments[match.id]} checked={immutable || form.locks.includes(match.id)} onChange={event => {
                const checked = event.target.checked;
                setForm(current => ({ ...current, dirty: true, locks: checked ? [...current.locks, match.id] : current.locks.filter(id => id !== match.id) }));
              }} />
              {t("Preserve assignment", "Pertahankan jadwal")}
            </label>
            {immutable && <p className="text-xs text-[var(--color-text-subtle)] sm:col-span-3">{t("Live, completed, or locked assignments are preserved.", "Jadwal yang berlangsung, selesai, atau terkunci dipertahankan.")}</p>}
          </div>;
        })}
      </fieldset>
      <Field label={t("Reason for overrides", "Alasan penyesuaian")} maxLength={4000} {...field("reason")} />
      {error && <p role="alert">{t("Check dates and scheduling values. Room changes need an existing assignment or an override time.", "Periksa tanggal dan isian jadwal. Perubahan ruangan memerlukan jadwal yang ada atau waktu pengganti.")}</p>}
      <Button type="submit" disabled={busy || stale}>{t("Generate schedule preview", "Buat pratinjau jadwal")}</Button>
    </form>
    {state.schedule && <section className="mt-5 border-t border-[var(--color-border)] pt-4"><h3 className="font-bold">{t("Impact preview", "Pratinjau dampak")} · {state.schedule.version}</h3><p className="my-2 text-sm">{t("Affected matches", "Pertandingan terdampak")}: {names(state.schedule.draft.affectedMatchIds) || "0"}</p>
      {state.schedule.draft.conflicts.map((c, index) => <p role="alert" key={`${c.code}-${index}`} className="my-2">{c.message} · {names(c.matchIds)}</p>)}
      {state.schedule.draft.warnings.map((c, index) => <p key={`${c.code}-${index}`} className="my-2 text-sm">{c.message} · {names(c.matchIds)}</p>)}
      <ul className="my-3 grid gap-2">{state.schedule.draft.impact.map(i => <li key={i.matchId} className="rounded-lg bg-[var(--color-surface-subtle)] p-3 text-sm"><p className="font-semibold">{names([i.matchId])}</p><p>{t("Before", "Sebelum")}: {local(i.before?.start || null) || "—"} · {i.before?.roomId || "—"}</p><p>{t("After", "Sesudah")}: {local(i.after?.start || null) || "—"} · {i.after?.roomId || "—"}</p><p>{t("Delay (minutes)", "Keterlambatan (menit)")}: {i.delayMinutes ?? "—"}</p></li>)}</ul>
      <details className="mb-3"><summary className="miracle-focus-ring flex min-h-11 cursor-pointer items-center">{t("All proposed assignments", "Semua usulan jadwal")}</summary><ul className="grid gap-2">{state.schedule.draft.assignments.map(a => <li key={a.matchId} className="text-sm">{names([a.matchId])} · {local(a.start)} – {local(a.end)} · {a.roomId}</li>)}</ul></details>
      {dirty && <p role="status" className="my-3">{t("Generate a new preview after changing the schedule.", "Buat pratinjau baru setelah mengubah jadwal.")}</p>}
      <Button disabled={busy || publicationDisabled || stale || dirty || !state.schedule.draft.feasible || !!state.schedule.draft.conflicts.length} onClick={() => { if (!publicationDisabled && !stale && !dirty) void run({ kind: "schedule_publish", revisionId: state.schedule!.id }); }}>{t("Publish schedule", "Terbitkan jadwal")}</Button>
    </section>}
  </section>;
}
