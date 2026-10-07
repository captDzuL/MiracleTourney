"use client";
import { getEventEditorTranslator } from "./event-editor-translations";

import { ExternalLink, Eye, Link2Off, RotateCcw, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  applyPublishedEventRevisionAction,
  createPublishedRevisionPreviewAction,
  discardPublishedEventRevisionAction,
  revokePublishedRevisionPreviewAction,
} from "@/lib/actions/event-revision-actions";

type PublishedRevisionControlsProps = {
  eventId: string;
  locale: "id" | "en";
  publicSlug: string;
  revisionId: string;
  workspaceHref: string;
};

export function PublishedRevisionControls({
  eventId,
  locale,
  publicSlug,
  revisionId,
  workspaceHref,
}: PublishedRevisionControlsProps) {
  const t = getEventEditorTranslator(locale);
  const router = useRouter();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function applyRevision() {
    setMessage(null);
    startTransition(async () => {
      const result = await applyPublishedEventRevisionAction({ revisionId });
      if (result.status === "applied") {
        router.push(workspaceHref);
        router.refresh();
        return;
      }
      setMessage(result.status === "locked"
        ? t("revisionLocked")
        : result.status === "conflict"
          ? t("revisionConflict")
          : t("revisionChanged"));
    });
  }

  function discardRevision() {
    setMessage(null);
    startTransition(async () => {
      const result = await discardPublishedEventRevisionAction({ revisionId });
      if (result.status === "discarded") {
        router.push(workspaceHref);
        router.refresh();
        return;
      }
      setMessage(t("revisionDiscardError"));
    });
  }

  function createPreview() {
    setMessage(null);
    startTransition(async () => {
      const result = await createPublishedRevisionPreviewAction({ revisionId, locale });
      if (result.status === "created") setPreviewUrl(result.url);
      else setMessage(t("revisionPreviewError"));
    });
  }

  function revokePreview() {
    setMessage(null);
    startTransition(async () => {
      const result = await revokePublishedRevisionPreviewAction({ revisionId });
      if (result.status === "revoked") setPreviewUrl(null);
      else setMessage(t("revisionPreviewInactive"));
    });
  }

  return <div className="grid gap-6">
    <section className="grid gap-3 rounded-[var(--radius-control)] border border-[var(--color-border)] p-4">
      <div>
        <h3 className="font-extrabold text-[var(--color-text)]">{t("revisionPreviewTitle")}</h3>
        <p className="mt-1 text-sm leading-6 text-[var(--color-text-subtle)]">{t("revisionPreviewHint")}</p>
      </div>
      {!previewUrl ? <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-brand-cyan)] px-4 text-sm font-extrabold text-[var(--color-brand-cyan)] disabled:opacity-60" data-create-revision-preview disabled={pending} onClick={createPreview} type="button"><Eye className="h-4 w-4" />{t("revisionPreviewCreate")}</button> : <div className="grid gap-2">
        <a className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-4 text-sm font-extrabold text-[var(--color-text)]" href={previewUrl} rel="noreferrer" target="_blank">{t("revisionPreviewOpen")} <ExternalLink className="h-4 w-4" /></a>
        <button className="inline-flex min-h-11 items-center justify-center gap-2 text-sm font-bold text-[var(--color-danger)] disabled:opacity-60" disabled={pending} onClick={revokePreview} type="button"><Link2Off className="h-4 w-4" />{t("revisionPreviewRevoke")}</button>
      </div>}
    </section>

    <section className="grid gap-3 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface-subtle)] p-4">
      <div>
        <h3 className="font-extrabold text-[var(--color-text)]">{t("revisionApplyTitle")}</h3>
        <p className="mt-1 text-sm leading-6 text-[var(--color-text-subtle)]">{t("revisionApplyHint")}</p>
      </div>
      <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-brand-violet)] px-4 text-sm font-extrabold text-white disabled:opacity-60" data-apply-revision disabled={pending} onClick={applyRevision} type="button"><Send className="h-4 w-4" />{t("revisionUpdate")}</button>
      <a className="inline-flex min-h-11 items-center justify-center gap-2 text-sm font-bold text-[var(--color-brand-cyan)]" href={`/${locale}/events/${publicSlug}`} rel="noreferrer" target="_blank">{t("revisionPublicPage")} <ExternalLink className="h-4 w-4" /></a>
      <button className="inline-flex min-h-11 items-center justify-center gap-2 text-sm font-bold text-[var(--color-danger)] disabled:opacity-60" data-discard-revision disabled={pending} onClick={discardRevision} type="button"><RotateCcw className="h-4 w-4" />{t("revisionDiscard")}</button>
    </section>
    <input name="eventId" type="hidden" value={eventId} />
    {message && <p className="rounded-[var(--radius-control)] border border-[var(--color-brand-cream)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-cream)]" role="alert">{message}</p>}
  </div>;
}

export function DiscardRevisionButton({ revisionId, locale = "id" }: { revisionId: string; locale?: "id" | "en" }) {
  const t = getEventEditorTranslator(locale);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <button
    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] px-3 text-sm font-bold text-[var(--color-danger)] disabled:opacity-60"
    disabled={pending}
    onClick={() => startTransition(async () => {
      const result = await discardPublishedEventRevisionAction({ revisionId });
      if (result.status === "discarded") router.refresh();
    })}
    type="button"
  ><RotateCcw className="h-4 w-4" />{t("revisionDiscard")}</button>;
}
