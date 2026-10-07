"use client";
import React from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, ClipboardList, Flag, LayoutDashboard, Megaphone, Settings, Swords, Trophy, Users, CalendarDays } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { OrganizerEventNavigationItem, OrganizerLocale } from "@/lib/organizer/workspace-navigation";
import type { OrganizerWorkspaceSummary } from "@/lib/organizer/workspace-types";

const icons = { overview: LayoutDashboard, registration: ClipboardList, participants: Users, competition: Trophy, schedule: CalendarDays, "match-control": Swords, completion: Flag, announcements: Megaphone, settings: Settings };
const messageKeys = { overview: "overview", registration: "registration", participants: "participants", competition: "competition", schedule: "schedule", "match-control": "matchControl", completion: "completion", announcements: "announcements", settings: "settings" } as const;

export function OrganizerEventRail({ summary, navigation, locale, onNavigate }: { summary: OrganizerWorkspaceSummary; navigation: OrganizerEventNavigationItem[]; locale: OrganizerLocale; onNavigate?: () => void }) {
  const t = useTranslations("organizerMaster");
  return <div className="flex min-h-full min-w-0 flex-col gap-5">
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <p className="break-words text-sm font-bold">{summary.event.title}</p>
      <p className="mt-1 text-xs text-[var(--color-text-muted)]">{summary.event.game}</p>
    </div>
    <nav aria-label={t("shell.eventNavigation")} className="grid gap-1">
      {navigation.map(item => {
        const Icon = icons[item.section];
        return <Link key={item.section} locale={locale} href={item.href.replace(/^\/(id|en)(?=\/)/, "")} onClick={onNavigate} aria-current={item.active ? "page" : undefined} className="miracle-focus-ring flex min-h-11 min-w-0 items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] aria-[current=page]:bg-[var(--color-surface-selected)] aria-[current=page]:font-bold aria-[current=page]:text-[var(--color-text)]">
          <Icon className="size-[18px] shrink-0" aria-hidden="true" /><span className="min-w-0 break-words">{t(`navigation.${messageKeys[item.section]}`)}</span>
          {item.badge !== undefined && item.badge > 0 && <span className="ml-auto rounded-full border border-[var(--color-border-strong)] px-2 py-0.5 text-xs tabular-nums text-[var(--color-brand-cream)]">{item.badge}</span>}
        </Link>;
      })}
    </nav>
    <Link href={summary.role === "organizer" ? "/organizer" : "/admin"} locale={locale} onClick={onNavigate} className="miracle-focus-ring mt-auto flex min-h-11 items-center gap-3 border-t border-[var(--color-border)] px-3 py-3 text-sm text-[var(--color-text-muted)]"><ArrowLeft className="size-[18px]" aria-hidden="true" />{t("shell.allEvents")}</Link>
  </div>;
}
