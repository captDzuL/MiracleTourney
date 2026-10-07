"use client";

import React from "react";
import { Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

type Props = { locale: "id" | "en"; event: { id: string; slug?: string | null; name: string | null; status: string; organizerName: string | null; organizer?: { organizerProfile: { contactChannel: string; contactValue: string } | null } | null }; contact: { href: string | null } };
export function EventSettingsWorkspace({ locale, event, contact }: Props) {
  const t = useTranslations("organizerMaster.settings");
  const edit = `/${locale}/organizer/events/${encodeURIComponent(event.id)}/edit`;
  return <main className="grid min-w-0 gap-5" data-event-settings>
    <header className="min-w-0 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 min-[700px]:p-7"><div className="flex items-start gap-3"><Settings2 aria-hidden="true" className="mt-1 size-5 shrink-0 text-[var(--color-accent-cyan-foreground)]" /><div className="min-w-0"><h1 className="break-words text-2xl font-extrabold">{t("title")}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-muted)]">{t("description")}</p></div></div></header>
    <section className="grid min-w-0 gap-3 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5"><h2 className="text-lg font-extrabold">{t("eventDetails")}</h2><p className="break-words text-sm text-[var(--color-text-muted)]">{event.name ?? t("unnamed")}</p><Link className="min-h-11 w-fit rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-4 py-3 text-sm font-bold miracle-focus-ring" href={`${edit}#section-identity`}>{t("editEvent")}</Link></section>
    <div className="grid min-w-0 gap-4 min-[760px]:grid-cols-3">
      <SettingsEntry title={t("publication")} body={event.status} href={`${edit}#section-review`} label={t("openPublication")} />
      <SettingsEntry title={t("contact")} body={event.organizer?.organizerProfile?.contactValue ?? event.organizerName ?? t("contactMissing")} href={contact.href} label={t("openContact")} />
      <SettingsEntry title={t("preferences")} body={t("preferencesBody")} href={`${edit}#section-format`} label={t("openPreferences")} />
    </div>
  </main>;
}
function SettingsEntry({ title, body, href, label }: { title: string; body: string; href: string | null; label: string }) { return <section className="grid min-w-0 content-start gap-3 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5"><h2 className="break-words text-base font-extrabold">{title}</h2><p className="break-words text-sm text-[var(--color-text-muted)]">{body}</p>{href ? <Link className="min-h-11 w-fit rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-4 py-3 text-sm font-bold miracle-focus-ring" href={href}>{label}</Link> : null}</section>; }