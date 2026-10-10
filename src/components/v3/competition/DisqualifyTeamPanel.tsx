"use client";
import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/v3/Button";
import { previewCompetitionTeamDisqualificationAction } from "@/lib/actions/competition-v3-actions";
import type { CompetitionWorkspaceState } from "@/lib/competition/workspace-types";
import type { OperationCommand } from "@/lib/tournament/operations";
import { Field, panel } from "./CompetitionWorkspace";

type Preview = Awaited<ReturnType<typeof previewCompetitionTeamDisqualificationAction>>;

/**
 * Disqualify one team: reason -> impact preview -> confirmation. The command is
 * only enabled for a preview of the current competition revision with no
 * blockers, so organizers always see the consequences before confirming.
 */
export function DisqualifyTeamPanel({ state, teamId, locale, busy, run, onClose }: {
  state: CompetitionWorkspaceState; teamId: string; locale: "en" | "id"; busy: boolean;
  run: (command: OperationCommand) => Promise<void>; onClose: () => void;
}) {
  const t = (en: string, id: string) => locale === "id" ? id : en;
  const name = (id: string) => state.teams.find(team => team.id === id)?.name || (id ? id : t("To be decided", "Belum ditentukan"));
  const [reason, setReason] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const latest = useRef(0);
  const close = useRef(onClose);
  close.current = onClose;
  const done = !!state.graph?.disqualifications?.some(entry => entry.teamId === teamId);
  useEffect(() => { if (done) close.current(); }, [done]);

  async function review() {
    const request = ++latest.current;
    setPreviewBusy(true); setPreviewError(false); setPreview(null); setUnderstood(false);
    try {
      const result = await previewCompetitionTeamDisqualificationAction({ eventId: state.event.id, teamId });
      if (request === latest.current) setPreview(result);
    } catch { if (request === latest.current) setPreviewError(true); }
    finally { if (request === latest.current) setPreviewBusy(false); }
  }
  const fresh = !!preview && preview.competitionVersion === state.event.version;
  const blocked = !!preview?.blockers.length;
  const matchLabel = (id: string) => { const m = state.matches.find(row => row.id === id); return m ? `${name(m.homeTeamId)} — ${name(m.awayTeamId)}` : id; };
  const blocker = (b: Preview["blockers"][number]) => b.code === "live_match"
    ? t(`Match ${matchLabel(b.matchId)} is live: finish or cancel it first.`, `Pertandingan ${matchLabel(b.matchId)} sedang berlangsung: selesaikan atau batalkan terlebih dahulu.`)
    : b.code === "playoff_played"
      ? t(`The team already played a playoff match (${matchLabel(b.matchId)}). This needs a manual decision.`, `Tim sudah bermain di playoff (${matchLabel(b.matchId)}). Perlu keputusan manual.`)
      : t(`The team still holds a slot in ${matchLabel(b.matchId)} through an earlier result. Resolve it manually.`, `Tim masih menempati slot di ${matchLabel(b.matchId)} lewat hasil sebelumnya. Selesaikan secara manual.`);
  const table = preview?.standings.find(row => row.disqualified?.includes(teamId));
  const cutline = state.graph?.groups.find(group => group.id === table?.groupId)?.qualificationCutline ?? 0;
  // A tie that straddles the cutline qualifies nobody yet: it needs a tiebreak.
  const outcome = (row: { rank: number }) => {
    const tied = (table?.rows.filter(r => r.rank === row.rank).length ?? 1);
    if (row.rank + tied - 1 <= cutline) return ` · ${t("qualifies", "lolos")}`;
    if (row.rank <= cutline) return ` · ${t("tied at the cutline", "seri di batas lolos")}`;
    return "";
  };
  const submit = () => { if (preview && fresh && !blocked && reason.trim() && understood && !busy) void run({ kind: "team_disqualify", teamId, reason: reason.trim(), previewToken: preview.token }); };

  return <section className={panel} role="dialog" aria-label={t("Disqualify team", "Diskualifikasi tim")}>
    <h3 className="text-lg font-bold">{t("Disqualify", "Diskualifikasi")} {name(teamId)}</h3>
    <p className="mt-2 text-sm text-[var(--color-text-subtle)]">{t("Every match against this team is voided and removed from the standings. No walkover or points are given to opponents. Recorded scores stay in the history.", "Semua pertandingan melawan tim ini dibatalkan dan dikeluarkan dari klasemen. Tidak ada walkover atau poin untuk lawan. Skor yang sudah tercatat tetap tersimpan sebagai riwayat.")}</p>
    <form className="mt-3 grid gap-3" aria-label={t("Disqualify team", "Diskualifikasi tim")} onSubmit={e => { e.preventDefault(); submit(); }}>
      <Field label={t("Reason (recorded in the audit log)", "Alasan (tercatat di riwayat audit)")} name="disqualificationReason" required maxLength={4000} value={reason} onChange={e => setReason(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={busy || previewBusy} onClick={() => void review()}>{preview ? t("Refresh impact", "Perbarui dampak") : t("Review impact", "Lihat dampak")}</Button>
        <Button type="button" variant="secondary" onClick={onClose}>{t("Cancel", "Batal")}</Button>
      </div>
      {previewBusy && <p role="status">{t("Loading impact…", "Memuat dampak…")}</p>}
      {previewError && <p role="alert">{t("Could not load the impact. Try again.", "Gagal memuat dampak. Coba lagi.")}</p>}
      {preview && <div className="grid gap-2 rounded-lg border border-[var(--color-border)] p-3 text-sm" aria-label={t("Disqualification impact", "Dampak diskualifikasi")}>
        {!fresh && <p role="alert">{t("The competition changed. Review the impact again.", "Kompetisi berubah. Lihat dampak sekali lagi.")}</p>}
        {preview.blockers.map(b => <p key={`${b.code}:${b.matchId}`} role="alert" className="font-semibold">{blocker(b)}</p>)}
        <p>{t("Cancelled upcoming matches", "Pertandingan mendatang yang dibatalkan")}: {preview.voidedMatchIds.length}</p>
        {!!preview.voidedMatchIds.length && <ul className="list-disc pl-5">{preview.voidedMatchIds.map(id => <li key={id}>{matchLabel(id)}</li>)}</ul>}
        <p>{t("Played results that no longer count", "Hasil yang sudah dimainkan dan tidak lagi dihitung")}: {preview.ignoredResultMatchIds.length}</p>
        {!!preview.ignoredResultMatchIds.length && <ul className="list-disc pl-5">{preview.ignoredResultMatchIds.map(id => <li key={id}>{matchLabel(id)}</li>)}</ul>}
        {!!preview.participants.length && <><p className="font-semibold">{t("Changed playoff slots", "Slot playoff yang berubah")}</p><ul className="list-disc pl-5">{preview.participants.map(p => <li key={p.matchId}>{name(p.before.homeTeamId)} — {name(p.before.awayTeamId)} → {name(p.after.homeTeamId)} — {name(p.after.awayTeamId)}</li>)}</ul></>}
        {table && <><p className="font-semibold">{t("Standings after disqualification", "Klasemen setelah diskualifikasi")}{table.complete ? "" : ` (${t("not complete yet", "belum lengkap")})`}</p><ol className="grid gap-1">{table.rows.map(row => <li key={row.teamId}>{row.rank}. {name(row.teamId)} · {row.played} {t("played", "main")} · {row.points} {t("points", "poin")}{outcome(row)}</li>)}</ol>
          {table.rows.length < cutline && <p role="alert" className="font-semibold">{t(`Only ${table.rows.length} team(s) remain for ${cutline} qualifying slots. Empty slots need an organizer decision.`, `Hanya ${table.rows.length} tim tersisa untuk ${cutline} slot lolos. Slot kosong perlu keputusan panitia.`)}</p>}</>}
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={understood} disabled={blocked || !fresh} onChange={e => setUnderstood(e.target.checked)} />{t("I understand this cannot be undone from the app.", "Saya paham ini tidak dapat dibatalkan dari aplikasi.")}</label>
      </div>}
      <Button type="submit" disabled={busy || previewBusy || !preview || !fresh || blocked || !reason.trim() || !understood}>{t("Disqualify team", "Diskualifikasi tim")}</Button>
    </form>
  </section>;
}
