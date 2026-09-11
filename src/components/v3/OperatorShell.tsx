"use client";

import React, { useEffect, useState, type ReactNode } from "react";
import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { logoutAction } from "@/lib/session-actions";
import { BrandLogo } from "./BrandLogo";
import { PublicShell, ShellMobileNavigation, ShellNavigation, ShellSkipLink, shellFocus, type ShellNavigationItem } from "./PublicShell";

export type OperatorShellProps = {
  actions?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  homeHref: string;
  mobileMenuLabel?: string;
  navigation: ShellNavigationItem[];
};

export function OperatorShell({ actions, children, footer, homeHref, mobileMenuLabel, navigation }: OperatorShellProps) {
  const t = useTranslations("v3Shell");
  return <div className="app-root miracle-v3 flex min-h-screen flex-col bg-[var(--color-bg)] text-[var(--color-text)]">
    <ShellSkipLink />
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
      <div className="mx-auto flex min-h-16 max-w-[var(--content-width-operator)] items-center gap-2 px-4 min-[620px]:gap-3 min-[620px]:px-6">
        <ShellMobileNavigation operator navigation={navigation} label={t("operatorNavigation")} menuLabel={mobileMenuLabel} />
        <Link href={homeHref} className={`min-w-0 ${shellFocus}`}><BrandLogo className="w-24 max-w-full min-[620px]:w-32" /></Link>
        <div className="ml-auto flex items-center gap-2">{actions}</div>
      </div>
    </header>
    <div className="mx-auto grid w-full max-w-[var(--content-width-operator)] flex-1 min-[980px]:grid-cols-[var(--sidebar-width-operator)_minmax(0,1fr)]">
      <aside className="hidden border-r border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 min-[980px]:block"><ShellNavigation navigation={navigation} label={t("operatorNavigation")} /></aside>
      <main className="min-w-0 scroll-mt-24 px-4 py-6 min-[620px]:px-6 min-[980px]:px-8" id="main-content" tabIndex={-1}>{children}</main>
    </div>
    {footer}
  </div>;
}

type V3ShellRouterProps = Omit<OperatorShellProps, "navigation"> & {
  operatorNavigation: ShellNavigationItem[];
  publicNavigation: ShellNavigationItem[];
};
type SessionUser = { name: string; role: string; pendingCount: number };

export function V3ShellRouter(props: V3ShellRouterProps) {
  // next-intl removes the locale prefix before route matching.
  const pathname = usePathname();
  const t = useTranslations("nav");
  const [session, setSession] = useState<{ pathname: string; user: SessionUser | null } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/me", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Session unavailable");
        return response.json() as Promise<{ user: SessionUser | null }>;
      })
      .then(({ user }) => { if (!controller.signal.aborted) setSession({ pathname, user }); })
      .catch(() => { if (!controller.signal.aborted) setSession({ pathname, user: null }); });
    return () => controller.abort();
  }, [pathname]);
  const user = session?.pathname === pathname ? session.user : null;
  const operator = /^\/(admin|captain|organizer)(\/|$)/.test(pathname);
  const permitted = props.operatorNavigation.filter(item => !item.roles || (user && item.roles.includes(user.role)));
  const items = operator ? permitted : [...props.publicNavigation, ...permitted.filter(item => !props.publicNavigation.some(publicItem => publicItem.href === item.href))];
  const activeHref = items.filter(item => pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`))).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const navigation = items.map(item => ({
    ...item,
    active: item.href === activeHref,
    label: item.href === "/admin" && user && user.pendingCount > 0 ? `${item.label} (${user.pendingCount})` : item.label,
  }));
  const actions = <>{props.actions}{user ? <form action={logoutAction}><button type="submit" aria-label={t("logoutLabel")} className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border)] px-3 ${shellFocus}`}><LogOut className="h-4 w-4" aria-hidden="true" /><span className="sr-only">{user.name}</span></button></form> : <Link href="/login" className={`shrink-0 rounded-[var(--radius-control)] border border-[var(--color-border)] px-2 py-3 text-sm font-semibold ${shellFocus}`}>{t("login")}</Link>}</>;
  if (operator) return <OperatorShell {...props} actions={actions} navigation={navigation} />;
  return <PublicShell actions={actions} brandHref={props.homeHref} footer={props.footer} navigation={navigation}>{props.children}</PublicShell>;
}
