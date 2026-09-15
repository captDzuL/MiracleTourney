"use client";
import React, { useEffect, useId, useRef } from "react";
import { useTranslations } from "next-intl";
import { statuses, sources, registrationHref, type RegistrationQuery } from "./query";
export { registrationHref } from "./query";
export type { RegistrationQuery } from "./query";
export const control = "miracle-focus-ring inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border)] px-4 py-2 text-sm font-bold hover:bg-[var(--color-surface-selected)] disabled:cursor-not-allowed disabled:opacity-50";
export const primary = control + " bg-[var(--color-brand-violet)] text-[var(--color-on-accent)]";
export const field = "miracle-focus-ring min-h-11 w-full min-w-0 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-2 text-sm text-[var(--color-text)]";
export const panel = "min-w-0 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5";
export const muted = "text-sm leading-6 text-[var(--color-text-muted)]";
export function actionForm(locale: string, eventId: string, returnTo: string) {
  const data = new FormData(); data.set("locale", locale); data.set("eventId", eventId); data.set("returnTo", returnTo); return data;
}
export function safeImage(url?: string | null) {
  if (!url || /[\\\u0000-\u0020]/.test(url)) return undefined;
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try { const parsed = new URL(url); return parsed.protocol === "https:" && !parsed.username && !parsed.password ? url : undefined; } catch { return undefined; }
}
export function WorkspaceDialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const t = useTranslations("registrationWorkspace"); const ref = useRef<HTMLDivElement>(null); const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null; const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { document.body.style.overflow = bodyOverflow; previous?.focus(); };
  }, []);
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className={panel + " max-h-[85dvh] w-full max-w-2xl overflow-y-auto"} onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (event.key === "Tab") { const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')]; const first = controls[0], last = controls.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
    }}><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 style={{ fontFamily: "var(--font-miracle-v3)" }} id={titleId} className="break-words text-lg font-extrabold">{title}</h2><button type="button" data-close-dialog className={control} onClick={onClose}>{t("close")}</button></div>{children}</div>
  </div>;
}
export function Feedback({ error, message }: { error?: boolean; message?: string }) { return message ? <p role={error ? "alert" : "status"} className={`rounded-[var(--radius-control)] border border-[var(--color-border)] p-3 text-sm ${error ? "text-[var(--color-feedback-error)]" : "text-[var(--color-brand-cyan)]"}`}>{message}</p> : null; }
export function Filters({ locale, eventId, query, participants = false, payments = false }: { locale: string; eventId: string; query: RegistrationQuery; participants?: boolean; payments?: boolean }) {
  const t = useTranslations("registrationWorkspace");
  return <form key={JSON.stringify(query)} method="get" action={`/${locale}/organizer/events/${encodeURIComponent(eventId)}/${participants ? "participants" : "registration"}`} className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
    {!participants && <input type="hidden" name="view" value={query.view} />}
    <label className="grid min-w-0 gap-2 text-sm">{t("search")}<input className={field} type="search" name="q" maxLength={200} defaultValue={query.q} /></label>
    <label className="grid min-w-0 gap-2 text-sm">{t("status")}<select className={field} name="status" defaultValue={payments ? ({ accepted: "approved", needs_correction: "expired" }[query.status] ?? query.status) : ({ approved: "accepted", expired: "needs_correction" }[query.status] ?? query.status)}><option value="">{t("allStatuses")}</option>{(participants ? ["accepted"] : payments ? ["pending_payment", "pending_review", "approved", "rejected", "expired", "draft"] : statuses).map(status => <option key={status} value={status}>{t(`statuses.${status}`)}</option>)}</select></label>
    <label className="grid min-w-0 gap-2 text-sm">{t("source")}<select className={field} name="source" defaultValue={query.source}><option value="">{t("allSources")}</option>{sources.map(source => <option key={source} value={source}>{t(`sources.${source}`)}</option>)}</select></label>
    <button className={control + " self-end"} type="submit">{t("applyFilters")}</button>
  </form>;
}
export function Pagination({ locale, eventId, query, page, totalPages, participants = false }: { locale: string; eventId: string; query: RegistrationQuery; page: number; totalPages: number; participants?: boolean }) {
 const t = useTranslations("registrationWorkspace");
 return <nav aria-label={t("pagination")} className="mt-4 flex flex-wrap items-center justify-between gap-3">
   {page > 1 ? <a data-page="previous" className={control} href={registrationHref(locale, eventId, query, { page: page - 1 }, participants)}>{t("previous")}</a> : <span />}
   <span className={muted}>{t("pageCount", { page, total: totalPages })}</span>
   {page < totalPages ? <a data-page="next" className={control} href={registrationHref(locale, eventId, query, { page: page + 1 }, participants)}>{t("next")}</a> : <span />}
 </nav>;
}
