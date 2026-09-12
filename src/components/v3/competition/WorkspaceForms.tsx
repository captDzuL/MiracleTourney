"use client";
import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/v3/Button";
import { previewCompetitionResultCorrectionAction } from "@/lib/actions/competition-v3-actions";
import type { CompetitionWorkspaceState, WorkspaceMatch } from "@/lib/competition/workspace-types";
export { ScheduleControls } from "./ScheduleControls";
import { Field, panel, type Run, type Translate } from "./CompetitionWorkspace";
import { eventLocalInputToIso } from "@/lib/events/event-datetime";

export function DelayControls({ state, match, t, busy, run, locale }: { state: CompetitionWorkspaceState; match: WorkspaceMatch; t: Translate; busy: boolean; run: Run; locale: "en" | "id" }) {
  const [error, setError] = useState(false);
  const source = state.schedule ?? state.publishedSchedule;
  const sourceRevision = source ? { id: source.id, version: source.version, status: state.schedule ? "draft" as const : "published" as const } : undefined;
  const label = t("Mark delayed and preview impact", "Tandai terlambat dan tinjau dampak");
  return <section className={panel}><h2 className="mb-3 text-lg font-bold">{t("Delay and schedule impact", "Keterlambatan dan dampak jadwal")}</h2><p className="mb-3 text-sm">{t("The revised estimate creates a draft. Review and publish it from Schedule.", "Perkiraan baru menghasilkan draf. Tinjau dan terbitkan melalui Jadwal.")}</p><form aria-label={label} className="grid gap-3" onSubmit={e => {
    e.preventDefault(); setError(false); const data = new FormData(e.currentTarget);
    try { const estimatedEnd = eventLocalInputToIso(String(data.get("estimatedEnd")), state.event.timezone); if (!estimatedEnd || !sourceRevision) throw new Error("Invalid time or source"); void run({ kind: "delay_preview", matchId: match.id, estimatedEnd, sourceRevision, reason: String(data.get("reason")) }); } catch { setError(true); }
  }}><Field name="estimatedEnd" type="datetime-local" required label={t("Revised estimated end", "Perkiraan selesai terbaru")} /><Field name="reason" required maxLength={4000} label={t("Delay reason", "Alasan keterlambatan")} /><Button type="submit" disabled={busy || !source || !match.end || ["Completed", "Bye"].includes(match.status) || (match.status !== "Live" && match.scheduleStatus === "locked")}>{label}</Button>{error && <p role="alert">{t("Enter a valid event-local time.", "Masukkan waktu yang valid sesuai zona event.")}</p>}</form><a className="miracle-focus-ring mt-3 inline-flex min-h-11 items-center text-[var(--color-brand-cyan)]" href={`/${locale}/organizer/events/${encodeURIComponent(state.event.id)}/schedule`}>{t("Review schedule impact", "Tinjau dampak jadwal")}</a></section>;
}


