"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";

import { Link } from "@/i18n/navigation";
import { logoutAction } from "@/lib/actions";

export function MobileMenuToggle({
  eventsLabel,
  captainLabel,
  adminLabel,
  loginLabel,
  matchStatsLabel,
  logoutLabel,
}: {
  eventsLabel: string;
  captainLabel: string;
  adminLabel: string;
  loginLabel: string;
  matchStatsLabel: string;
  logoutLabel: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ user: { name: string; role: string; pendingCount: number } | null }>({ user: null });

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/me", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load mobile nav: ${response.status}`);
        }

        return response.json() as Promise<{ user: { name: string; role: string; pendingCount: number } | null }>;
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
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Menu"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100 md:hidden"
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>

      {open && (
        <div className="absolute inset-x-0 top-full z-50 border-b border-slate-200 bg-white shadow-md md:hidden">
          <nav className="mx-auto grid max-w-7xl gap-1 px-4 py-3 sm:px-6">
            <Link
              href="/events"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              {eventsLabel}
            </Link>
            {user?.role === "captain" && (
              <>
                <Link
                  href="/captain"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  {captainLabel}
                </Link>
                <Link
                  href="/captain/stats"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  {matchStatsLabel}
                </Link>
              </>
            )}
            {user?.role === "admin" && (
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                {adminLabel}
              </Link>
            )}
            {user ? (
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  {logoutLabel}
                </button>
              </form>
            ) : (
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50"
              >
                {loginLabel}
              </Link>
            )}
          </nav>
        </div>
      )}
    </>
  );
}
