"use client";
import type { ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";

/** Flagged public overview routes own a full frame; detail/operator routes retain their shell. */
export function PublicHomepageShellBoundary({ enabled, eventOverviewEnabled = false, children, shell }: { enabled: boolean; eventOverviewEnabled?: boolean; children: ReactNode; shell: ReactNode }) {
  const pathname = usePathname();
  const discoveryRoute = pathname === "/" || pathname === "/events";
  const eventOverviewRoute = /^\/events\/[^/]+$/.test(pathname);
  return (enabled && discoveryRoute) || (eventOverviewEnabled && eventOverviewRoute) ? children : shell;
}
