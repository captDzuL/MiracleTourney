import { ArrowLeft, KeyRound } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { redirectToActiveLocale } from "@/i18n/redirect";
import { changePasswordAction } from "@/lib/actions";
import { requireRole } from "@/lib/auth/session";
import { hasTempPassword } from "@/lib/platform/repository";
import { buttonStyles } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export default async function CaptainSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const user = await requireRole("captain");
  if (!user) {
    return redirectToActiveLocale("/login");
  }

  const t = await getTranslations("captainSettings");
  const params = await searchParams;
  const error = params?.error ? decodeURIComponent(params.error) : null;
  const usingTempPassword = await hasTempPassword(user.id);

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/captain"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-black text-slate-900">{t("title")}</h1>
          <p className="text-sm text-slate-500">{t("description")}</p>
        </div>
      </div>

      {usingTempPassword && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {t("tempWarning")}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-slate-400" />
          <h2 className="font-semibold text-slate-900">{t("sectionTitle")}</h2>
        </div>

        <form action={changePasswordAction} className="grid gap-4">
          <label className="grid gap-1.5 text-sm text-slate-600">
            {t("current")}
            <input
              type="password"
              name="currentPassword"
              required
              autoComplete="current-password"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </label>
          <label className="grid gap-1.5 text-sm text-slate-600">
            {t("new")}
            <input
              type="password"
              name="newPassword"
              required
              minLength={8}
              autoComplete="new-password"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <span className="text-xs text-slate-400">{t("hint")}</span>
          </label>
          <label className="grid gap-1.5 text-sm text-slate-600">
            {t("confirm")}
            <input
              type="password"
              name="confirmPassword"
              required
              autoComplete="new-password"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </label>
          <div className="pt-1">
            <SubmitButton className={`${buttonStyles.primary} text-sm`}>
              {t("submit")}
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
