"use client";

import React, { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { BrandLogo } from "./BrandLogo";

export type ShellNavigationItem = { href: string; label: string; active?: boolean; roles?: string[] };
export const shellFocus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]";
const navigationLink = `rounded-[var(--radius-control)] px-3 py-2.5 text-sm font-semibold text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-text)] aria-[current=page]:bg-[var(--color-surface-selected)] aria-[current=page]:text-[var(--color-text)] ${shellFocus}`;

export function ShellNavigation({ navigation, label, onNavigate, className = "space-y-1" }: { navigation: ShellNavigationItem[]; label: string; onNavigate?: () => void; className?: string }) {
  return <nav aria-label={label} className={className}>{navigation.map(item => <Link key={item.href} href={item.href} aria-current={item.active ? "page" : undefined} className={`block ${navigationLink}`} onClick={onNavigate}>{item.label}</Link>)}</nav>;
}

export function ShellSkipLink() {
  const t = useTranslations("v3Shell");
  return <a className={`fixed left-4 top-3 z-[100] -translate-y-24 rounded-[var(--radius-control)] bg-[var(--color-brand-cream)] px-4 py-2 font-bold text-[var(--color-text-inverse)] focus:translate-y-0 ${shellFocus}`} href="#main-content">{t("skipToContent")}</a>;
}

/** One mobile navigation owner, shared by public and operator shells. */
export function ShellMobileNavigation({ navigation, label, operator = false, menuLabel }: { navigation: ShellNavigationItem[]; label: string; operator?: boolean; menuLabel?: string }) {
  const t = useTranslations("v3Shell");
  const pathname = usePathname();
  const id = useId();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const breakpoint = operator ? "(min-width: 980px)" : "(min-width: 620px)";

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    const media = window.matchMedia(breakpoint);
    const closeOnDesktop = () => { if (media.matches) setOpen(false); };
    closeOnDesktop();
    media.addEventListener("change", closeOnDesktop);
    return () => media.removeEventListener("change", closeOnDesktop);
  }, [breakpoint]);
  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const containFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialogRef.current?.contains(event.target)) closeRef.current?.focus();
    };
    document.addEventListener("focusin", containFocus);
    return () => {
      document.removeEventListener("focusin", containFocus);
      document.body.style.overflow = previousOverflow;
      if (window.matchMedia(breakpoint).matches) document.getElementById("main-content")?.focus();
      else trigger?.focus();
    };
  }, [open, breakpoint]);

  return <>
    <button ref={triggerRef} type="button" aria-label={menuLabel ?? t("openNavigation")} aria-expanded={open} aria-controls={id} className={`inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border)] ${operator ? "min-[980px]:hidden" : "min-[620px]:hidden"} ${shellFocus}`} onClick={() => setOpen(true)}><Menu aria-hidden="true" /></button>
    {open && <div ref={dialogRef} id={id} role="dialog" aria-modal="true" aria-label={label} className="fixed inset-0 z-[80] overflow-y-auto bg-[var(--color-bg)] p-4 text-[var(--color-text)]" onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled])');
      const first = focusable?.[0];
      const last = focusable?.[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <div className="mb-6 flex items-center justify-between gap-4"><p className="font-semibold">{label}</p><button ref={closeRef} type="button" aria-label={t("closeNavigation")} className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border)] ${shellFocus}`} onClick={() => setOpen(false)}><X aria-hidden="true" /></button></div>
      <ShellNavigation navigation={navigation} label={label} onNavigate={() => setOpen(false)} />
    </div>}
  </>;
}

type PublicShellProps = { actions?: ReactNode; brandHref: string; children: ReactNode; footer: ReactNode; navigation: ShellNavigationItem[] };

export function PublicShell({ actions, brandHref, children, footer, navigation }: PublicShellProps) {
  const t = useTranslations("v3Shell");
  return <div className="app-root miracle-v3 flex min-h-screen flex-col bg-[var(--color-bg)] text-[var(--color-text)]">
    <ShellSkipLink />
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
      <div className="mx-auto grid min-h-16 w-full max-w-[var(--content-width-public)] grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4 min-[620px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] min-[620px]:gap-4 min-[620px]:px-6">
        <Link className={`w-fit min-w-0 ${shellFocus}`} href={brandHref}><BrandLogo className="w-24 max-w-full min-[620px]:w-32" /></Link>
        <ShellNavigation label={t("primaryNavigation")} navigation={navigation} className="hidden items-center justify-center gap-1 min-[620px]:flex" />
        <div className="flex items-center justify-end gap-2">{actions}<ShellMobileNavigation navigation={navigation} label={t("primaryNavigation")} /></div>
      </div>
    </header>
    <main className="mx-auto w-full max-w-[var(--content-width-public)] flex-1 scroll-mt-24 px-4 py-8 min-[620px]:px-6" id="main-content" tabIndex={-1}>{children}</main>
    {footer}
  </div>;
}
