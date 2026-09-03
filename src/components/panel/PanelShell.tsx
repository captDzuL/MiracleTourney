import { PanelThemeToggle } from "@/components/panel/PanelThemeToggle";

/**
 * Wraps an operator surface (admin / captain / organizer) and hosts the theme
 * toggle. The `.panel-surface` scope itself is applied by `AppShell` so that
 * the header and footer follow the same theme; this component only adds the
 * control bar above the page content.
 */
export function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="panel-scope">
      <div className="mx-auto flex w-full max-w-7xl justify-end px-4 pt-4 sm:px-6">
        <PanelThemeToggle />
      </div>
      {children}
    </div>
  );
}
