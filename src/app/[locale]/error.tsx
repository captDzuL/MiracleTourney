"use client";

import { useTranslations } from "next-intl";

// Shown when a page under a locale cannot load its data, for example when the database is unreachable.
// Organizer match-day pages have their own, closer boundaries.
export default function LocaleError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errorPage");

  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-10 text-center">
      <h1 className="text-2xl font-semibold text-white">{t("title")}</h1>
      <p className="text-sm text-slate-400">{t("description")}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-2 rounded-full bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
      >
        {t("retry")}
      </button>
    </div>
  );
}