export function ResultControls({ state, match, t, busy, run }: { state: CompetitionWorkspaceState; match: WorkspaceMatch; t: Translate; busy: boolean; run: Run }) {
  const [games, setGames] = useState(match.games.length ? match.games : [{ gameNumber: 1, homeScore: 0, awayScore: 0 }]);
  const [reason, setReason] = useState("");
  const incomingRevision = JSON.stringify([match.id, match.resultVersion, match.homeTeamId, match.awayTeamId]);
  const [boundRevision, setBoundRevision] = useState(incomingRevision);
  const [dirty, setDirty] = useState(false);
  const stale = boundRevision !== incomingRevision;
  const previewRequest = useRef(0);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewCompetitionResultCorrectionAction>> | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  useEffect(() => {
    if (!stale) return;
    previewRequest.current++;
    setPreview(null); setPreviewBusy(false); setPreviewError(false);
    if (!dirty) {
      setGames(match.games.length ? match.games : [{ gameNumber: 1, homeScore: 0, awayScore: 0 }]);
      setBoundRevision(incomingRevision); setReason("");
    }
  }, [match, incomingRevision, stale, dirty]);
  const reload = () => {
    previewRequest.current++;
    setGames(match.games.length ? match.games : [{ gameNumber: 1, homeScore: 0, awayScore: 0 }]);
    setBoundRevision(incomingRevision); setDirty(false); setReason("");
    setPreview(null); setPreviewError(false); setPreviewBusy(false);
  };
  const correction = match.resultVersion > 0;
  const reviewed = !stale && preview && preview.competitionVersion === state.event.version && !preview.blockedMatchIds.length;
  const team = (id: string) => state.teams.find(t => t.id === id)?.name || id || t("To be decided", "Belum ditentukan");
  const clear = () => { previewRequest.current++; setDirty(true); setPreview(null); setPreviewError(false); setPreviewBusy(false); };
  async function review() {
    if (stale || busy) return;
    const request = ++previewRequest.current;
    setPreviewBusy(true); setPreviewError(false);
    try {
      const result = await previewCompetitionResultCorrectionAction({ eventId: state.event.id, matchId: match.id, games });
      if (request === previewRequest.current) setPreview(result);
    }
    catch { if (request === previewRequest.current) { setPreview(null); setPreviewError(true); } }
    finally { if (request === previewRequest.current) setPreviewBusy(false); }
  }
  return <section className={panel}><h2 className="mb-3 text-lg font-bold">{t("Official result", "Hasil resmi")}</h2><p className="mb-3 text-sm">BO{match.bestOf} · {t("Enter each played game. Leave unplayed games out.", "Isi setiap gim yang dimainkan. Jangan tambahkan gim yang belum dimainkan.")}</p>{stale && <div role="alert" className="mb-4 grid gap-3"><p>{t("Official result changed. Your edits are preserved. Reload replaces your unsaved edits.", "Hasil resmi berubah. Isian Anda dipertahankan. Muat ulang akan mengganti isian yang belum disimpan.")}</p><Button variant="secondary" onClick={reload}>{t("Reload official result", "Muat ulang hasil resmi")}</Button></div>}<form aria-label={t("Official result", "Hasil resmi")} className="grid gap-3" onSubmit={e => {
    e.preventDefault();
    if (stale || busy || previewBusy) return;
    if (correction) { if (reviewed && reason.trim()) void run({ kind: "result_correct", matchId: match.id, games, reason, previewToken: preview.token }); }
    else void run({ kind: "result_submit", matchId: match.id, games });
  }}>
    {games.map((game, index) => <fieldset key={game.gameNumber} className="grid grid-cols-2 gap-3"><legend className="mb-2 text-sm">{t("Game", "Gim")} {game.gameNumber}</legend>{(["homeScore", "awayScore"] as const).map(side => <Field key={side} label={team(side === "homeScore" ? match.homeTeamId : match.awayTeamId)} type="number" name={`${side === "homeScore" ? "home" : "away"}-${game.gameNumber}`} min={0} max={2147483647} required value={game[side]} onChange={e => { clear(); setGames(games.map((g, i) => i === index ? { ...g, [side]: Number(e.target.value) } : g)); }} />)}</fieldset>)}
    <div className="flex flex-wrap gap-2">{games.length < match.bestOf && <Button variant="secondary" onClick={() => { clear(); setGames([...games, { gameNumber: games.length + 1, homeScore: 0, awayScore: 0 }]); }}>{t("Add played game", "Tambah gim yang dimainkan")}</Button>}{games.length > 1 && <Button variant="secondary" onClick={() => { clear(); setGames(games.slice(0, -1)); }}>{t("Remove last game", "Hapus gim terakhir")}</Button>}</div>
    {correction && <><Field label={t("Correction reason", "Alasan koreksi")} name="correctionReason" required value={reason} onChange={e => { setDirty(true); setReason(e.target.value); }} maxLength={4000} /><Button variant="secondary" disabled={busy || stale || previewBusy} onClick={() => void review()}>{t("Preview correction", "Pratinjau koreksi")}</Button></>}
    {previewBusy && <p role="status">{t("Loading impact…", "Memuat dampak…")}</p>}
    {previewError && <p role="alert">{t("Could not preview. Check scores and try again.", "Pratinjau gagal. Periksa skor dan coba lagi.")}</p>}
    {preview && <section className="grid gap-2 rounded-lg border border-[var(--color-border)] p-3 text-sm"><h3 className="font-bold">{t("Correction impact", "Dampak koreksi")}</h3><p>{t("Affected matches", "Pertandingan terdampak")}: {preview.affectedMatchIds.join(", ") || "0"}</p>{!!preview.blockedMatchIds.length && <p role="alert">{t("Blocked by live or completed matches", "Terhalang pertandingan berlangsung atau selesai")}: {preview.blockedMatchIds.join(", ")}</p>}{preview.competitionVersion !== state.event.version && <p role="alert">{t("State changed. Preview again.", "Data berubah. Buat pratinjau ulang.")}</p>}{preview.participants.map(p => <p key={p.matchId}>{p.matchId}: {team(p.homeTeamId)} vs {team(p.awayTeamId)}</p>)}{preview.standings.map(table => <div key={table.groupId || table.phaseId}>{table.rows.map(r => <p key={r.teamId}>{r.rank}. {team(r.teamId)} · {r.points} {t("points", "poin")}</p>)}</div>)}{preview.schedule && <p>{t("Schedule changes require a separate review and publication.", "Perubahan jadwal memerlukan peninjauan dan penerbitan tersendiri.")} {preview.schedule.affectedMatchIds.length} {t("affected matches", "pertandingan terdampak")}</p>}</section>}
    <Button type="submit" disabled={busy || stale || previewBusy || !match.homeTeamId || !match.awayTeamId || match.status === "Bye" || (correction && (!reviewed || !reason.trim()))}>{correction ? t("Confirm correction", "Konfirmasi koreksi") : t("Submit official result", "Kirim hasil resmi")}</Button>
  </form></section>;
}
