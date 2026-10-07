"use client";
import React, { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { OrganizerWorkspaceLifecycle } from "@/lib/organizer/workspace-types";

/** Advisory only: guide visibility never gates operational content or actions. */
export function ContextualGuide({ eventId, lifecycle }: { eventId: string; lifecycle: OrganizerWorkspaceLifecycle }) {
  const t = useTranslations("organizerMaster");
  const key = `miracle:organizer-guide:${eventId}:${lifecycle}:v1`;
  const titleId = useId();
  const [dismissed, setDismissed] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const restoreRef = useRef<HTMLButtonElement>(null);
  const dismissRef = useRef<HTMLButtonElement>(null);
  const focusNext = useRef(false);
  useEffect(() => {
    try { setDismissed(localStorage.getItem(key) === "dismissed"); } catch { setDismissed(false); }
    setLoadedKey(key);
  }, [key]);
  useEffect(() => {
    if (!focusNext.current) return;
    (dismissed ? restoreRef : dismissRef).current?.focus(); focusNext.current = false;
  }, [dismissed]);
  function changeDismissal(value: boolean) {
    try { if (value) localStorage.setItem(key, "dismissed"); else localStorage.removeItem(key); } catch { /* Storage can be disabled; the guide still works in this session. */ }
    focusNext.current = true; setDismissed(value);
  }
  const button = "miracle-focus-ring min-h-11 rounded-[var(--radius-control)] px-3 py-2 text-left text-xs font-bold text-[var(--color-brand-cyan)] hover:bg-[var(--color-surface-selected)]";
  if (loadedKey === key && dismissed) return <button ref={restoreRef} type="button" data-guide-restore className={button} onClick={() => changeDismissal(false)}>{t("guide.restore")}</button>;
  return <section aria-labelledby={titleId} className="rounded-[var(--radius-card)] border border-[var(--color-border)] border-l-2 border-l-[var(--color-brand-cyan)] bg-[var(--color-surface)] p-4">
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"><h2 id={titleId} className="text-sm font-bold">{t("guide.title")}</h2><button ref={dismissRef} type="button" data-guide-dismiss className={button} onClick={() => changeDismissal(true)}>{t("guide.dismiss")}</button></div>
    <p className="max-w-3xl text-sm leading-6 text-[var(--color-text-muted)]">{t(`guide.${lifecycle}`)}</p>
  </section>;
}
