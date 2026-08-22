import { Trophy, Users, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { SessionNav } from "@/components/session-nav";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { MobileMenuToggle } from "@/components/mobile-nav";
import { isFeatureEnabled } from "@/lib/feature-flags";

export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("nav");
  const visualV2 = isFeatureEnabled("public_visual_v2");

  // Only the header/footer chrome changes. Page content — including every
  // admin and captain surface — keeps its existing components and spacing.
  const chrome = visualV2
    ? {
        root: "public-visual-v2 min-h-screen",
        header: "sticky top-0 z-40 border-b border-[color:var(--pv-rule)] bg-[color:var(--pv-canvas)]/95 backdrop-blur-sm",
        mark: "flex h-9 w-9 items-center justify-center bg-[color:var(--pv-lime)] text-[color:var(--pv-canvas)]",
        brand: "pv-display text-base leading-none text-[color:var(--pv-ink)]",
        tagline: "pv-eyebrow mt-1 block leading-tight",
        navLink:
          "px-3 py-2 text-sm font-semibold uppercase tracking-[0.14em] text-[color:var(--pv-ink-muted)] transition-colors hover:text-[color:var(--pv-lime)]",
        footer:
          "mx-auto flex max-w-7xl items-center justify-between gap-4 border-t border-[color:var(--pv-rule)] px-4 py-6 text-[11px] uppercase tracking-[0.18em] text-[color:var(--pv-ink-muted)] sm:px-6",
      }
    : {
        root: "min-h-screen",
        header:
          "sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 shadow-sm backdrop-blur-sm",
        mark: "flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-sm",
        brand: "text-sm font-black uppercase leading-none tracking-wider text-slate-900",
        tagline: "mt-0.5 block text-[10px] leading-tight text-slate-400",
        navLink:
          "rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900",
        footer:
          "mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-6 text-xs text-slate-400 sm:px-6",
      };

  return (
    <div className={chrome.root}>
      <header className={chrome.header}>
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <div className={chrome.mark}>
              <Trophy className="h-[18px] w-[18px]" />
            </div>
            <div className="hidden sm:block">
              <p className={chrome.brand}>{t("brand")}</p>
              <span className={chrome.tagline}>{t("tagline")}</span>
            </div>
          </Link>

          <nav className="ml-4 hidden items-center gap-1 md:flex">
            <Link className={chrome.navLink} href="/events">
              {t("events")}
            </Link>
          </nav>

          <div className="flex-1" />

          <div className="flex items-center gap-2">
            <LocaleSwitcher />
            <SessionNav />
            <MobileMenuToggle
              eventsLabel={t("events")}
              captainLabel={t("captain")}
              adminLabel={t("admin")}
              loginLabel={t("login")}
              matchStatsLabel={t("matchStats")}
              logoutLabel={t("logoutLabel")}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>

      <footer className={chrome.footer}>
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            {t("footer.tagline")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            {t("footer.ready")}
          </span>
        </div>
      </footer>
    </div>
  );
}
