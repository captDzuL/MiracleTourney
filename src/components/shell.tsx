import Link from "next/link";
import { LogOut, ShieldCheck, Trophy, Users } from "lucide-react";

import { logoutAction } from "@/lib/actions";
import { getSessionUser } from "@/lib/auth/session";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600/10 text-blue-700">
              <Trophy className="h-5 w-5" />
            </div>
            <div>
              <p className="mono text-sm font-semibold tracking-[0.2em] text-blue-700 uppercase">
                Miracle FC League
              </p>
              <p className="text-xs text-slate-500">Tournament control platform</p>
            </div>
          </Link>

          <nav className="flex items-center gap-2 text-sm text-slate-600">
            <Link className="rounded-full px-3 py-2 hover:bg-blue-50" href="/events">
              Events
            </Link>
            <Link className="rounded-full px-3 py-2 hover:bg-blue-50" href="/captain">
              Captain
            </Link>
            <Link className="rounded-full px-3 py-2 hover:bg-blue-50" href="/admin">
              Admin
            </Link>
            {user ? (
              <form action={logoutAction}>
                <button
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50"
                  type="submit"
                >
                  <LogOut className="h-4 w-4" />
                  {user.name}
                </button>
              </form>
            ) : (
              <Link className="rounded-full border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50" href="/login">
                Demo Login
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>

      <footer className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-6 text-xs text-slate-500 sm:px-6">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-2">
            <Users className="h-4 w-4" />
            Public + captain + admin in one app
          </span>
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Vercel + Neon ready foundation
          </span>
        </div>
        <span>Demo-mode persistence for UI validation</span>
      </footer>
    </div>
  );
}
