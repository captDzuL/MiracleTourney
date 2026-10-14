import React from "react";
import { getTranslations } from "next-intl/server";

import { card, field, muted, primaryButton } from "@/components/player/styles";
import { SubmitButton } from "@/components/submit-button";
import { updatePlayerProfileAction } from "@/lib/actions/player-profile-actions";
import { getPlayerWhatsapp } from "@/lib/player/profile-repository";

import { openPlayerPage } from "../guard";

export const dynamic = "force-dynamic";

const ERRORS: Readonly<Record<string, string>> = {
  "invalid-whatsapp": "notices.invalidWhatsapp",
  "too-many": "notices.tooMany",
  "save-failed": "notices.saveFailed",
};

export default async function PlayerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ success?: string; error?: string }>;
}) {
  const { locale, user } = await openPlayerPage(params);
  const [t, query, whatsapp] = await Promise.all([getTranslations("player"), searchParams, getPlayerWhatsapp(user.id)]);
  const errorKey = query?.error ? ERRORS[query.error] : undefined;

  return (
    <div className="mx-auto max-w-md space-y-6">
      <header>
        <h1 className="text-2xl font-black text-slate-950">{t("profile.title")}</h1>
        <p className={muted + " mt-1"}>{t("profile.description")}</p>
      </header>

      {query?.success === "saved" && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{t("notices.saved")}</p>
      )}
      {errorKey && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{t(errorKey)}</p>
      )}

      <form action={updatePlayerProfileAction} className={card + " grid gap-4"}>
        <input type="hidden" name="locale" value={locale} />
        <label className="grid gap-1.5 text-sm font-medium text-slate-700" htmlFor="player-whatsapp">
          {t("profile.whatsapp")}
          <input
            id="player-whatsapp"
            className={field}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            name="whatsapp"
            required
            defaultValue={whatsapp ? `+${whatsapp}` : ""}
            placeholder="0812 3456 7890"
            aria-describedby="player-whatsapp-hint"
          />
          <span id="player-whatsapp-hint" className="text-xs font-normal text-slate-500">{t("profile.hint")}</span>
        </label>
        <div>
          <SubmitButton className={primaryButton}>{t("profile.submit")}</SubmitButton>
        </div>
      </form>
    </div>
  );
}
