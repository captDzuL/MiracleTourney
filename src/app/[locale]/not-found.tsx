import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("notFound");

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-10 text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">404</p>
      <h1 className="text-2xl font-semibold text-white">{t("title")}</h1>
      <p className="text-sm text-slate-400">{t("description")}</p>
      <Link
        href="/"
        className="mt-2 rounded-full bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
      >
        {t("backHome")}
      </Link>
    </div>
  );
}
