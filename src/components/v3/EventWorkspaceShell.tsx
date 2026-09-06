import React from "react";
import type { ReactNode } from "react";

import type { ShellNavigationItem } from "./PublicShell";

type EventWorkspaceShellProps = {
  children: ReactNode;
  eventTitle: string;
  navigation: ShellNavigationItem[];
  nextAction?: ReactNode;
  organizerLabel: string;
};

export function EventWorkspaceShell({ children, eventTitle, navigation, nextAction, organizerLabel }: EventWorkspaceShellProps) {
  return (
    <section className="grid gap-6 xl:grid-cols-[15rem_minmax(0,1fr)_18rem]">
      <aside className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-subtle)]">{organizerLabel}</p>
        <h1 className="mt-2 text-center text-xl font-extrabold text-[var(--color-text)]">{eventTitle}</h1>
        <nav aria-label="Navigasi event" className="mt-5 space-y-1">
          {navigation.map((item) => (
            <a key={item.href} aria-current={item.active ? "page" : undefined} className="block rounded-[var(--radius-control)] px-3 py-2 text-sm font-semibold text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)] aria-[current=page]:bg-[var(--color-surface-selected)] aria-[current=page]:text-[var(--color-text)]" href={item.href}>{item.label}</a>
          ))}
        </nav>
      </aside>
      <div className="min-w-0">{children}</div>
      {nextAction ? (
        <aside aria-label="Tindakan berikutnya" className="h-fit rounded-[var(--radius-panel)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-4 xl:sticky xl:top-24">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-brand-cream)]">Langkah berikutnya</p>
          {nextAction}
        </aside>
      ) : null}
    </section>
  );
}
