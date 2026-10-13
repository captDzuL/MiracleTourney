// Tab bar of the captain dashboard.
// Moved out of page.tsx without changes (refactor Phase 4, 4b-captain).

import type { TFn } from "@/app/captain/dashboard/shared";
import { Link } from "@/i18n/navigation";

export function CaptainDashboardTabs({ activeTab, t }: { activeTab: "registration" | "roster"; t: TFn }) {
  const tabClass = (tab: "registration" | "roster") =>
    `inline-flex items-center justify-center rounded-lg px-3.5 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
      activeTab === tab
        ? "bg-slate-950 text-white shadow-sm"
        : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
    }`;

  return (
    <nav aria-label={t("dashboardTabsLabel")} className="flex w-full gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      <Link href="/captain?tab=registration" className={tabClass("registration")} aria-current={activeTab === "registration" ? "page" : undefined}>
        {t("registrationTab")}
      </Link>
      <Link href="/captain?tab=roster" className={tabClass("roster")} aria-current={activeTab === "roster" ? "page" : undefined}>
        {t("rosterTab")}
      </Link>
    </nav>
  );
}
