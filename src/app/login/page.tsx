import Link from "next/link";

import { loginAction } from "@/lib/actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  return (
    <div className="mx-auto max-w-md rounded-[2rem] border border-white/10 bg-slate-900/70 p-8">
      <h1 className="text-3xl font-semibold text-white">Sign in</h1>
      <p className="mt-2 text-sm text-slate-400">
        Enter your email and password to access the tournament portal.
      </p>

      {resolvedSearchParams?.error ? (
        <p className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          Invalid email or password.
        </p>
      ) : null}

      <form action={loginAction} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-300">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-300">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
            placeholder="••••••••"
          />
        </div>
        <button
          type="submit"
          className="mt-2 w-full rounded-full bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
        >
          Sign in
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-400">
        Belum punya akun?{" "}
        <Link href={"/register" as never} className="text-cyan-400 hover:text-cyan-300">
          Daftar di sini
        </Link>
      </p>
    </div>
  );
}
