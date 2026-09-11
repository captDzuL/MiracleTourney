"use client";

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
        ? "Beberapa informasi terkunci karena pendaftaran sudah ditutup atau pertandingan sudah dibuat."
        : result.status === "conflict"
          ? "Event publik berubah sejak revisi dibuat. Muat ulang sebelum mencoba lagi."
          : "Revisi tidak dapat diterapkan karena status event sudah berubah.");
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
      setMessage("Revisi tidak dapat dibatalkan. Muat ulang halaman untuk melihat status terbaru.");
    });
  }

  function createPreview() {
    setMessage(null);
    startTransition(async () => {
      const result = await createPublishedRevisionPreviewAction({ revisionId, locale });
      if (result.status === "created") setPreviewUrl(result.url);
      else setMessage("Preview privat tidak tersedia karena revisi atau status event sudah berubah.");
    });
  }

  function revokePreview() {
    setMessage(null);
    startTransition(async () => {
      const result = await revokePublishedRevisionPreviewAction({ revisionId });
      if (result.status === "revoked") setPreviewUrl(null);
      else setMessage("Tautan preview sudah tidak aktif.");
    });
  }

  return <div className="grid gap-6">
    <section className="grid gap-3 rounded-[var(--radius-control)] border border-[var(--color-border)] p-4">
      <div>
        <h3 className="font-extrabold text-[var(--color-text)]">Preview revisi privat</h3>
        <p className="mt-1 text-sm leading-6 text-[var(--color-text-subtle)]">Halaman publik tetap menampilkan versi lama sampai revisi diterapkan.</p>
      </div>
      {!previewUrl ? <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-brand-cyan)] px-4 text-sm font-extrabold text-[var(--color-brand-cyan)] disabled:opacity-60" data-create-revision-preview disabled={pending} onClick={createPreview} type="button"><Eye className="h-4 w-4" />Buat preview privat</button> : <div className="grid gap-2">
        <a className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-4 text-sm font-extrabold text-[var(--color-text)]" href={previewUrl} rel="noreferrer" target="_blank">Buka preview <ExternalLink className="h-4 w-4" /></a>
        <button className="inline-flex min-h-11 items-center justify-center gap-2 text-sm font-bold text-[var(--color-danger)] disabled:opacity-60" disabled={pending} onClick={revokePreview} type="button"><Link2Off className="h-4 w-4" />Cabut tautan</button>
      </div>}
    </section>

    <section className="grid gap-3 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface-subtle)] p-4">
      <div>
        <h3 className="font-extrabold text-[var(--color-text)]">Terapkan ke halaman publik</h3>
        <p className="mt-1 text-sm leading-6 text-[var(--color-text-subtle)]">Periksa live preview. Semua perubahan tersimpan sebagai revisi privat sampai tombol ini ditekan.</p>
      </div>
      <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-brand-violet)] px-4 text-sm font-extrabold text-white disabled:opacity-60" data-apply-revision disabled={pending} onClick={applyRevision} type="button"><Send className="h-4 w-4" />Perbarui event publik</button>
      <a className="inline-flex min-h-11 items-center justify-center gap-2 text-sm font-bold text-[var(--color-brand-cyan)]" href={`/${locale}/events/${publicSlug}`} rel="noreferrer" target="_blank">Lihat halaman publik saat ini <ExternalLink className="h-4 w-4" /></a>
      <button className="inline-flex min-h-11 items-center justify-center gap-2 text-sm font-bold text-[var(--color-danger)] disabled:opacity-60" data-discard-revision disabled={pending} onClick={discardRevision} type="button"><RotateCcw className="h-4 w-4" />Batalkan revisi</button>
    </section>
    <input name="eventId" type="hidden" value={eventId} />
    {message && <p className="rounded-[var(--radius-control)] border border-[var(--color-brand-cream)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-cream)]" role="alert">{message}</p>}
  </div>;
}

export function DiscardRevisionButton({ revisionId }: { revisionId: string }) {
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
  ><RotateCcw className="h-4 w-4" />Batalkan revisi</button>;
}
