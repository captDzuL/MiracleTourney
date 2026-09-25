"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { EventPaymentManagerSettings } from "@/lib/platform/repository";
import { saveEventQrisDraftAction, publishEventQrisAction } from "@/lib/actions/registration-v3-actions";
import { actionForm, control, field, muted, panel, primary, safeImage, Feedback, WorkspaceDialog } from "./shared";
export function EventQrisPanel({ locale, eventId, returnTo, settings }: { locale: string; eventId: string; returnTo: string; settings: EventPaymentManagerSettings }) {
 const t = useTranslations("registrationWorkspace"); const router = useRouter();
 const [version, setVersion] = useState(settings.version ?? 0); const [status, setStatus] = useState(settings.status ?? "draft"); const [instructions, setInstructions] = useState(settings.instructions ?? "");
 const [file, setFile] = useState<File | null>(null); const [previewUrl, setPreviewUrl] = useState<string>(); const [dirty, setDirty] = useState(false); const [busy, setBusy] = useState(false); const [conflict, setConflict] = useState(false); const [zoom, setZoom] = useState(false); const [feedback, setFeedback] = useState<{ message: string; error?: boolean }>({ message: "" });
 useEffect(() => { if (!file) return; const url = URL.createObjectURL(file); setPreviewUrl(url); return () => URL.revokeObjectURL(url); }, [file]);
 const image = previewUrl ?? safeImage(settings.qrisImageUrl);
 async function save(publish: boolean) {
  if (busy || conflict) return; setBusy(true); setFeedback({ message: "" });
  const data = actionForm(locale, eventId, returnTo); data.set("expectedVersion", String(version));
  if (!publish) { data.set("instructions", instructions); data.set("qrisImageUrl", safeImage(settings.qrisImageUrl) ?? ""); if (file) data.set("qrisImage", file); }
  try { const result = await (publish ? publishEventQrisAction(data) : saveEventQrisDraftAction(data));
   if (result.status === "saved" || result.status === "published") { setVersion(result.version); setStatus(result.status === "published" ? "published" : "draft"); setDirty(false); setFeedback({ message: t(result.status === "saved" ? "draftSaved" : "publishedSaved") }); }
   else { const stale = result.status === "conflict"; setConflict(stale); setFeedback({ message: t(stale ? "conflict" : "operationFailed"), error: true }); if (stale) router.refresh(); }
  } catch { setFeedback({ message: t("operationFailed"), error: true }); } finally { setBusy(false); }
 }
 return <section className={panel + " grid gap-5"} aria-busy={busy}><h2 style={{ fontFamily: "var(--font-miracle-v3)" }} className="text-lg font-extrabold">{t("qrisTitle")}</h2><div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
  <div className="grid min-w-0 content-start gap-3">{image ? <><img src={image} alt={t("qrisAlt")} width={256} height={256} className="h-64 w-full rounded-[var(--radius-card)] bg-white p-4 object-contain" /><button className={control} type="button" onClick={() => setZoom(true)}>{t("zoomQris")}</button></> : <p className={muted + " rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] p-6"}>{t("noQris")}</p>}<p className={muted}>{status === "published" ? t("captainVisible") : t("captainHidden")}</p></div>
  <div className="grid min-w-0 gap-4"><p className={muted}>{t("imageHelp")}</p><label className="grid min-w-0 gap-2 text-sm">{t("uploadQris")}<span style={{ minHeight: 48 }} className={control + " relative justify-start focus-within:ring-2 focus-within:ring-[var(--color-brand-cyan)]"}>{t("browseFile")}<input aria-label={t("browseFile")} disabled={busy} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { const picked = event.target.files?.[0]; if (!picked) return; if (!["image/png", "image/jpeg", "image/webp"].includes(picked.type) || picked.size > 5242880 || picked.size === 0) { setFeedback({ message: t("imageHelp"), error: true }); event.target.value = ""; return; } setFile(picked); setDirty(true); setFeedback({ message: "" }); }} /></span></label>
  <label className="grid gap-2 text-sm">{t("instructions")}<textarea className={field} disabled={busy} rows={4} maxLength={500} value={instructions} onChange={event => { setInstructions(event.target.value); setDirty(true); }} /></label>
  <p className={muted}>{t("version", { version })} · {t(status === "published" ? "published" : "draft")}{dirty ? " · " + t("unsaved") : ""}</p>
  <div className="flex flex-wrap gap-3"><button type="button" data-save className={primary} disabled={busy || conflict || !image} onClick={() => save(false)}>{busy ? t("saving") : t("saveDraft")}</button><button type="button" data-publish className={control} disabled={busy || conflict || dirty || !image || version === 0 || status === "published"} onClick={() => save(true)}>{t("publish")}</button></div>
  <Feedback {...feedback} /><p className={muted}>{t("publishHelp")}</p></div></div>
  {zoom && image && <WorkspaceDialog title={t("qrisAlt")} onClose={() => setZoom(false)}><img src={image} alt={t("qrisAlt")} width={700} height={700} className="max-h-[65dvh] w-full bg-white object-contain" /></WorkspaceDialog>}
 </section>;
}
