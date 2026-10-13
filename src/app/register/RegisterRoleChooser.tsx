"use client";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { CaptainArt, PlayerArt } from "./RoleCardArt";

type Role = "captain" | "player";

function registerHref(role: Role, returnTo?: string) {
  const query = new URLSearchParams({ as: role });
  if (returnTo) query.set("returnTo", returnTo);
  return `/register?${query.toString()}`;
}

/** Cut corners on two opposite sides, like the clipped buttons on the public pages. */
const CUT = 22;
const clip = (inset: number) => {
  const c = CUT - inset * 0.4;
  return `polygon(0 0, calc(100% - ${c}px) 0, 100% ${c}px, 100% 100%, ${c}px 100%, 0 calc(100% - ${c}px))`;
};

const accents: Record<Role, { edge: string; edgeHover: string; arrow: string }> = {
  captain: {
    edge: "from-[#00C8EE]/45 to-[#008BEA]/10",
    edgeHover: "group-hover:from-[#5BE3FF] group-hover:to-[#008BEA]/60",
    arrow: "text-[#5BE3FF]",
  },
  player: {
    edge: "from-[#B83CF0]/45 to-[#5927DF]/10",
    edgeHover: "group-hover:from-[#D58BFF] group-hover:to-[#5927DF]/60",
    arrow: "text-[#D58BFF]",
  },
};

/**
 * The first screen of sign-up while solo tournaments are on: two poster cards, nothing else.
 * The form only shows after the visitor picks one.
 */
export function RegisterRoleChooser({ returnTo }: { returnTo?: string }) {
  const t = useTranslations("register");
  const roles: Array<{ role: Role; label: string; hint: string; art: React.ReactNode }> = [
    { role: "captain", label: t("roleCaptain"), hint: t("roleCaptainHint"), art: <CaptainArt /> },
    { role: "player", label: t("rolePlayer"), hint: t("rolePlayerHint"), art: <PlayerArt /> },
  ];
  const loginHref = returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : "/login";

  return (
    <section aria-labelledby="register-role-title" className="mx-auto max-w-2xl">
      <h1 id="register-role-title" className="mb-6 text-center text-2xl font-extrabold text-white">{t("roleQuestion")}</h1>
      <ul className="grid gap-5 sm:grid-cols-2">
        {roles.map(({ role, label, hint, art }) => (
          <li key={role}>
            <Link
              href={registerHref(role, returnTo) as never}
              style={{ clipPath: clip(0) }}
              className={`group relative block min-h-60 bg-gradient-to-br p-px transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300 motion-reduce:transition-none sm:min-h-72 ${accents[role].edge} ${accents[role].edgeHover}`}
            >
              <span style={{ clipPath: clip(1) }} className="relative flex min-h-[calc(15rem-2px)] flex-col justify-end overflow-hidden bg-[#0B1424] p-6 sm:min-h-[calc(18rem-2px)]">
                <span className="absolute inset-0 transition-transform duration-500 ease-out group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100">{art}</span>
                <span className="absolute inset-0 bg-gradient-to-t from-[#0B1424] via-[#0B1424]/70 to-transparent" aria-hidden="true" />
                <span className="relative">
                  <span className="block font-[family-name:var(--font-display),Teko,Bahnschrift,sans-serif] text-5xl font-bold uppercase leading-[0.9] tracking-wide text-white">{label}</span>
                  <span className="mt-2 block max-w-[18rem] pr-10 text-pretty text-sm text-slate-300">{hint}</span>
                </span>
                <ArrowRight aria-hidden="true" className={`absolute bottom-6 right-6 size-6 transition-transform group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0 ${accents[role].arrow}`} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-7 text-center text-sm text-slate-400">
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
