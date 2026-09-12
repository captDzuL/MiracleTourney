"use client";
import React, { useEffect, useState } from "react";
import { Button } from "@/components/v3/Button";
import { previewCompetitionResultCorrectionAction } from "@/lib/actions/competition-v3-actions";
import type { CompetitionWorkspaceState, WorkspaceMatch } from "@/lib/competition/workspace-types";
import { eventDateToLocalInput, eventLocalInputToIso } from "@/lib/events/event-datetime";
import { Field, panel, type Run, type Translate } from "./CompetitionWorkspace";

export function ScheduleControls({ state, busy, run, t }: { state: CompetitionWorkspaceState; busy: boolean; run: Run; t: Translate }) {
  const [error, setError] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => setDirty(false), [state.schedule?.id]);
  const local = (value: string | null) => value ? eventDateToLocalInput(new Date(value), state.event.timezone) : "";
  const saved = state.schedule?.input;
  const names = (ids: string[]) => ids.map(id => state.matches.find(m => m.id === id)?.roundLabel || id).join(", ");
  return <section className={panel}><h2 className="mb-3 text-lg font-bold">{t("Schedule generation", "Pembuatan jadwal")}</h2><p className="mb-4 text-sm text-[var(--color-text-subtle)]">{t("Review changes before publishing. All times use the event timezone.", "Tinjau perubahan sebelum diterbitkan. Semua waktu mengikuti zona waktu event.")} {state.event.timezone}</p>
    <form aria-label={t("Schedule generation", "Pembuatan jadwal")} className="grid gap-4" onChange={() => setDirty(true)} onSubmit={e => {
      e.preventDefault(); setError(false); const data = new FormData(e.currentTarget);
      try {
        const iso = (name: string) => eventLocalInputToIso(String(data.get(name)), state.event.timezone)!;
        const duration = Number(data.get("duration"));
        const manualOverrides = state.matches.flatMap(m => {
          const value = String(data.get(`override-${m.id}`) || "");
          if (!value) return [];
          const start = eventLocalInputToIso(value, state.event.timezone)!;
          return [{ matchId: m.id, roomId: String(data.get(`room-${m.id}`)), start, end: new Date(Date.parse(start) + duration * 60000).toISOString() }];
        });
        void run({ kind: "schedule_save", reason: String(data.get("reason") || ""), input: { timezone: state.event.timezone, eventWindow: { start: iso("windowStart"), end: iso("windowEnd") }, matchDurationMinutes: duration, bufferMinutes: Number(data.get("buffer")), minimumRestMinutes: Number(data.get("rest")), rooms: String(data.get("rooms")).split(",").map(r => r.trim()).filter(Boolean), manualOverrides, lockedMatchIds: state.matches.filter(m => data.get(`lock-${m.id}`) === "on").map(m => m.id) } });
      } catch { setError(true); }
    }}>
      <div className="grid gap-3 sm:grid-cols-2"><Field label={t("Window start", "Awal rentang waktu")} type="datetime-local" name="windowStart" required defaultValue={local(saved?.eventWindow.start || state.event.startsAt)} /><Field label={t("Window end", "Akhir rentang waktu")} type="datetime-local" name="windowEnd" required defaultValue={local(saved?.eventWindow.end || null)} /><Field label={t("Duration (minutes)", "Durasi (menit)")} type="number" name="duration" min={1} required defaultValue={saved?.matchDurationMinutes ?? 30} /><Field label={t("Buffer (minutes)", "Jeda (menit)")} type="number" name="buffer" min={0} required defaultValue={saved?.bufferMinutes ?? 5} /><Field label={t("Minimum rest (minutes)", "Istirahat minimum (menit)")} type="number" name="rest" min={0} required defaultValue={saved?.minimumRestMinutes ?? 10} /><Field label={t("Rooms (comma separated)", "Ruangan (pisahkan dengan koma)")} name="rooms" required defaultValue={saved?.rooms.join(", ") || [...new Set(state.matches.map(m => m.room).filter(Boolean))].join(", ")} /></div>
      <fieldset className="grid gap-3"><legend className="mb-3 font-bold">{t("Room / time overrides and locks", "Penyesuaian ruangan / waktu dan kunci")}</legend>{state.matches.filter(m => m.status !== "Bye").map(m => {
        const immutable = ["Live", "Completed"].includes(m.status) || ["live", "completed", "locked"].includes(m.scheduleStatus);
        const override = saved?.manualOverrides?.find(a => a.matchId === m.id);
        return <div key={m.id} className="grid gap-3 rounded-lg border border-[var(--color-border)] p-3 sm:grid-cols-3"><p className="break-words text-sm sm:col-span-3">{m.roundLabel} · {state.teams.find(team => team.id === m.homeTeamId)?.name || "TBD"} vs {state.teams.find(team => team.id === m.awayTeamId)?.name || "TBD"}</p><Field label={t("Override time", "Ubah waktu")} name={`override-${m.id}`} type="datetime-local" disabled={immutable} defaultValue={local(override?.start || null)} /><Field label={t("Room", "Ruangan")} name={`room-${m.id}`} disabled={immutable} defaultValue={override?.roomId || m.room || ""} /><label className="flex min-h-11 items-center gap-3 text-sm"><input className="size-5 miracle-focus-ring" type="checkbox" name={`lock-${m.id}`} disabled={immutable || !m.start || !m.room} defaultChecked={immutable || saved?.lockedMatchIds?.includes(m.id)} />{t("Preserve assignment", "Pertahankan jadwal")}</label>{immutable && <p className="text-xs text-[var(--color-text-subtle)] sm:col-span-3">{t("Live, completed, or locked assignments are preserved.", "Jadwal yang berlangsung, selesai, atau terkunci dipertahankan.")}</p>}</div>;
      })}</fieldset>
      <Field label={t("Reason for overrides", "Alasan penyesuaian")} name="reason" maxLength={4000} />
      {error && <p role="alert">{t("Check the event dates and scheduling values.", "Periksa tanggal event dan isian jadwal.")}</p>}
      <Button type="submit" disabled={busy}>{t("Generate schedule preview", "Buat pratinjau jadwal")}</Button>
    </form>
    {state.schedule && <section className="mt-5 border-t border-[var(--color-border)] pt-4"><h3 className="font-bold">{t("Impact preview", "Pratinjau dampak")} · {state.schedule.version}</h3><p className="my-2 text-sm">{t("Affected matches", "Pertandingan terdampak")}: {names(state.schedule.draft.affectedMatchIds) || "0"}</p>
      {state.schedule.draft.conflicts.map((c, index) => <p role="alert" key={`${c.code}-${index}`} className="my-2">{c.message} · {names(c.matchIds)}</p>)}
      {state.schedule.draft.warnings.map((c, index) => <p key={`${c.code}-${index}`} className="my-2 text-sm">{c.message} · {names(c.matchIds)}</p>)}
      <ul className="my-3 grid gap-2">{state.schedule.draft.impact.map(i => <li key={i.matchId} className="rounded-lg bg-[var(--color-surface-subtle)] p-3 text-sm"><p className="font-semibold">{names([i.matchId])}</p><p>{t("Before", "Sebelum")}: {local(i.before?.start || null) || "—"} · {i.before?.roomId || "—"}</p><p>{t("After", "Sesudah")}: {local(i.after?.start || null) || "—"} · {i.after?.roomId || "—"}</p><p>{t("Delay (minutes)", "Keterlambatan (menit)")}: {i.delayMinutes ?? "—"}</p></li>)}</ul>
      <details className="mb-3"><summary className="miracle-focus-ring flex min-h-11 cursor-pointer items-center">{t("All proposed assignments", "Semua usulan jadwal")}</summary><ul className="grid gap-2">{state.schedule.draft.assignments.map(a => <li key={a.matchId} className="text-sm">{names([a.matchId])} · {local(a.start)} – {local(a.end)} · {a.roomId}</li>)}</ul></details>
      {dirty && <p role="status" className="my-3">{t("Generate a new preview after changing the schedule.", "Buat pratinjau baru setelah mengubah jadwal.")}</p>}
      <Button disabled={busy || dirty || !state.schedule.draft.feasible || !!state.schedule.draft.conflicts.length} onClick={() => void run({ kind: "schedule_publish", revisionId: state.schedule!.id })}>{t("Publish schedule", "Terbitkan jadwal")}</Button>
    </section>}
  </section>;
}

