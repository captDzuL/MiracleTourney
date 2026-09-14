"use client";
import type { ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";

/** Only the flagged homepage owns its full frame. All other routes retain their shell. */
export function PublicHomepageShellBoundary({ enabled, children, shell }: { enabled: boolean; children: ReactNode; shell: ReactNode }) {
  const pathname = usePathname();
  return enabled && pathname === "/" ? children : shell;
}
