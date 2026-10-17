import React from "react";
import { KeyRound } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { card, field, muted, primaryButton } from "@/components/player/styles";
import { SubmitButton } from "@/components/submit-button";
import { changePasswordAction } from "@/lib/actions/identity-actions";
import { hasTempPassword } from "@/lib/identity/repository";

import { openPlayerPage } from "../guard";

export const dynamic = "force-dynamic";

/** The only messages the password action sends back. Anything else in the address is not shown. */
const KNOWN_ERRORS: ReadonlySet<string> = new Set([
  "Semua field harus diisi.",
  "Password baru minimal 8 karakter.",
  "Konfirmasi password tidak cocok.",
  "Terjadi kesalahan. Coba lagi.",
  "Terlalu banyak percobaan. Coba lagi dalam 15 menit.",
  "Password saat ini tidak tepat.",
]);

/** The password form of the captain pages, on the player's own address. The wording is the same: one thing, one phrase. */
export default async function PlayerSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ error?: string }>;
}) {
  const { user } = await openPlayerPage(params);
  const [t, query, usingTempPassword] = await Promise.all([getTranslations("captainSettings"), searchParams, hasTempPassword(user.id)]);
  const error = query?.error && KNOWN_ERRORS.has(query.error) ? query.error : null;

  return (
    <div className="mx-auto max-w-md space-y-6">
      <header>
        <h1 className="text-2xl font-black text-slate-950">{t("title")}</h1>
        <p className={muted + " mt-1"}>{t("description")}</p>
      </header>

      {usingTempPassword && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{t("tempWarning")}</p>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}

      <section className={card}>
        <div className="mb-5 flex items-center gap-2">
          <KeyRound aria-hidden="true" className="h-5 w-5 text-slate-400" />
          <h2 className="font-semibold text-slate-900">{t("sectionTitle")}</h2>
        </div>
        <form action={changePasswordAction} className="grid gap-4">
          <label className="grid gap-1.5 text-sm text-slate-600">
            {t("current")}
            <input className={field} type="password" name="currentPassword" required autoComplete="current-password" />
          </label>
          <label className="grid gap-1.5 text-sm text-slate-600">
            {t("new")}
            <input className={field} type="password" name="newPassword" required minLength={8} autoComplete="new-password" />
            <span className="text-xs text-slate-400">{t("hint")}</span>
          </label>
          <label className="grid gap-1.5 text-sm text-slate-600">
            {t("confirm")}
            <input className={field} type="password" name="confirmPassword" required autoComplete="new-password" />
          </label>
          <div>
            <SubmitButton className={primaryButton}>{t("submit")}</SubmitButton>
          </div>
        </form>
      </section>
    </div>
  );
}
