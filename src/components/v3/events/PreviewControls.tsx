"use client";

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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await createPreview({ eventId, locale });
        if (result.status === "created") setPreviewUrl(result.url);
        else setError("Private preview is available only while this event is a draft.");
      } catch {
        setError("Could not create the private preview.");
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
        setError("Could not revoke the private preview.");
      }
    });
  }

  return <section aria-labelledby="preview-heading" className="grid gap-3">
    <div>
      <h2 className="text-base font-extrabold text-[var(--color-text)]" id="preview-heading">Private preview</h2>
      <p className="mt-1 text-sm text-[var(--color-text-subtle)]">Create a temporary read-only link before publishing.</p>
    </div>
    {!previewUrl ? <button
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-action)] px-4 text-sm font-bold text-[var(--color-action-text)] disabled:opacity-60"
      data-create-preview
      disabled={pending}
      onClick={create}
      type="button"
    ><Eye aria-hidden="true" className="h-4 w-4" />Create preview</button> : <div className="grid gap-2">
      <a className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-4 text-sm font-bold text-[var(--color-text)]" href={previewUrl} rel="noreferrer" target="_blank">
        Open preview <ExternalLink aria-hidden="true" className="h-4 w-4" />
      </a>
      <button className="inline-flex min-h-11 items-center justify-center gap-2 text-sm font-bold text-[var(--color-danger)] disabled:opacity-60" data-revoke-preview disabled={pending} onClick={revoke} type="button">
        <Link2Off aria-hidden="true" className="h-4 w-4" />Revoke link
      </button>
    </div>}
    {error && <p role="alert" className="text-sm font-semibold text-[var(--color-danger)]">{error}</p>}
  </section>;
}