"use client";

import { User } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

type Role = "captain" | "player";

function registerHref(role: Role, returnTo?: string) {
  const query = new URLSearchParams({ as: role });
  if (returnTo) query.set("returnTo", returnTo);
  return `/register?${query.toString()}`;
}

/** A captain's armband: an upper arm with the band around it and a C on the band. */
function ArmbandIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1.5v6M16 1.5v6M8 16.5v6M16 16.5v6" />
      <rect x="3.5" y="7.5" width="17" height="9" rx="2" fill="currentColor" fillOpacity="0.2" />
      <path d="M14.7 10.1a3 3 0 1 0 0 3.8" />
    </svg>
  );
}

const card = "group flex h-full flex-col items-start gap-4 rounded-3xl border border-white/10 bg-slate-900/70 p-6 text-left transition hover:border-cyan-400 hover:bg-cyan-400/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 motion-reduce:transition-none";
const iconWrap = "grid size-14 place-items-center rounded-2xl bg-cyan-400/10 text-cyan-300 transition group-hover:bg-cyan-400/20 motion-reduce:transition-none";

/**
 * The first screen of sign-up while solo tournaments are on: two cards, nothing else.
 * The form only shows after the visitor picks one.
 */
export function RegisterRoleChooser({ returnTo }: { returnTo?: string }) {
  const t = useTranslations("register");
  const roles: Array<{ role: Role; label: string; hint: string; icon: React.ReactNode }> = [
    { role: "captain", label: t("roleCaptain"), hint: t("roleCaptainHint"), icon: <ArmbandIcon /> },
    { role: "player", label: t("rolePlayer"), hint: t("rolePlayerHint"), icon: <User aria-hidden="true" className="size-8" strokeWidth={1.8} /> },
  ];
  const loginHref = returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : "/login";

  return (
    <section aria-labelledby="register-role-title" className="mx-auto max-w-xl">
      <h1 id="register-role-title" className="mb-5 text-center text-2xl font-extrabold text-white">{t("roleQuestion")}</h1>
      <ul className="grid gap-4 sm:grid-cols-2">
        {roles.map(({ role, label, hint, icon }) => (
          <li key={role}>
            <Link href={registerHref(role, returnTo) as never} className={card}>
              <span className={iconWrap}>{icon}</span>
              <span>
                <span className="block text-lg font-bold text-white">{label}</span>
                <span className="mt-1 block text-sm text-slate-400">{hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-center text-sm text-slate-400">
        {t("haveAccount")}{" "}
        <Link href={loginHref as never} className="text-cyan-400 hover:underline">{t("loginHere")}</Link>
      </p>
    </section>
  );
}

/** Goes back to the two cards from a sign-up form. */
export function ChangeRoleLink({ returnTo }: { returnTo?: string }) {
  const t = useTranslations("register");
  const href = returnTo ? `/register?returnTo=${encodeURIComponent(returnTo)}` : "/register";
  return (
    <div className="mx-auto mb-4 max-w-md">
      <Link href={href as never} className="text-sm font-medium text-cyan-400 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300">
        {t("roleChange")}
      </Link>
    </div>
  );
}
