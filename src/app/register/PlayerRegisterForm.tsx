"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { SubmitButton } from "@/components/submit-button";
import { Link } from "@/i18n/navigation";
import { playerSignUpAction } from "@/lib/actions/player-signup-actions";
import { normalizeWhatsapp } from "@/lib/player/profile";

const inputCls =
  "mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none";
const labelCls = "block text-sm font-medium text-slate-300";

type Props = {
  errorMsg?: string;
  locale?: "id" | "en";
  returnTo?: string;
};

/** Account form for a player. The server action checks everything again; this only saves a round trip. */
export function PlayerRegisterForm({ errorMsg, locale, returnTo }: Props) {
  const t = useTranslations("register");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [clientError, setClientError] = useState("");

  function findProblem() {
    if (fullName.trim().length < 2) return t("errorFullName");
    if (!email.includes("@") || !email.includes(".")) return t("errorEmail");
    if (normalizeWhatsapp(whatsapp) === null) return t("errorWhatsapp");
    if (password.length < 8) return t("errorPassword");
    if (password !== confirmPassword) return t("errorConfirm");
    return "";
  }

  const displayError = clientError || errorMsg;
  const loginHref = returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : "/login";

  return (
    <div className="mx-auto max-w-md rounded-[2rem] border border-white/10 bg-slate-900/70 p-8">
      {displayError && (
        <p role="alert" className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {displayError}
        </p>
      )}
      <form
        action={playerSignUpAction}
        onSubmit={(event) => {
          const problem = findProblem();
          setClientError(problem);
          if (problem) event.preventDefault();
        }}
        className="space-y-4"
      >
        {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
        {locale ? <input type="hidden" name="locale" value={locale} /> : null}
        <h1 className="text-3xl font-semibold text-white">{t("playerTitle")}</h1>
        <p className="text-sm text-slate-400">{t("playerDesc")}</p>
        <div>
          <label className={labelCls} htmlFor="player-full-name">{t("fullName")}</label>
          <input id="player-full-name" className={inputCls} type="text" name="fullName" autoComplete="name"
            placeholder={t("fullNamePlaceholder")} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </div>
        <div>
          <label className={labelCls} htmlFor="player-email">{t("email")}</label>
          <input id="player-email" className={inputCls} type="email" name="email" autoComplete="email"
            placeholder={t("emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className={labelCls} htmlFor="player-whatsapp">{t("whatsapp")}</label>
          <input id="player-whatsapp" className={inputCls} type="tel" name="whatsapp" autoComplete="tel" inputMode="tel"
            aria-describedby="player-whatsapp-hint" placeholder={t("whatsappPlaceholder")} value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)} required />
          <p id="player-whatsapp-hint" className="mt-1 text-xs text-slate-400">{t("whatsappHint")}</p>
        </div>
        <div>
          <label className={labelCls} htmlFor="player-password">{t("password")}</label>
          <input id="player-password" className={inputCls} type="password" name="password" autoComplete="new-password"
            placeholder={t("passwordPlaceholder")} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div>
          <label className={labelCls} htmlFor="player-confirm-password">{t("confirmPassword")}</label>
          <input id="player-confirm-password" className={inputCls} type="password" autoComplete="new-password"
            placeholder={t("confirmPlaceholder")} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
        </div>
        <SubmitButton className="mt-2 w-full rounded-full bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300">
          {t("submit")}
        </SubmitButton>
        <p className="text-center text-sm text-slate-400">
          {t("haveAccount")}{" "}
          <Link href={loginHref as never} className="text-cyan-400 hover:text-cyan-300">{t("loginHere")}</Link>
        </p>
      </form>
    </div>
  );
}
