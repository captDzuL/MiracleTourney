"use client";
import React, { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { buildOrganizerEventNavigation } from "@/lib/organizer/workspace-navigation";
import type { OrganizerWorkspaceSummary } from "@/lib/organizer/workspace-types";
import { BrandLogo } from "../BrandLogo";
import { ShellSkipLink } from "../PublicShell";
import { OrganizerEventRail } from "./OrganizerEventRail";
import { OrganizerEventHeader } from "./OrganizerEventHeader";
import { ContextualGuide } from "./ContextualGuide";

export function OrganizerMasterShell({ children, summary, locale, setup, legacy }: { children: ReactNode; summary: OrganizerWorkspaceSummary; locale: "en" | "id"; setup?: ReactNode; legacy?: ReactNode }) {
  const t = useTranslations("organizerMaster");
  const pathname = usePathname();
  const id = useId();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const backgroundRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  // Match detail and certificate detail belong to their operational sections.
  const activePath = pathname.replace(/\/matches\/[^/]+(?:\/.*)?$/, "/match-control").replace(/\/certificates(?:\/.*)?$/, "/completion");
  const navigation = buildOrganizerEventNavigation(locale, summary.event.id, summary, `/${locale}${activePath}`);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 980px)");
    const closeOnDesktop = () => { if (media.matches) setOpen(false); };
    media.addEventListener("change", closeOnDesktop);
    return () => media.removeEventListener("change", closeOnDesktop);
  }, []);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    backgroundRef.current?.setAttribute("inert", "");
    closeRef.current?.focus();
    const containFocus = (event: FocusEvent) => { if (event.target instanceof Node && !drawerRef.current?.contains(event.target)) closeRef.current?.focus(); };
    document.addEventListener("focusin", containFocus);
    return () => {
      document.removeEventListener("focusin", containFocus);
      document.body.style.overflow = previousOverflow;
      backgroundRef.current?.removeAttribute("inert");
      if (window.matchMedia("(min-width: 980px)").matches) mainRef.current?.focus(); else triggerRef.current?.focus();
    };
  }, [open]);
  if (pathname.startsWith("/admin/") && legacy) return legacy;
  const control = "miracle-focus-ring inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-3 text-xs font-bold hover:bg-[var(--color-surface-selected)]";
  return <div className="app-root miracle-v3 min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
    <div ref={backgroundRef}>
      <ShellSkipLink />
      <div className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
        <div className="mx-auto flex min-h-[72px] max-w-[var(--content-width-operator)] items-center gap-3 px-4 py-3 sm:px-6">
          <button ref={triggerRef} type="button" aria-label={t("shell.openNavigation")} aria-controls={id} aria-expanded={open} className={`${control} min-[980px]:hidden`} onClick={() => setOpen(true)}><Menu aria-hidden="true" className="size-5" /></button>
          <Link href="/" locale={locale} className="miracle-focus-ring flex min-h-11 items-center"><BrandLogo alt={t("shell.brand")} className="w-28 sm:w-36" /></Link>
          <p className="mx-auto hidden min-w-0 truncate px-4 text-sm font-bold min-[700px]:block">{summary.event.title}</p>
          <nav aria-label={t("shell.language")} className="ml-auto flex gap-2">{(["id", "en"] as const).map(language => <Link key={language} href={pathname} locale={language} aria-current={language === locale ? "true" : undefined} className={`${control} aria-[current=true]:bg-[var(--color-surface-selected)]`}>{t(`shell.language_${language}`)}</Link>)}</nav>
        </div>
      </div>
      <div className="mx-auto grid max-w-[var(--content-width-operator)] min-[980px]:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="hidden border-r border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 min-[980px]:block"><OrganizerEventRail summary={summary} navigation={navigation} locale={locale} /></aside>
        <main ref={mainRef} id="main-content" tabIndex={-1} className="min-w-0 space-y-5 p-4 outline-none sm:p-6 lg:p-8 [&_:focus-visible]:scroll-m-6">
          <OrganizerEventHeader summary={summary} locale={locale} />
          <ContextualGuide key={`${summary.event.id}:${summary.lifecycle}`} eventId={summary.event.id} lifecycle={summary.lifecycle} />
          <div className="min-w-0">{pathname.endsWith("/edit") && setup ? setup : children}</div>
        </main>
      </div>
    </div>
    {open && <div className="fixed inset-0 z-[100] bg-black/70" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div ref={drawerRef} id={id} role="dialog" aria-modal="true" aria-label={t("shell.eventNavigation")} className="h-full w-full max-w-sm overflow-y-auto overscroll-contain bg-[var(--color-bg)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
        if (event.key !== "Tab") return;
        const focusable = drawerRef.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled])');
        const first = focusable?.[0]; const last = focusable?.[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
        <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-sm font-bold">{t("shell.eventNavigation")}</h2><button ref={closeRef} type="button" aria-label={t("shell.closeNavigation")} className={control} onClick={() => setOpen(false)}><X className="size-5" aria-hidden="true" /></button></div>
        <OrganizerEventRail summary={summary} navigation={navigation} locale={locale} onNavigate={() => setOpen(false)} />
      </div>
    </div>}
  </div>;
}
