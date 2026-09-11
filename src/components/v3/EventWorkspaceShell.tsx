"use client";

import React, { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { ShellNavigationItem } from "./PublicShell";

type EventWorkspaceShellProps = {
  children: ReactNode;
  eventTitle: string;
  navigation: ShellNavigationItem[];
  nextAction?: ReactNode;
  organizerLabel: string;
};

/** Shared draft workspace shell. Setup stays visible as numbered, horizontal progress. */
export function EventWorkspaceShell({ children, eventTitle, navigation, nextAction, organizerLabel }: EventWorkspaceShellProps) {
  const t = useTranslations("v3Shell");
  const pathname = usePathname();
  const effectiveNavigation = useMemo(() => pathname.endsWith("/edit")
    ? navigation.map((item) => ({ ...item, href: item.href.replace("/overview#", "/edit#") }))
    : navigation, [navigation, pathname]);
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, effectiveNavigation.findIndex((item) => item.active)));

  useEffect(() => {
    const syncActiveStep = () => {
      const index = effectiveNavigation.findIndex((item) => window.location.hash && item.href.endsWith(window.location.hash));
      if (index >= 0) setActiveIndex(index);
    };
    syncActiveStep();
    window.addEventListener("hashchange", syncActiveStep);
    return () => window.removeEventListener("hashchange", syncActiveStep);
  }, [effectiveNavigation]);
  return <section className="grid min-w-0 gap-6">
    <header className="min-w-0 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 min-[700px]:p-7">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-subtle)]">{organizerLabel}</p>
      <h1 className="mt-2 break-words text-sm font-semibold text-[var(--color-text)]">{eventTitle}</h1>
      <h2 className="mt-4 text-2xl font-extrabold text-[var(--color-text)]">Wujudkan event pertamamu.</h2>
      <p className="mt-2 text-sm text-[var(--color-text-subtle)]">Isi sedikit demi sedikit. Lihat hasilnya sambil berjalan.</p>
    </header>
    <nav aria-label={t("eventNavigation")} className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 min-[700px]:p-3">
      <ol className="grid min-w-0 grid-cols-[repeat(var(--setup-step-count),minmax(0,1fr))] gap-1 min-[700px]:gap-2" style={{ "--setup-step-count": effectiveNavigation.length } as React.CSSProperties}>
        {effectiveNavigation.map((item, index) => <li key={item.href}>
          <Link aria-current={index === activeIndex ? "step" : undefined} className="group flex min-h-11 min-w-0 items-center justify-center rounded-[var(--radius-control)] px-1 text-sm font-bold text-[var(--color-text-subtle)] transition hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-text)] aria-[current=step]:bg-[var(--color-surface-strong)] aria-[current=step]:text-[var(--color-text)] min-[900px]:min-h-12 min-[900px]:justify-start min-[900px]:gap-3 min-[900px]:px-3" href={item.href} onClick={(event) => { const hash = item.href.slice(item.href.indexOf("#")); if (hash) { event.preventDefault(); window.history.replaceState(null, "", hash); window.dispatchEvent(new HashChangeEvent("hashchange")); } setActiveIndex(index); }}>
            <span className="grid size-7 shrink-0 place-items-center rounded-full border border-[var(--color-border-strong)] text-xs group-aria-[current=step]:border-[var(--color-brand-cyan)] group-aria-[current=step]:bg-[var(--color-brand-cyan)] group-aria-[current=step]:text-slate-950">{index + 1}</span>
            <span className="sr-only min-w-0 min-[900px]:not-sr-only min-[900px]:break-words">{item.label}</span>
          </Link>
        </li>)}
      </ol>
    </nav>
    <div className="grid min-w-0 gap-6 min-[1100px]:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="min-w-0">{children}</div>
      {nextAction && <aside aria-label={t("nextAction")} className="h-fit rounded-[var(--radius-panel)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-4 min-[1100px]:sticky min-[1100px]:top-24">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-brand-cream)]">{t("nextStep")}</p>{nextAction}
      </aside>}
    </div>
  </section>;
}