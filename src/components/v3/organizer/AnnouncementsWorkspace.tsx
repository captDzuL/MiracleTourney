"use client";

import React from "react";
import { useEffect, useRef, useState, useTransition } from "react";
import { Megaphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { mutateCompetitionWorkspaceAction } from "@/lib/actions/competition-v3-actions";
import type { CompetitionWorkspaceState } from "@/lib/competition/workspace-types";

type Announcement = CompetitionWorkspaceState["announcements"][number];
type Props = { eventId: string; version: number; announcements: readonly Announcement[]; audit: CompetitionWorkspaceState["audit"]; action?: typeof mutateCompetitionWorkspaceAction };
type Urgency = "info" | "important" | "urgent";
type MutationResult = Awaited<ReturnType<typeof mutateCompetitionWorkspaceAction>>;

export function AnnouncementsWorkspace({ eventId, version, announcements, audit, action = mutateCompetitionWorkspaceAction }: Props) {
  const t = useTranslations("organizerMaster.announcements");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const currentVersion = useRef(version);
  useEffect(() => { currentVersion.current = version; }, [version]);
  const run = (command: Record<string, unknown>): Promise<MutationResult> => {
    const operation = (async () => {
      try {
        const result = await action({ eventId, expectedVersion: currentVersion.current, idempotencyKey: crypto.randomUUID(), command });
        if (result.status !== "saved") {
          setFeedback(t(result.status));
          if (result.status === "conflict") router.refresh();
          return result;
        }
        currentVersion.current = result.receipt.version;
        setFeedback(t("saved"));
        router.refresh();
        return result;
      } catch {
        setFeedback(t("failed"));
        return { status: "failed" as const };
      }
    })();
    startTransition(async () => { await operation; });
    return operation;
  };
  return <main className="grid min-w-0 gap-5" data-announcements-workspace>
    <header className="min-w-0 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 min-[700px]:p-7">
      <div className="flex items-start gap-3"><Megaphone aria-hidden="true" className="mt-1 size-5 shrink-0 text-[var(--color-accent-cyan-foreground)]" /><div className="min-w-0"><h1 className="break-words text-2xl font-extrabold">{t("title")}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-muted)]">{t("description")}</p></div></div>
    </header>
    <section className="min-w-0 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5" aria-labelledby="announcement-create-title">
      <h2 className="text-lg font-extrabold" id="announcement-create-title">{t("create")}</h2>
      <form className="mt-4 grid min-w-0 gap-3" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); run({ kind: "announcement_save", title: String(data.get("title")), body: String(data.get("body")), urgency: data.get("urgency") as Urgency }); }}>
        <label className="grid gap-2 text-sm font-bold">{t("titleLabel")}<input className="min-h-11 min-w-0 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface-subtle)] px-3 miracle-focus-ring" name="title" maxLength={200} required /></label>
        <label className="grid gap-2 text-sm font-bold">{t("bodyLabel")}<textarea className="min-h-28 min-w-0 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface-subtle)] p-3 miracle-focus-ring" name="body" maxLength={8000} required /></label>
        <label className="grid gap-2 text-sm font-bold">{t("urgencyLabel")}<select className="min-h-11 min-w-0 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface-subtle)] px-3 miracle-focus-ring" name="urgency" defaultValue="info"><option value="info">{t("info")}</option><option value="important">{t("important")}</option><option value="urgent">{t("urgent")}</option></select></label>
        <button className="min-h-11 w-fit rounded-[var(--radius-control)] bg-[var(--color-brand-cyan)] px-4 text-sm font-extrabold text-slate-950 miracle-focus-ring disabled:opacity-60" disabled={pending} type="submit">{t("saveDraft")}</button>
      </form>
    </section>
    <section className="min-w-0 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5" aria-labelledby="announcement-list-title">
      <h2 className="text-lg font-extrabold" id="announcement-list-title">{t("list")}</h2>
      {announcements.length === 0 ? <p className="mt-3 text-sm text-[var(--color-text-muted)]">{t("empty")}</p> : <div className="mt-3 grid gap-3">{announcements.map(announcement => <AnnouncementItem key={announcement.id} announcement={announcement} pending={pending} t={t} onCommand={command => run({ ...command, announcementId: announcement.id })} />)}</div>}
    </section>
    <section className="min-w-0 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5" aria-labelledby="announcement-audit-title">
      <h2 className="text-lg font-extrabold" id="announcement-audit-title">{t("audit")}</h2>
      {audit.length === 0 ? <p className="mt-3 text-sm text-[var(--color-text-muted)]">{t("auditEmpty")}</p> : <ul className="mt-3 grid gap-2 text-sm">{audit.filter(entry => entry.action.startsWith("announcement_")).map(entry => <li className="break-words border-t border-[var(--color-border)] pt-2" key={entry.id}>{entry.action} · {entry.actor ?? t("unknownActor")}</li>)}</ul>}
    </section>
    <p aria-live="polite" className="sr-only" role="status">{feedback}</p>
  </main>;
}

function AnnouncementItem({ announcement, pending, t, onCommand }: { announcement: Announcement; pending: boolean; t: (key: string) => string; onCommand: (command: Record<string, unknown>) => Promise<MutationResult> }) {
  const [edited, setEdited] = useState(false);
  return <article className="min-w-0 border-t border-[var(--color-border)] pt-3 first:border-t-0 first:pt-0">
    <h3 className="break-words font-bold">{announcement.title}</h3><p className="mt-1 break-words text-sm">{announcement.body}</p><p className="mt-2 text-xs font-bold text-[var(--color-text-muted)]">{announcement.status === "published" ? t("published") : t("draft")} · {t(announcement.urgency)}</p>
    {announcement.status !== "published" && <form className="mt-3 grid min-w-0 gap-3" aria-label={`${t("edit")}: ${announcement.title}`} onChange={() => setEdited(true)} onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); void onCommand({ kind: "announcement_save", title: String(data.get("title")), body: String(data.get("body")), urgency: data.get("urgency") as Urgency }).then(result => { if (result.status === "saved") setEdited(false); }); }}>
      <input className="min-h-11 min-w-0 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface-subtle)] px-3 miracle-focus-ring" name="title" defaultValue={announcement.title} maxLength={200} required /><textarea className="min-h-24 min-w-0 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface-subtle)] p-3 miracle-focus-ring" name="body" defaultValue={announcement.body} maxLength={8000} required /><select className="min-h-11 min-w-0 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface-subtle)] px-3 miracle-focus-ring" name="urgency" defaultValue={announcement.urgency}><option value="info">{t("info")}</option><option value="important">{t("important")}</option><option value="urgent">{t("urgent")}</option></select><button className="min-h-11 w-fit rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-4 text-sm font-bold miracle-focus-ring" disabled={pending} type="submit">{t("saveChanges")}</button>
    </form>}
    <button className="mt-3 min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-4 text-sm font-bold miracle-focus-ring disabled:opacity-60" disabled={pending || edited} onClick={() => onCommand({ kind: announcement.status === "published" ? "announcement_unpublish" : "announcement_publish" })} type="button">{announcement.status === "published" ? t("unpublish") : t("publish")}</button>
  </article>;
}