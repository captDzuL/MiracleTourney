"use client";

import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";

import { Link } from "@/i18n/navigation";
import { logoutAction } from "@/lib/actions";

type MeResponse = { user: { name: string; role: string; pendingCount: number } | null };

export function SessionNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [data, setData] = useState<MeResponse>({ user: null });

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/me", { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) {
          throw new Error(`Failed to load session nav: ${r.status}`);
        }

        return r.json() as Promise<MeResponse>;
      })
      .then((payload) => {
        setData(payload);
      })
      .catch(() => {
        setData({ user: null });
      });

    return () => {
      controller.abort();
    };
  }, [pathname]);

  const { user } = data;

  return (
    <>
      {user?.role === "captain" && (
        <Link
          className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 md:block"
          href="/captain/stats"
        >
          {t("matchStats")}
        </Link>
      )}
      {(user?.role === "platform_admin" || user?.role === "organizer" || user?.role === "admin") && (
        <Link
          className="relative hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 md:block"
          href="/admin"
        >
          {t("admin")}
          {(user.pendingCount ?? 0) > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              {user.pendingCount}
            </span>
          )}
        </Link>
      )}
      {user?.role === "captain" && (
        <Link
          className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 md:block"
          href="/captain"
        >
          {t("captain")}
        </Link>
      )}
      {user ? (
        <form action={logoutAction}>
          <button
            type="submit"
            aria-label={t("logoutLabel")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <LogOut className="h-3.5 w-3.5 text-slate-400" />
            <span className="hidden max-w-[120px] truncate sm:block">{user.name}</span>
          </button>
        </form>
      ) : (
        <Link
          className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100"
          href="/login"
        >
          {t("login")}
        </Link>
      )}
    </>
  );
}
