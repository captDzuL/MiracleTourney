"use client";
import type { ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";

/** Canonical event pages own their frame. New-event setup and legacy admin retain theirs. */
export function OrganizerShellBoundary({ enabled, children, shell }: { enabled: boolean; children: ReactNode; shell: ReactNode }) {
  const pathname = usePathname();
  return enabled && /^\/organizer\/events\/(?!new(?:\/|$))[^/]+(?:\/|$)/.test(pathname) ? children : shell;
}
