"use client";
import React from "react";
import { useTranslations } from "next-intl";
import type { OrganizerWorkspaceSummary } from "@/lib/organizer/workspace-types";

export function OrganizerEventHeader({ summary, locale }: { summary: OrganizerWorkspaceSummary; locale: "en" | "id" }) {
  const t = useTranslations("organizerMaster");
  const updated = new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(summary.updatedAt));
  return <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--color-border)] pb-5">
    <div className="min-w-0">
      <p className="text-xs font-semibold tracking-wide text-[var(--color-brand-cyan)]">{t("shell.title")}</p>
      <h1 className="mt-2 break-words text-2xl font-extrabold tracking-tight sm:text-3xl">{summary.event.title}</h1>
      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[var(--color-text-muted)]">
        <div><dt className="sr-only">{t("shell.game")}</dt><dd>{summary.event.game}</dd></div>
        <div><dt className="sr-only">{t("shell.format")}</dt><dd>{summary.event.format === "Single Elimination" ? t("formats.singleElimination") : summary.event.format === "League" ? t("formats.league") : summary.event.format}</dd></div>
        <div><dt className="sr-only">{t("shell.role")}</dt><dd>{t(`roles.${summary.role}`)}</dd></div>
      </dl>
    </div>
    <div className="grid gap-3 text-xs">
      <dl className="flex flex-wrap gap-2">
        <div className="rounded-full border border-[var(--color-brand-cyan)] px-3 py-1.5 text-[var(--color-brand-cyan)]"><dt className="sr-only">{t("shell.lifecycle")}</dt><dd>{t(`lifecycle.${summary.lifecycle}`)}</dd></div>
        <div className="rounded-full border border-[var(--color-border-strong)] px-3 py-1.5 text-[var(--color-text-muted)]"><dt className="sr-only">{t("shell.publication")}</dt><dd>{t(`publication.${summary.publication}`)}</dd></div>
      </dl>
      <p className="text-[var(--color-text-muted)]"><time dateTime={summary.updatedAt}>{t("shell.lastUpdated", { date: updated })}</time></p>
    </div>
  </header>;
}
