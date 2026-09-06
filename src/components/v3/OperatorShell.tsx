"use client";

import React from "react";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { BrandLogo } from "./BrandLogo";
import { PublicShell, type ShellNavigationItem } from "./PublicShell";

export type OperatorShellProps = {
  actions?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  homeHref: string;
  mobileMenuLabel: string;
  navigation: ShellNavigationItem[];
};

function Navigation({ navigation, onNavigate }: { navigation: ShellNavigationItem[]; onNavigate?: () => void }) {
  return (
    <nav aria-label="Navigasi operator" className="space-y-1">
      {navigation.map((item) => (
        <a
          key={item.href}
          aria-current={item.active ? "page" : undefined}
          className="block rounded-[var(--radius-control)] border border-transparent px-3 py-2.5 text-sm font-semibold text-[var(--color-text-muted)] hover:border-[var(--color-border)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-text)] aria-[current=page]:border-[var(--color-border-strong)] aria-[current=page]:bg-[var(--color-surface-selected)] aria-[current=page]:text-[var(--color-text)]"
          href={item.href}
          onClick={onNavigate}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}

export function OperatorShell({ actions, children, footer, homeHref, mobileMenuLabel, navigation }: OperatorShellProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="app-root miracle-v3 flex min-h-screen flex-col bg-[var(--color-bg)] text-[var(--color-text)]">
      <a className="fixed left-4 top-3 z-[100] -translate-y-24 rounded-[var(--radius-control)] bg-[var(--color-brand-cream)] px-4 py-2 font-bold text-[var(--color-text-inverse)] focus:translate-y-0" href="#main-content">
        Lewati ke konten
      </a>
      <header className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-bg)]/95 backdrop-blur">
        <div className="flex min-h-16 items-center gap-3 px-4 sm:px-6">
          <button aria-expanded={open} aria-label={mobileMenuLabel} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border)] lg:hidden" onClick={() => setOpen((value) => !value)} type="button">
            {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
          <a href={homeHref}><BrandLogo className="w-32" /></a>
          <div className="ml-auto flex items-center gap-2">{actions}</div>
        </div>
      </header>
      {open ? (
        <div className="fixed inset-0 z-40 bg-[var(--color-bg)] px-4 pb-8 pt-24 lg:hidden">
          <Navigation navigation={navigation} onNavigate={() => setOpen(false)} />
        </div>
      ) : null}
      <div className="grid w-full flex-1 lg:grid-cols-[var(--sidebar-width-operator)_minmax(0,1fr)]">
        <aside className="hidden border-r border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 lg:block">
          <Navigation navigation={navigation} />
        </aside>
        <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8" id="main-content">{children}</main>
      </div>
      {footer}
    </div>
  );
}

type V3ShellRouterProps = {
  actions?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  homeHref: string;
  mobileMenuLabel: string;
  operatorNavigation: ShellNavigationItem[];
  publicNavigation: ShellNavigationItem[];
};

export function V3ShellRouter(props: V3ShellRouterProps) {
  const pathname = usePathname();
  const operator = /\/(admin|captain|organizer)(\/|$)/.test(pathname);
  const markActive = (items: ShellNavigationItem[]) => items.map((item) => ({ ...item, active: pathname === item.href || pathname.startsWith(`${item.href}/`) }));

  if (operator) {
    return <OperatorShell {...props} navigation={markActive(props.operatorNavigation)} />;
  }

  return <PublicShell actions={props.actions} brandHref={props.homeHref} footer={props.footer} navigation={markActive(props.publicNavigation)}>{props.children}</PublicShell>;
}
