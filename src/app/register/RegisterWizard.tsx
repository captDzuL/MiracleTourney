"use client";



import { useState } from "react";

import { useTranslations } from "next-intl";



import { Link } from "@/i18n/navigation";

import { captainSignUpAction } from "@/lib/actions";

import { SubmitButton } from "@/components/submit-button";



const inputCls =

  "mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none";

const labelCls = "block text-sm font-medium text-slate-300";



export function RegisterWizard({ errorMsg }: { errorMsg?: string }) {

  const t = useTranslations("register");

  const [fullName, setFullName] = useState("");

  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");

  const [confirmPassword, setConfirmPassword] = useState("");

  const [clientError, setClientError] = useState("");



  function validateAccountFields() {

    if (fullName.trim().length < 2) { setClientError(t("errorFullName")); return false; }

    if (!email.includes("@") || !email.includes(".")) { setClientError(t("errorEmail")); return false; }

    if (password.length < 8) { setClientError(t("errorPassword")); return false; }

    if (password !== confirmPassword) { setClientError(t("errorConfirm")); return false; }

    setClientError("");

    return true;

  }



  const displayError = clientError || errorMsg;



  return (

    <div className="mx-auto max-w-md rounded-[2rem] border border-white/10 bg-slate-900/70 p-8">

      <div className="mb-6 flex items-center gap-2 text-xs text-slate-500">

        <span className="font-semibold text-cyan-400">{t("step1")}</span>

      </div>



      {displayError && (

        <p className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">

          {displayError}

        </p>

      )}



      <form

        action={captainSignUpAction}

        onSubmit={(event) => {

          if (!validateAccountFields()) event.preventDefault();

        }}

        className="space-y-4"

      >

        <h1 className="text-3xl font-semibold text-white">{t("step1Title")}</h1>

        <p className="text-sm text-slate-400">{t("step1Desc")}</p>



        <div>

          <label className={labelCls}>{t("fullName")}</label>

          <input

            className={inputCls}

            type="text"

            name="fullName"

            autoComplete="name"

            placeholder={t("fullNamePlaceholder")}

            value={fullName}

            onChange={(e) => setFullName(e.target.value)}

            required

          />

        </div>

        <div>

          <label className={labelCls}>{t("email")}</label>

          <input

            className={inputCls}

            type="email"

            name="email"

            autoComplete="email"

            placeholder={t("emailPlaceholder")}

            value={email}

            onChange={(e) => setEmail(e.target.value)}

            required

          />

        </div>

        <div>

          <label className={labelCls}>{t("password")}</label>

          <input

            className={inputCls}

            type="password"

            name="password"

            autoComplete="new-password"

            placeholder={t("passwordPlaceholder")}

            value={password}

            onChange={(e) => setPassword(e.target.value)}

            required

          />

        </div>

        <div>

          <label className={labelCls}>{t("confirmPassword")}</label>

          <input

            className={inputCls}

            type="password"

            autoComplete="new-password"

            placeholder={t("confirmPlaceholder")}

            value={confirmPassword}

            onChange={(e) => setConfirmPassword(e.target.value)}

            required

          />

        </div>



        <SubmitButton className="mt-2 w-full rounded-full bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300">

          {t("submit")}

        </SubmitButton>



        <p className="text-center text-sm text-slate-400">

          {t("haveAccount")} {" "}

          <Link href="/login" className="text-cyan-400 hover:text-cyan-300">

            {t("loginHere")}

          </Link>

        </p>

      </form>

    </div>

  );

}
