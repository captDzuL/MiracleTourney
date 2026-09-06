import React from "react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ShellNavigation, type ShellNavigationItem } from "./PublicShell";

type EventWorkspaceShellProps = {
  children: ReactNode;
  eventTitle: string;
  navigation: ShellNavigationItem[];
  nextAction?: ReactNode;
  organizerLabel: string;
};

export function EventWorkspaceShell({ children, eventTitle, navigation, nextAction, organizerLabel }: EventWorkspaceShellProps) {
  const t = useTranslations("v3Shell");
  return <section className="grid min-w-0 gap-6 min-[1100px]:grid-cols-[var(--sidebar-width-operator)_minmax(0,1fr)_16rem]">
    <div className="min-w-0 text-center min-[1100px]:col-span-full">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-subtle)]">{organizerLabel}</p>
      <h1 className="mt-2 break-words text-xl font-extrabold text-[var(--color-text)]">{eventTitle}</h1>
    </div>
    <aside className="min-w-0 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"><ShellNavigation navigation={navigation} label={t("eventNavigation")} /></aside>
    <div className="min-w-0">{children}</div>
    {nextAction && <aside aria-label={t("nextAction")} className="sticky bottom-0 z-10 h-fit rounded-[var(--radius-panel)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-4 min-[1100px]:bottom-auto min-[1100px]:top-24">
      <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-brand-cream)]">{t("nextStep")}</p>{nextAction}
    </aside>}
  </section>;
}
