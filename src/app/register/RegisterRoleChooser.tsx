"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

type Role = "captain" | "player";

function registerHref(role: Role, returnTo?: string) {
  const query = new URLSearchParams();
  if (role === "player") query.set("as", "player");
  if (returnTo) query.set("returnTo", returnTo);
  const text = query.toString();
  return text ? `/register?${text}` : "/register";
}

const base = "block rounded-2xl border px-4 py-3 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300";
const active = "border-cyan-400 bg-cyan-400/10 text-white";
const idle = "border-white/10 bg-white/5 text-slate-300 hover:border-white/30";

/** Lets a visitor pick between a captain account and a player account. Shown only while solo tournaments are on. */
export function RegisterRoleChooser({ current, returnTo }: { current: Role; returnTo?: string }) {
  const t = useTranslations("register");
  const roles: Array<{ role: Role; label: string; hint: string }> = [
    { role: "captain", label: t("roleCaptain"), hint: t("roleCaptainHint") },
    { role: "player", label: t("rolePlayer"), hint: t("rolePlayerHint") },
  ];

  return (
    <nav aria-label={t("roleQuestion")} className="mx-auto mb-4 max-w-md">
      <p className="mb-2 text-sm font-medium text-slate-300">{t("roleQuestion")}</p>
      <ul className="grid grid-cols-2 gap-3">
        {roles.map(({ role, label, hint }) => (
          <li key={role}>
            <Link
              href={registerHref(role, returnTo) as never}
              aria-current={role === current ? "page" : undefined}
              className={`${base} ${role === current ? active : idle}`}
            >
              <span className="block font-semibold">{label}</span>
              <span className="mt-1 block text-xs text-slate-400">{hint}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
