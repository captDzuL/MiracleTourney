"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { captainSignUpAction } from "@/lib/actions";
import type { Event } from "@/lib/platform/types";

const inputCls =
  "mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none";
const labelCls = "block text-sm font-medium text-slate-300";

export function RegisterWizard({ events, errorMsg }: { events: Event[]; errorMsg?: string }) {
  const t = useTranslations("register");
  const [step, setStep] = useState<1 | 2>(1);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [clientError, setClientError] = useState("");

  function handleNext() {
    if (fullName.trim().length < 2) { setClientError(t("errorFullName")); return; }
    if (!email.includes("@") || !email.includes(".")) { setClientError(t("errorEmail")); return; }
    if (password.length < 8) { setClientError(t("errorPassword")); return; }
    if (password !== confirmPassword) { setClientError(t("errorConfirm")); return; }
    setClientError("");
    setStep(2);
  }

  const displayError = clientError || errorMsg;

  return (
    <div className="mx-auto max-w-md rounded-[2rem] border border-white/10 bg-slate-900/70 p-8">
      <div className="mb-6 flex items-center gap-2 text-xs text-slate-500">
        <span className={step === 1 ? "font-semibold text-cyan-400" : ""}>{t("step1")}</span>
        <span>→</span>
        <span className={step === 2 ? "font-semibold text-cyan-400" : ""}>{t("step2")}</span>
      </div>

      {displayError && (
        <p className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {displayError}
        </p>
      )}

      {step === 1 ? (
        <div className="space-y-4">
          <h1 className="text-3xl font-semibold text-white">{t("step1Title")}</h1>
          <p className="text-sm text-slate-400">{t("step1Desc")}</p>

          <div>
            <label className={labelCls}>{t("fullName")}</label>
            <input
              className={inputCls}
              type="text"
              autoComplete="name"
              placeholder={t("fullNamePlaceholder")}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>{t("email")}</label>
            <input
              className={inputCls}
              type="email"
              autoComplete="email"
              placeholder={t("emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>{t("password")}</label>
            <input
              className={inputCls}
              type="password"
              autoComplete="new-password"
              placeholder={t("passwordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            />
          </div>

          <button
            type="button"
            onClick={handleNext}
            className="mt-2 w-full rounded-full bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
          >
            {t("next")}
          </button>

          <p className="text-center text-sm text-slate-400">
            {t("haveAccount")}{" "}
            <Link href="/login" className="text-cyan-400 hover:text-cyan-300">
              {t("loginHere")}
            </Link>
          </p>
        </div>
      ) : (
        <form action={captainSignUpAction} className="space-y-4">
          <input type="hidden" name="fullName" value={fullName} />
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="password" value={password} />

          <h1 className="text-3xl font-semibold text-white">{t("step2Title")}</h1>
          <p className="text-sm text-slate-400">{t("step2Desc")}</p>

          {events.length === 0 ? (
            <p className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
              {t("noEvents")}
            </p>
          ) : (
            <>
              <div>
                <label className={labelCls}>{t("event")}</label>
                <select
                  name="eventId"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-3 text-sm text-white focus:border-cyan-400 focus:outline-none"
                  required
                >
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>{t("teamName")}</label>
                <input
                  className={inputCls}
                  type="text"
                  name="teamName"
                  placeholder={t("teamNamePlaceholder")}
                  minLength={2}
                  required
                />
              </div>
              <div>
                <label className={labelCls}>{t("teamTag")}</label>
                <input
                  className={`${inputCls} uppercase`}
                  type="text"
                  name="teamTag"
                  placeholder={t("teamTagPlaceholder")}
                  minLength={2}
                  maxLength={4}
                  required
                  style={{ textTransform: "uppercase" }}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setClientError(""); setStep(1); }}
                  className="flex-1 rounded-full border border-white/10 px-4 py-3 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:text-white"
                >
                  {t("back")}
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-full bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                >
                  {t("submit")}
                </button>
              </div>
            </>
          )}
        </form>
      )}
    </div>
  );
}
