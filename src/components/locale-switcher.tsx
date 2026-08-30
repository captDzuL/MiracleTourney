"use client";

import React from "react";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";

export function LocaleSwitcher() {
  const locale = useLocale();
  const currentPathname = usePathname();
  const router = useRouter();

  function switchLocale(nextLocale: "id" | "en") {
    if (nextLocale === locale) return;

    const pathnameWithoutLocale = currentPathname.replace(/^\/(id|en)(?=\/|$)/, "") || "/";
    const targetPath = pathnameWithoutLocale === "/" ? `/${nextLocale}` : `/${nextLocale}${pathnameWithoutLocale}`;
    const query = typeof window !== "undefined" ? window.location.search : "";

    router.replace((`${targetPath}${query}`) as never);
    router.refresh();
  }

  return (
    <div
      className="pv-locale-switch inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5"
      aria-label="Pilih bahasa / Select language"
    >
      {(["id", "en"] as const).map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => switchLocale(lang)}
          aria-pressed={locale === lang}
          className={`pv-locale-btn min-w-[2rem] rounded-md px-2.5 py-1 text-xs font-semibold uppercase transition-colors ${
            locale === lang
              ? "pv-locale-btn--active bg-blue-600 text-white shadow-sm"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {lang}
        </button>
      ))}
    </div>
  );
}
