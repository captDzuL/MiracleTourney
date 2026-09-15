"use client";
import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { RegistrationImportHistoryEntry } from "@/lib/platform/repository";
import type { RegistrationMapping } from "@/lib/imports/registration-intake";
import { previewEventRegistrationImportAction, commitEventRegistrationImportAction, type RegistrationActionResult } from "@/lib/actions/registration-v3-actions";
import { actionForm, control, field, muted, panel, primary, Feedback } from "./shared";
type Preview = Extract<RegistrationActionResult, { status: "preview_ready" }>;
const columns = ["teamName", "teamTag", "captainName", "captainContact", "captainEmail", "captainIgn", "captainUid", "captainIsPlayer"] as const;
export function RegistrationImportPanel({ locale, eventId, returnTo, history }: { locale: string; eventId: string; returnTo: string; history: RegistrationImportHistoryEntry[] }) {
 const t = useTranslations("registrationWorkspace"); const router = useRouter();
 const [file, setFile] = useState<File | null>(null);
 const [mapping, setMapping] = useState<RegistrationMapping | null>(null);
 const [headers, setHeaders] = useState<string[]>([]); const [maxRoster, setMaxRoster] = useState(0);
 const [preview, setPreview] = useState<Preview | null>(null); const [selected, setSelected] = useState<string[]>([]);
 const [needsPreview, setNeedsPreview] = useState(false); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false); const [dragging, setDragging] = useState(false);
 const [feedback, setFeedback] = useState<{ message: string; error?: boolean }>({ message: "" });
 const [completedCount, setCompletedCount] = useState(0);
 const [previewPage, setPreviewPage] = useState(1); const [pageSize, setPageSize] = useState(10); const [previewStatus, setPreviewStatus] = useState("");
 const canDownloadCredentials = completedCount > 0 || history.some(batch => batch.eventId === eventId && batch.committedAt && batch.itemCount > 0);
 function chooseFile(next?: File) {
  if (!next || busy) return;
  setPreview(null); setSelected([]); setMapping(null); setHeaders([]); setDone(false); setNeedsPreview(false); setFeedback({ message: "" }); setFile(null);
  if (!/\.(csv|xlsx)$/i.test(next.name) || next.size === 0 || next.size > 5242880) { setFeedback({ message: t("fileHelp"), error: true }); return; }
  setFile(next);
  setPreviewPage(1); setPreviewStatus("");
 }
 async function validate() {
  if (!file || busy) return;
  setBusy(true); setPreview(null); setSelected([]); setDone(false); setFeedback({ message: "" });
  setPreviewPage(1); setPreviewStatus("");
  const data = actionForm(locale, eventId, returnTo); data.set("registrationFile", file);
  if (mapping) data.set("mapping", JSON.stringify({ columns: mapping.columns, players: mapping.players }));
  try {
   const result = await previewEventRegistrationImportAction(data);
   if (result.status === "preview_ready" || result.status === "mapping_required") {
    setHeaders(result.headers ?? []); setMapping(result.mapping ?? null); setMaxRoster(result.maxRosterSize ?? 0);
    if (result.status === "preview_ready") {
     setPreview(result); setNeedsPreview(false);
     setSelected((result.items ?? []).filter(item => item.selected && ["new", "changed"].includes(item.status)).map(item => item.id));
     setFeedback({ message: t("previewReady") });
    } else { setNeedsPreview(true); setFeedback({ message: t("mappingRequired"), error: true }); }
   } else setFeedback({ message: t("importFailed"), error: true });
  } catch { setFeedback({ message: t("importFailed"), error: true }); } finally { setBusy(false); }
 }
 async function commit() {
  if (!preview || busy || done || needsPreview || selected.length === 0) return;
  setBusy(true); setFeedback({ message: "" });
  const data = actionForm(locale, eventId, returnTo); data.set("batchId", preview.batchId);
  selected.forEach(id => data.append("itemId", id));
  try {
   const result = await commitEventRegistrationImportAction(data);
   if (result.status === "imported") { setDone(true); setCompletedCount(result.importedCount); setFeedback({ message: t("imported", { count: result.importedCount }) }); router.refresh(); }
   else { setNeedsPreview(true); setFeedback({ message: t(result.status === "conflict" ? "conflict" : "expiredHelp"), error: true }); router.refresh(); }
  } catch { setNeedsPreview(true); setFeedback({ message: t("expiredHelp"), error: true }); } finally { setBusy(false); }
 }
 function selectColumn(label: string, value: number | undefined, change: (value: number | undefined) => void) {
  return <label className="grid min-w-0 gap-2 text-sm">{label}
   <select className={field} disabled={busy || done} value={value ?? ""} onChange={event => {
    change(event.target.value === "" ? undefined : Number(event.target.value)); setNeedsPreview(true); setSelected([]);
   }}><option value="">{t("chooseColumn")}</option>
    {headers.map((header, index) => <option key={index} value={index}>{index + 1}. {header || t("unnamedColumn")}</option>)}
   </select>
  </label>;
 }
 const expired = !!preview?.expiresAt && Date.parse(preview.expiresAt) <= Date.now();
 const filteredRows = (preview?.items ?? []).filter(item => !previewStatus || item.status === previewStatus);
 const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize)); const page = Math.min(previewPage, totalPages);
 const pageRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);
 const selectablePageIds = pageRows.filter(item => ["new", "changed"].includes(item.status)).map(item => item.id);
 const selectionLocked = busy || done || expired || needsPreview;
 const headingStyle = { fontFamily: "var(--font-miracle-v3)" };
 return <div className="grid min-w-0 gap-4">
  <section className={panel + " grid gap-5"} aria-busy={busy}>
   <h2 style={headingStyle} className="text-lg font-extrabold">{t("importTitle")}</h2>
   <div className={`min-w-0 rounded-[var(--radius-card)] border border-dashed p-5 ${dragging ? "border-[var(--color-brand-cyan)] bg-[var(--color-surface-selected)]" : "border-[var(--color-border)]"}`}
    onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
    onDrop={event => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files[0]); }}>
    <label className="grid min-w-0 gap-3 font-bold">{t("chooseFile")}<span className={muted}>{t("fileHelp")}</span>
     <span style={{ minHeight: 48 }} className={control + " relative justify-start focus-within:ring-2 focus-within:ring-[var(--color-brand-cyan)]"}>{t("browseFile")}<input aria-label={t("browseFile")} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" type="file" accept=".xlsx,.csv" disabled={busy} onChange={event => chooseFile(event.target.files?.[0])} /></span>
    </label>
   </div>
   {file && <p className={muted + " break-all"}>{file.name} · {new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(file.size / 1024)} KB</p>}
   <p className={muted}>{t("importHelp")}</p>
   {mapping && <div className="grid gap-4">
    <h3 style={headingStyle} className="font-bold">{t("mappingTitle")}</h3>
    <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">{columns.map(key => <React.Fragment key={key}>
     {selectColumn(t(`mapping.${key}`), mapping.columns[key], value => setMapping({ ...mapping, columns: { ...mapping.columns, [key]: value } }))}
    </React.Fragment>)}</div>
    <details><summary className={control + " cursor-pointer justify-start"}>{t("playerMapping")}</summary>
     <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: maxRoster }, (_, index) => (["nickname", "displayName", "position"] as const).map(key => <React.Fragment key={index + key}>
       {selectColumn(t(`mapping.${key}`, { index: index + 1 }), mapping.players[index]?.[key], value => {
        const players = Array.from({ length: maxRoster }, (_, i) => ({ ...mapping.players[i] }));
        players[index] = { ...players[index], [key]: value }; setMapping({ ...mapping, players });
       })}
      </React.Fragment>))}
     </div>
    </details>
   </div>}
   <button type="button" data-preview className={primary + " justify-self-start"} disabled={!file || busy} onClick={validate}>{busy ? t("saving") : t("validatePreview")}</button>
   <Feedback {...feedback} />
   {preview && <>
    <div className="flex flex-wrap gap-3">{["new", "changed", "same", "error"].map(status =>
     <p key={status} className="rounded-[var(--radius-control)] border border-[var(--color-border)] px-4 py-3 text-sm"><strong className="mr-2 text-lg text-[var(--color-accent-cream-foreground)]">{preview.items?.filter(item => item.status === status).length ?? 0}</strong>{t(`importStatuses.${status}`)}</p>
    )}</div>
    {needsPreview && <p role="status" className={muted}>{t("revalidateMapping")}</p>}
    {expired && <p role="alert" className={muted}>{t("expiredHelp")}</p>}
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
     <label className="grid min-w-0 gap-2 text-sm">{t("previewStatus")}<select data-preview-status className={field} value={previewStatus} onChange={event => { setPreviewStatus(event.target.value); setPreviewPage(1); }}>
      <option value="">{t("allStatuses")}</option>{["new", "changed", "same", "error"].map(status => <option key={status} value={status}>{t(`importStatuses.${status}`)}</option>)}
     </select></label>
     <label className="grid min-w-0 gap-2 text-sm">{t("rowsPerPage")}<select data-preview-page-size className={field} value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPreviewPage(1); }}>{[10, 25, 50].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
    </div>
    <div className="flex flex-wrap gap-3">
     <button type="button" data-select-page className={control} disabled={selectionLocked || !selectablePageIds.some(id => !selected.includes(id))} onClick={() => setSelected(current => [...new Set([...current, ...selectablePageIds])])}>{t("selectPage")}</button>
     <button type="button" data-unselect-page className={control} disabled={selectionLocked || !selectablePageIds.some(id => selected.includes(id))} onClick={() => setSelected(current => current.filter(id => !selectablePageIds.includes(id)))}>{t("unselectPage")}</button>
    </div>
    <p data-selection-count role="status" className={muted}>{t("selectionRetained", { count: selected.length, total: filteredRows.length })}</p>
    <div className="max-h-[32rem] max-w-full overflow-auto">
     <table className="w-full text-left text-sm"><caption className="sr-only">{t("previewRows")}</caption>
      <thead><tr>{["select", "row", "team", "validation"].map(key => <th style={headingStyle} className="border-b border-[var(--color-border)] p-3" key={key} scope="col">{t(key)}</th>)}</tr></thead>
      <tbody>{pageRows.map(item => <tr key={item.id}>
       <td className="p-2"><label className="flex min-h-11 min-w-11 items-center justify-center">
        <input type="checkbox" className="miracle-focus-ring size-5" value={item.id} aria-label={t("selectRow", { row: item.sourceRow })} checked={selected.includes(item.id)}
         disabled={busy || done || expired || needsPreview || !["new", "changed"].includes(item.status)}
         onChange={event => setSelected(event.target.checked ? [...selected, item.id] : selected.filter(id => id !== item.id))} />
       </label></td>
       <td className="p-3">{item.sourceRow}</td><td className="p-3">{item.teamName || "—"}</td>
       <td className="p-3">{t(`importStatuses.${item.status}`)}
        {item.issueCount > 0 && <p className={muted}>{item.issueCodes?.length ? item.issueCodes.map(code => t(`issues.${code}`)).join(" ") : t("rowIssues", { count: item.issueCount })}</p>}
       </td>
      </tr>)}</tbody>
     </table>
    </div>
    {filteredRows.length === 0 && <p className={muted}>{t("emptyPreviewFilter")}</p>}
    <nav aria-label={t("previewPagination")} className="flex flex-wrap items-center justify-between gap-3">
     <button type="button" data-import-previous className={control} disabled={page <= 1} onClick={() => setPreviewPage(page - 1)}>{t("previous")}</button>
     <span className={muted}>{t("pageCount", { page, total: totalPages })}</span>
     <button type="button" data-import-next className={control} disabled={page >= totalPages} onClick={() => setPreviewPage(page + 1)}>{t("next")}</button>
    </nav>
    <button type="button" data-commit className={primary + " justify-self-start"} disabled={busy || done || expired || needsPreview || selected.length === 0} onClick={commit}>{t("commit", { count: selected.length })}</button>
   </>}
  </section>
  <section className={panel}><h2 style={headingStyle} className="mb-3 text-lg font-extrabold">{t("importHistory")}</h2>
   {canDownloadCredentials && <div className="mb-4 grid gap-2"><a className={control + " justify-self-start"} href={`/api/admin/captain-credentials?eventId=${encodeURIComponent(eventId)}`}>{t("downloadCredentials")}</a><p className={muted}>{t("credentialsHelp")}</p></div>}
   {history.length ? <ul className="grid gap-3">{history.map(batch =>
    <li className="flex min-w-0 flex-wrap justify-between gap-3 border-b border-[var(--color-border)] py-3 text-sm" key={batch.id}>
     <div className="min-w-0"><strong className="break-all">{batch.sourceLabel}</strong><p className={muted}>{t("rowsCount", { count: batch.itemCount })} · {t(batch.committedAt ? "importComplete" : Date.parse(String(batch.expiresAt)) <= Date.now() ? "expired" : "draft")}</p></div>
     <time dateTime={new Date(batch.createdAt).toISOString()} className={muted}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "Asia/Jakarta" }).format(new Date(batch.createdAt))}</time>
    </li>
   )}</ul> : <p className={muted}>{t("emptyHistory")}</p>}
  </section>
 </div>;
}
