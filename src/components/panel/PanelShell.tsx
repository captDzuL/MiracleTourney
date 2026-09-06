import { PanelThemeToggle } from "@/components/panel/PanelThemeToggle";
import { isFeatureEnabled } from "@/lib/feature-flags";

/** Wraps operator content while preserving the legacy rollback surface. */
export function PanelShell({ children }: { children: React.ReactNode }) {
  const visualV3 = isFeatureEnabled("ui_v3_foundation");

  return (
    <div className={visualV3 ? "panel-scope miracle-v3" : "panel-scope"}>
      <div className="mx-auto flex w-full max-w-7xl justify-end px-4 pt-4 sm:px-6">
        <PanelThemeToggle variant={visualV3 ? "v3" : "legacy"} />
      </div>
      {children}
    </div>
  );
}
