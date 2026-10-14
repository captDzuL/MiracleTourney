import React from "react";

import { PanelShell } from "@/components/panel/PanelShell";
import { PlayerNav } from "@/components/player/PlayerNav";

export default function PlayerLayout({ children }: { children: React.ReactNode }) {
  return (
    <PanelShell>
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <PlayerNav />
        {children}
      </div>
    </PanelShell>
  );
}
