import React from "react";
import type { ReactNode } from "react";

import { BrandLogo } from "./BrandLogo";

export type ShellNavigationItem = {
  href: string;
  label: string;
  active?: boolean;
};

type PublicShellProps = {
  actions?: ReactNode;
  brandHref: string;
  children: ReactNode;
  footer: ReactNode;
  navigation: ShellNavigationItem[];
};

export function PublicShell({ actions, brandHref, children, footer, navigation }: PublicShellProps) {
  return (
    <div className="app-root miracle-v3 flex min-h-screen flex-col bg-[var(--color-bg)] text-[var(--color-text)]">
      <a
        className="fixed left-4 top-3 z-[100] -translate-y-24 rounded-[var(--radius-control)] bg-[var(--color-brand-cream)] px-4 py-2 font-bold text-[var(--color-text-inverse)] transition-transform focus:translate-y-0"
        href="#main-content"
      >
        Lewati ke konten
      </a>
      <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-bg)]/95 backdrop-blur">
        <div className="mx-auto grid min-h-16 w-full max-w-[var(--content-width-public)] grid-cols-[1fr_auto] items-center gap-4 px-4 sm:px-6 md:grid-cols-[1fr_auto_1fr]">
          <a className="w-fit focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]" href={brandHref}>
            <BrandLogo className="w-32 sm:w-40" />
          </a>
          <nav aria-label="Navigasi utama" className="hidden items-center justify-center gap-1 md:flex">
            {navigation.map((item) => (
              <a
                key={item.href}
                aria-current={item.active ? "page" : undefined}
                className="rounded-[var(--radius-control)] px-4 py-2 text-sm font-semibold text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-text)] aria-[current=page]:bg-[var(--color-surface-selected)] aria-[current=page]:text-[var(--color-text)]"
                href={item.href}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center justify-end gap-2">{actions}</div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[var(--content-width-public)] flex-1 px-4 py-8 sm:px-6" id="main-content">
        {children}
      </main>
      {footer}
    </div>
  );
}
