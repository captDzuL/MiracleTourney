"use client";
import React, { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { PaymentReviewEntry } from "@/lib/platform/repository";
import { approveEventPaymentAction, rejectEventPaymentAction } from "@/lib/actions/registration-v3-actions";
import { actionForm, control, field, muted, panel, primary, safeImage, Feedback, Filters, Pagination, WorkspaceDialog, type RegistrationQuery } from "./shared";
export function PaymentReviewPanel({ locale, eventId, query, returnTo, payments }: { locale: "id" | "en"; eventId: string; query: RegistrationQuery; returnTo: string; payments: PaymentReviewEntry[] }) {
 const t = useTranslations("registrationWorkspace"); const router = useRouter();
 const filtered = payments.filter(payment => (!query.status || payment.status === (query.status === "accepted" ? "approved" : query.status === "needs_correction" ? "expired" : query.status)) && (!query.source || query.source === "captain_registration") && (!query.q || [payment.teamName, payment.captain?.name ?? ""].some(text => text.toLocaleLowerCase().includes(query.q.toLocaleLowerCase()))));
 const totalPages = Math.max(1, Math.ceil(filtered.length / 25)); const page = Math.min(query.page, totalPages); const rows = filtered.slice((page - 1) * 25, page * 25);
 const [selectedId, setSelectedId] = useState(rows[0]?.id); const selected = rows.find(row => row.id === selectedId) ?? rows[0];
 return <section className="grid min-w-0 gap-4"><div className={panel}><Filters {...{ locale, eventId, query }} payments /></div>
 <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]"><div className={panel}><h2 style={{ fontFamily: "var(--font-miracle-v3)" }} className="mb-4 text-lg font-extrabold">{t("paymentQueue")}</h2>
 <div className="grid gap-3">{rows.length ? rows.map(row => <button type="button" className={control + " justify-start p-3 text-left " + (row.id === selected?.id ? "border-[var(--color-brand-violet)] bg-[var(--color-surface-selected)]" : "")} key={row.id} aria-pressed={row.id === selected?.id} onClick={() => setSelectedId(row.id)}>
 {safeImage(row.proofImageUrl) && <img src={safeImage(row.proofImageUrl)} alt={t("proofAlt", { team: row.teamName })} width={48} height={64} className="h-16 w-12 shrink-0 rounded object-contain" loading="lazy" />}
 <span className="min-w-0 flex-1"><strong className="block break-words">{row.teamName}</strong><span className={muted + " block"}>{t(`statuses.${row.status}`)}</span></span></button>) : <p className={muted}>{t("emptyPayments")}</p>}</div>
 <Pagination {...{ locale, eventId, query, page, totalPages }} /></div>
 {selected && <PaymentDetail key={selected.id + selected.updatedAt.toString()} {...{ locale, eventId, returnTo }} entry={selected} refresh={() => router.refresh()} />}
 </div></section>;
}
function PaymentDetail({ locale, eventId, returnTo, entry, refresh }: { locale: string; eventId: string; returnTo: string; entry: PaymentReviewEntry; refresh: () => void }) {
 const t = useTranslations("registrationWorkspace"); const [status, setStatus] = useState(entry.status); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false); const [zoom, setZoom] = useState(false); const [feedback, setFeedback] = useState<{ message: string; error?: boolean }>({ message: "" }); const reasonRef = useRef<HTMLTextAreaElement>(null);
 const [stale, setStale] = useState(false);
 const image = safeImage(entry.proofImageUrl); const locked = busy || stale || !["pending_payment", "pending_review"].includes(status);
 async function review(reject: boolean) {
  if (locked) return;
  if (reject && reason.trim().length < 3) { setFeedback({ message: t("reasonRequired"), error: true }); reasonRef.current?.focus(); return; }
  setBusy(true); setFeedback({ message: "" });
  const data = actionForm(locale, eventId, returnTo); data.set("requestId", entry.id); data.set("version", new Date(entry.updatedAt).toISOString()); if (reject) data.set("reason", reason.trim());
  try { const result = await (reject ? rejectEventPaymentAction(data) : approveEventPaymentAction(data));
    if (result.status === "approved" || result.status === "rejected") { setStatus(result.status); setFeedback({ message: t("decisionSaved") }); }
    else { setFeedback({ message: t(result.status === "conflict" ? "conflict" : "operationFailed"), error: true }); if (result.status === "conflict") { setStale(true); refresh(); } }
  } catch { setFeedback({ message: t("operationFailed"), error: true }); } finally { setBusy(false); }
 }
 return <aside className={panel + " grid content-start gap-4"} aria-busy={busy}><h2 style={{ fontFamily: "var(--font-miracle-v3)" }} className="text-lg font-extrabold">{t("reviewReceipt")}</h2>
 {image ? <><img src={image} alt={t("proofAlt", { team: entry.teamName })} width={300} height={260} className="h-60 w-full rounded object-contain" /><button type="button" data-zoom className={control} onClick={() => setZoom(true)}>{t("zoomProof")}</button></> : <p className={muted}>{t("noProof")}</p>}
 <h3 style={{ fontFamily: "var(--font-miracle-v3)" }} className="break-words font-extrabold">{entry.teamName}</h3><dl className="grid gap-3 text-sm"><div><dt className={muted}>{t("captain")}</dt><dd>{entry.captain?.name ?? "—"}</dd></div><div><dt className={muted}>{t("status")}</dt><dd>{t(`statuses.${status}`)}</dd></div><div><dt className={muted}>{t("updated")}</dt><dd><time dateTime={new Date(entry.updatedAt).toISOString()}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(entry.updatedAt))}</time></dd></div></dl>
 {entry.rejectReason && <p className={muted}>{t("rejectionReason")}: {entry.rejectReason}</p>}
 <label className="grid gap-2 text-sm">{t("rejectionReason")}<textarea ref={reasonRef} className={field} rows={3} value={reason} minLength={3} maxLength={240} disabled={locked} onChange={event => setReason(event.target.value)} /></label>
 <div className="flex flex-wrap gap-2"><button type="button" data-approve className={primary} disabled={locked || status !== "pending_review" || !image} onClick={() => review(false)}>{busy ? t("saving") : t("approve")}</button><button type="button" data-reject className={control} disabled={locked} onClick={() => review(true)}>{t("reject")}</button></div>
 <Feedback {...feedback} /><p className={muted}>{t("auditNote")}</p>
 {zoom && image && <WorkspaceDialog title={t("proofAlt", { team: entry.teamName })} onClose={() => setZoom(false)}><img src={image} alt={t("proofAlt", { team: entry.teamName })} width={900} height={1200} className="h-auto max-h-[65dvh] w-full object-contain" /></WorkspaceDialog>}
 </aside>;
}
