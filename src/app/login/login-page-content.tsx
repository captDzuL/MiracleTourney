import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { loginAction } from "@/lib/actions";

export async function renderLoginPage(
  searchParams?: Promise<{ error?: string }>,
  locale?: "id" | "en",
) {
  const t = await getTranslations("login");
  const resolvedSearchParams = await searchParams;

  return (
    <div className="mx-auto max-w-md rounded-[2rem] border border-white/10 bg-slate-900/70 p-8">
      <h1 className="text-3xl font-semibold text-white">{t("title")}</h1>
      <p className="mt-2 text-sm text-slate-400">{t("description")}</p>

      {resolvedSearchParams?.error ? (
        <p className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {t("error")}
        </p>
      ) : null}

      <form action={loginAction} className="mt-6 space-y-4">
        {locale ? <input type="hidden" name="locale" value={locale} /> : null}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-300">
            {t("emailLabel")}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
            placeholder={t("emailPlaceholder")}
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-300">
            {t("passwordLabel")}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
            placeholder="........"
          />
        </div>
        <button
          type="submit"
          className="mt-2 w-full rounded-full bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
        >
          {t("submit")}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-400">
        {t("noAccount")}{" "}
        <Link href="/register" className="text-cyan-400 hover:text-cyan-300">
          {t("registerHere")}
        </Link>
      </p>
    </div>
  );
}
