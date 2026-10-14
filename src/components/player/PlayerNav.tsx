"use client";

import React from "react";
import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";

const ITEMS = [
  { href: "/player", key: "summary" },
  { href: "/player/registrations", key: "registrations" },
  { href: "/player/profile", key: "profile" },
  { href: "/player/settings", key: "settings" },
] as const;

/** The four pages of the player area. The overview matches only its own address, the others also what is under them. */
export function PlayerNav() {
  const t = useTranslations("player");
  const pathname = usePathname();
  const current = (href: string) => (href === "/player" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <nav aria-label={t("navLabel")} className="grid w-full grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm sm:flex">
      {ITEMS.map(({ href, key }) => (
        <Link
          key={key}
          href={href as never}
          aria-current={current(href) ? "page" : undefined}
          className={`inline-flex min-h-11 items-center justify-center rounded-lg px-3.5 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
            current(href) ? "bg-slate-950 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
          }`}
        >
          {t(`nav.${key}`)}
        </Link>
      ))}
    </nav>
  );
}
