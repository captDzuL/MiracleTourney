"use client";
import type { ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";

/** Only the flagged discovery routes own a full frame; detail/operator routes retain their shell. */
export function PublicHomepageShellBoundary({ enabled, children, shell }: { enabled: boolean; children: ReactNode; shell: ReactNode }) {
  const pathname = usePathname();
  return enabled && (pathname === "/" || pathname === "/events") ? children : shell;
}
