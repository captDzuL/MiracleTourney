"use client";
import React, { useState } from "react";
import { Megaphone } from "lucide-react";
import { Button } from "@/components/v3/Button";
import type { CompetitionWorkspaceState } from "@/lib/competition/workspace-types";
import { Field, inputClass, panel, type Run, type Translate } from "./CompetitionWorkspace";

type Urgency = "info" | "important" | "urgent";
function UrgencySelect({ value = "info", t }: { value?: Urgency; t: Translate }) {
  return <label className="grid min-w-0 gap-2 text-sm">{t("Urgency", "Tingkat urgensi")}<select className={inputClass} name="urgency" defaultValue={value}><option value="info">{t("Information", "Informasi")}</option><option value="important">{t("Important", "Penting")}</option><option value="urgent">{t("Urgent", "Mendesak")}</option></select></label>;
}
export function AnnouncementControls({ state, busy, run, t }: { state: CompetitionWorkspaceState; busy: boolean; run: Run; t: Translate }) {
  return <section className={panel}>
    <h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><Megaphone aria-hidden="true" size={20} />{t("Announcements", "Pengumuman")}</h2>
    <form aria-label={t("Create announcement", "Buat pengumuman")} className="grid gap-3" onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); void run({ kind: "announcement_save", title: String(data.get("title")), body: String(data.get("body")), urgency: data.get("urgency") as Urgency }); }}>
      <Field label={t("Title", "Judul")} name="title" required maxLength={200} /><Field label={t("Message", "Pesan")} name="body" required maxLength={8000} /><UrgencySelect t={t} /><Button type="submit" disabled={busy}>{t("Save announcement draft", "Simpan draf pengumuman")}</Button>
    </form>
    {state.announcements.map(a => <AnnouncementItem key={`${a.id}:${a.urgency}:${a.status}:${a.title}:${a.body}`} a={a} busy={busy} run={run} t={t} />)}
  </section>;
}
function AnnouncementItem({ a, busy, run, t }: { a: CompetitionWorkspaceState["announcements"][number]; busy: boolean; run: Run; t: Translate }) {
  const [edited, setEdited] = useState(false);
  return <article className="mt-3 break-words border-t border-[var(--color-border)] pt-3">
      <h3 className="font-bold">{a.title}</h3><p>{a.body}</p><p className="text-sm">{a.status === "published" ? t("Published", "Terbit") : t("Draft", "Draf")} · {a.urgency === "urgent" ? t("Urgent", "Mendesak") : a.urgency === "important" ? t("Important", "Penting") : t("Information", "Informasi")}</p>
      {a.status !== "published" ? <form className="my-3 grid gap-3" aria-label={`${t("Edit announcement", "Ubah pengumuman")}: ${a.title}`} onChange={e => { const data = new FormData(e.currentTarget); setEdited(data.get("title") !== a.title || data.get("body") !== a.body || data.get("urgency") !== a.urgency); }} onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); void run({ kind: "announcement_save", announcementId: a.id, title: String(data.get("title")), body: String(data.get("body")), urgency: data.get("urgency") as Urgency }); }}>
        <Field label={t("Title", "Judul")} name="title" defaultValue={a.title} required maxLength={200} /><Field label={t("Message", "Pesan")} name="body" defaultValue={a.body} required maxLength={8000} /><UrgencySelect value={a.urgency} t={t} /><Button type="submit" disabled={busy}>{t("Save changes", "Simpan perubahan")}</Button>
      </form> : null}
      {edited ? <p className="text-sm">{t("Save changes before publishing.", "Simpan perubahan sebelum menerbitkan.")}</p> : null}
      <Button className="mt-2" disabled={busy || edited} onClick={() => void run({ kind: a.status === "published" ? "announcement_unpublish" : "announcement_publish", announcementId: a.id })}>{a.status === "published" ? t("Unpublish announcement", "Tarik pengumuman") : t("Publish announcement", "Terbitkan pengumuman")}</Button>
    </article>;
}
