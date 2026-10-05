"use client";
import React from "react";
import type { BracketAppearance, SocialBracketModel } from "@/lib/bracket/types";
import { SocialBracketBoard } from "@/components/v3/public-event/SocialBracketBoard";

type Props = { eventId: string; locale: "en" | "id"; initial: BracketAppearance; previewModel?: SocialBracketModel | null };
const slider = "w-full accent-[var(--color-brand-cyan)] miracle-focus-ring";
const button = "miracle-focus-ring min-h-11 rounded-lg border border-[var(--color-border-strong)] px-4 py-2 text-sm font-bold disabled:cursor-wait disabled:opacity-60";
export function BracketAppearanceEditor({ eventId, locale, initial, previewModel }: Props) {
  const t = (en: string, id: string) => locale === "id" ? id : en;
  const [saved, setSaved] = React.useState(initial);
  const [draft, setDraft] = React.useState(initial);
  const [file, setFile] = React.useState<File | null>(null);
  const [localUrl, setLocalUrl] = React.useState<string | null>(null);
  const [imageFailed, setImageFailed] = React.useState(false);
  const [rights, setRights] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!file || typeof URL.createObjectURL !== "function") { setLocalUrl(null); return; }
    const url = URL.createObjectURL(file);
    setLocalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const previewUrl = imageFailed ? null : localUrl ?? draft.backgroundUrl;
  const exportDisabled = busy || file !== null || draft.backgroundUrl !== saved.backgroundUrl || draft.positionX !== saved.positionX || draft.positionY !== saved.positionY || draft.overlay !== saved.overlay;
  const appearance = { ...draft, backgroundUrl: previewUrl };
  const boardModel = previewModel ? { ...previewModel, appearance } : null;
  async function submit(action: "save" | "reset") {
    if (busy) return;
    setError(null); setNotice(null);
    const upload = action === "save" && file !== null;
    if (upload && !rights) { setError(t("Confirm artwork rights before uploading.", "Konfirmasi hak publikasi artwork sebelum mengunggah.")); return; }
    setBusy(true);
    const body = new FormData();
    body.set("action", action === "reset" ? "reset" : upload ? "upload" : "save");
    body.set("positionX", String(draft.positionX)); body.set("positionY", String(draft.positionY)); body.set("overlay", String(draft.overlay));
    if (upload) { body.set("background", file); body.set("rightsAttestation", "confirmed"); }
    try {
      const response = await fetch(`/api/organizer/events/${encodeURIComponent(eventId)}/bracket-appearance`, { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.code === "string" ? data.code : "save_failed");
      const next = data as BracketAppearance;
      setSaved(next); setDraft(next); setFile(null); setLocalUrl(null); setImageFailed(false); setRights(false);
      setNotice(t("Appearance saved.", "Tampilan tersimpan."));
    } catch {
      setError(t("Could not save appearance. Your saved settings are unchanged; try again.", "Tampilan gagal disimpan. Pengaturan tersimpan tetap sama; coba lagi."));
    } finally { setBusy(false); }
  }
  function chooseFile(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setError(null); setNotice(null); setImageFailed(false);
    if (selected && (!(["image/png", "image/jpeg", "image/webp"].includes(selected.type)) || selected.size > 5 * 1024 * 1024)) {
      setFile(null); event.target.value = "";
      setError(t("Choose a PNG, JPEG, or WebP image up to 5 MiB.", "Pilih gambar PNG, JPEG, atau WebP maksimal 5 MiB."));
      return;
    }
    setFile(selected); setRights(false);
  }
  const backdrop = previewUrl ? `linear-gradient(rgba(9, 17, 30, ${draft.overlay / 100}), rgba(9, 17, 30, ${draft.overlay / 100})), url("${previewUrl.replaceAll('"', '%22')}")` : undefined;
  return <section aria-label={t("Bracket appearance", "Tampilan bracket")} className="miracle-v3 grid min-w-0 gap-5 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-[var(--color-text)] sm:p-6" style={{ fontFamily: "var(--font-miracle-v3)" }}>
    <div><h2 className="text-xl font-extrabold">{t("Bracket appearance", "Tampilan bracket")}</h2><p className="mt-1 text-sm text-[var(--color-text-muted)]">{t("Use landscape artwork, ideally at least 1920 × 1080. Smaller images may look soft.", "Gunakan gambar landscape, idealnya minimal 1920 × 1080. Gambar kecil mungkin terlihat kurang tajam.")}</p></div>
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
      <div className="grid content-start gap-4">
        <p className="text-xs text-[var(--color-text-muted)]">{t("Saved background:", "Background tersimpan:")} <strong className="text-[var(--color-text)]">{saved.backgroundUrl ? t("Custom", "Kustom") : t("Default", "Bawaan")}</strong></p>
        <label className="grid gap-2 text-sm font-semibold">{t("Upload background", "Unggah background")}<input aria-label={t("Upload background", "Unggah background")} className="miracle-focus-ring min-h-11 w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-subtle)] p-2 text-sm" type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseFile} /></label>
        {file && <label className="flex items-start gap-2 text-sm"><input className="miracle-focus-ring mt-1 accent-[var(--color-brand-violet)]" type="checkbox" checked={rights} onChange={event => setRights(event.target.checked)} />{t("I confirm I have rights to publish this artwork.", "Saya menyatakan memiliki hak untuk memublikasikan artwork ini.")}</label>}
        <label className="grid gap-1 text-sm font-semibold">{t("Horizontal position", "Posisi horizontal")} <span className="text-xs text-[var(--color-brand-cyan)]">{draft.positionX}%</span><input className={slider} name="positionX" type="range" min="0" max="100" value={draft.positionX} onChange={event => setDraft(current => ({ ...current, positionX: Number(event.target.value) }))} /></label>
        <label className="grid gap-1 text-sm font-semibold">{t("Vertical position", "Posisi vertikal")} <span className="text-xs text-[var(--color-brand-cyan)]">{draft.positionY}%</span><input className={slider} name="positionY" type="range" min="0" max="100" value={draft.positionY} onChange={event => setDraft(current => ({ ...current, positionY: Number(event.target.value) }))} /></label>
        <label className="grid gap-1 text-sm font-semibold">{t("Dark overlay", "Lapisan gelap")} <span className="text-xs text-[var(--color-brand-cyan)]">{draft.overlay}%</span><input className={slider} name="overlay" type="range" min="0" max="80" value={draft.overlay} onChange={event => setDraft(current => ({ ...current, overlay: Number(event.target.value) }))} /></label>
        <div className="flex flex-wrap gap-2"><button data-action="save" className={`${button} border-[var(--color-brand-violet)] bg-[var(--color-brand-violet)] text-[var(--color-on-accent)]`} disabled={busy} onClick={() => void submit("save")}>{busy ? t("Saving…", "Menyimpan…") : t("Save appearance", "Simpan tampilan")}</button><button data-action="reset" className={`${button} bg-[var(--color-surface-subtle)] text-[var(--color-text)]`} disabled={busy} onClick={() => void submit("reset")}>{t("Use default background", "Kembali ke background bawaan")}</button></div>
        {error && <p role="alert" className="text-sm text-[#E69393]">{error}</p>}{notice && <p role="status" className="text-sm text-[var(--color-brand-cyan)]">{notice}</p>}
      </div>
      <div className="grid min-w-0 gap-3"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-brand-violet)]">{t("Live preview", "Pratinjau langsung")}</p>
        <div data-preview className="relative min-h-56 overflow-hidden rounded-[var(--radius-panel)] border border-[var(--color-border-strong)] bg-[var(--color-surface-subtle)] bg-cover" style={{ backgroundImage: backdrop, backgroundPosition: `${draft.positionX}% ${draft.positionY}%` }}>
          {previewUrl && <img alt="" src={previewUrl} className="pointer-events-none absolute h-px w-px opacity-0" onError={() => setImageFailed(true)} />}
          <div className="relative grid min-h-56 content-center gap-3 p-4"><span className="w-fit rounded-full border border-[var(--color-brand-violet)] bg-[var(--color-surface)] px-3 py-1 text-xs font-bold text-[var(--color-brand-violet)]">{t("Example preview", "Contoh pratinjau")}</span><div className="grid gap-2 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-3 text-sm"><div className="flex justify-between"><span>Alpha</span><strong>2</strong></div><div className="flex justify-between"><span>Bravo</span><strong>1</strong></div></div><div className="w-fit rounded-lg bg-[var(--color-brand-cream)] px-3 py-2 text-sm font-extrabold text-[var(--color-on-accent)]">🏆 {t("Champion example", "Contoh juara")}</div></div>
        </div>
      </div>
    </div>
    {boardModel && <div className="min-w-0 overflow-hidden"><p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-brand-cyan)]">{t("Event bracket preview", "Pratinjau bracket event")}</p><SocialBracketBoard model={boardModel} showControls exportHref={`/api/organizer/events/${encodeURIComponent(eventId)}/bracket.png?locale=${locale}`} exportDisabled={exportDisabled} exportDisabledMessage={t("Save appearance before downloading PNG.", "Simpan tampilan sebelum mengunduh PNG.")} /></div>}
  </section>;
}