export function ResultControls({ state, match, t, busy, run }: { state: CompetitionWorkspaceState; match: WorkspaceMatch; t: Translate; busy: boolean; run: Run }) {
  const [games, setGames] = useState(match.games.length ? match.games : [{ gameNumber: 1, homeScore: 0, awayScore: 0 }]);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewCompetitionResultCorrectionAction>> | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const correction = match.resultVersion > 0;
  const reviewed = preview && preview.competitionVersion === state.event.version && !preview.blockedMatchIds.length;
  const team = (id: string) => state.teams.find(t => t.id === id)?.name || id || t("To be decided", "Belum ditentukan");
  const clear = () => { setPreview(null); setPreviewError(false); };
  async function review() {
    setPreviewBusy(true); setPreviewError(false);
    try { setPreview(await previewCompetitionResultCorrectionAction({ eventId: state.event.id, matchId: match.id, games })); }
    catch { setPreview(null); setPreviewError(true); }
    finally { setPreviewBusy(false); }
  }
  return <section className={panel}><h2 className="mb-3 text-lg font-bold">{t("Official result", "Hasil resmi")}</h2><p className="mb-3 text-sm">BO{match.bestOf} · {t("Enter each played game. Leave unplayed games out.", "Isi setiap gim yang dimainkan. Jangan tambahkan gim yang belum dimainkan.")}</p><form aria-label={t("Official result", "Hasil resmi")} className="grid gap-3" onSubmit={e => {
    e.preventDefault();
    if (correction) { if (reviewed && reason.trim()) void run({ kind: "result_correct", matchId: match.id, games, reason, previewToken: preview.token }); }
    else void run({ kind: "result_submit", matchId: match.id, games });
  }}>
    {games.map((game, index) => <fieldset key={game.gameNumber} className="grid grid-cols-2 gap-3"><legend className="mb-2 text-sm">{t("Game", "Gim")} {game.gameNumber}</legend>{(["homeScore", "awayScore"] as const).map(side => <Field key={side} label={team(side === "homeScore" ? match.homeTeamId : match.awayTeamId)} type="number" name={`${side === "homeScore" ? "home" : "away"}-${game.gameNumber}`} min={0} max={2147483647} required value={game[side]} onChange={e => { clear(); setGames(games.map((g, i) => i === index ? { ...g, [side]: Number(e.target.value) } : g)); }} />)}</fieldset>)}
    <div className="flex flex-wrap gap-2">{games.length < match.bestOf && <Button variant="secondary" onClick={() => { clear(); setGames([...games, { gameNumber: games.length + 1, homeScore: 0, awayScore: 0 }]); }}>{t("Add played game", "Tambah gim yang dimainkan")}</Button>}{games.length > 1 && <Button variant="secondary" onClick={() => { clear(); setGames(games.slice(0, -1)); }}>{t("Remove last game", "Hapus gim terakhir")}</Button>}</div>
    {correction && <><Field label={t("Correction reason", "Alasan koreksi")} name="correctionReason" required value={reason} onChange={e => { setReason(e.target.value); }} maxLength={4000} /><Button variant="secondary" disabled={busy || previewBusy} onClick={() => void review()}>{t("Preview correction", "Pratinjau koreksi")}</Button></>}
    {previewBusy && <p role="status">{t("Loading impact…", "Memuat dampak…")}</p>}
    {previewError && <p role="alert">{t("Could not preview. Check scores and try again.", "Pratinjau gagal. Periksa skor dan coba lagi.")}</p>}
    {preview && <section className="grid gap-2 rounded-lg border border-[var(--color-border)] p-3 text-sm"><h3 className="font-bold">{t("Correction impact", "Dampak koreksi")}</h3><p>{t("Affected matches", "Pertandingan terdampak")}: {preview.affectedMatchIds.join(", ") || "0"}</p>{!!preview.blockedMatchIds.length && <p role="alert">{t("Blocked by live or completed matches", "Terhalang pertandingan berlangsung atau selesai")}: {preview.blockedMatchIds.join(", ")}</p>}{preview.competitionVersion !== state.event.version && <p role="alert">{t("State changed. Preview again.", "Data berubah. Buat pratinjau ulang.")}</p>}{preview.participants.map(p => <p key={p.matchId}>{p.matchId}: {team(p.homeTeamId)} vs {team(p.awayTeamId)}</p>)}{preview.standings.map(table => <div key={table.groupId || table.phaseId}>{table.rows.map(r => <p key={r.teamId}>{r.rank}. {team(r.teamId)} · {r.points} {t("points", "poin")}</p>)}</div>)}{preview.schedule && <p>{t("Schedule changes require a separate review and publication.", "Perubahan jadwal memerlukan peninjauan dan penerbitan tersendiri.")} {preview.schedule.affectedMatchIds.length} {t("affected matches", "pertandingan terdampak")}</p>}</section>}
    <Button type="submit" disabled={busy || previewBusy || !match.homeTeamId || !match.awayTeamId || match.status === "Bye" || (correction && (!reviewed || !reason.trim()))}>{correction ? t("Confirm correction", "Konfirmasi koreksi") : t("Submit official result", "Kirim hasil resmi")}</Button>
  </form></section>;
}
