"use client";
import { getEventEditorTranslator } from "./event-editor-translations";

import { useState, useTransition } from "react";
import { ExternalLink, Eye, Link2Off } from "lucide-react";

import { createEventPreviewAction, revokeEventPreviewAction } from "@/lib/actions/event-v3-actions";

type CreatePreview = typeof createEventPreviewAction;
type RevokePreview = typeof revokeEventPreviewAction;

type PreviewControlsProps = {
  createPreview?: CreatePreview;
  eventId: string;
  locale: "id" | "en";
  revokePreview?: RevokePreview;
};

export function PreviewControls({
  createPreview = createEventPreviewAction,
  eventId,
  locale,
  revokePreview = revokeEventPreviewAction,
}: PreviewControlsProps) {
  const t = getEventEditorTranslator(locale);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await createPreview({ eventId, locale });
        if (result.status === "created") setPreviewUrl(result.url);
        else setError(t("previewDraftOnly"));
      } catch {
        setError(t("previewCreateError"));
      }
    });
  }

  function revoke() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await revokePreview({ eventId });
        if (result.status === "revoked") setPreviewUrl(null);
      } catch {
        setError(t("previewRevokeError"));
      }
    });
  }

  return <section aria-labelledby="preview-heading" className="grid gap-3">
    <div>
      <h2 className="text-base font-extrabold text-[var(--color-text)]" id="preview-heading">{t("previewTitle")}</h2>
      <p className="mt-1 text-sm text-[var(--color-text-subtle)]">{t("previewHint")}</p>
    </div>
    {!previewUrl ? <button
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-action)] px-4 text-sm font-bold text-[var(--color-action-text)] disabled:opacity-60"
      data-create-preview
      disabled={pending}
      onClick={create}
      type="button"
    ><Eye aria-hidden="true" className="h-4 w-4" />{t("previewCreate")}</button> : <div className="grid gap-2">
      <a className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-4 text-sm font-bold text-[var(--color-text)]" href={previewUrl} rel="noreferrer" target="_blank">
        {t("previewOpen")} <ExternalLink aria-hidden="true" className="h-4 w-4" />
      </a>
      <button className="inline-flex min-h-11 items-center justify-center gap-2 text-sm font-bold text-[var(--color-danger)] disabled:opacity-60" data-revoke-preview disabled={pending} onClick={revoke} type="button">
        <Link2Off aria-hidden="true" className="h-4 w-4" />{t("previewRevoke")}
      </button>
    </div>}
    {error && <p role="alert" className="text-sm font-semibold text-[var(--color-danger)]">{error}</p>}
  </section>;
}
