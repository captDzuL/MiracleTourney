import { requestPasswordResetAction } from "@/lib/actions";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams?: Promise<{ sent?: string; error?: string }>;
}) {
  const params = await searchParams;
  const sent = params?.sent === "1";
  const error = params?.error ? decodeURIComponent(params.error) : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-8 shadow-xl">
        <h1 className="mb-6 text-xl font-semibold text-white">Lupa Password</h1>
        {sent ? (
          <p className="text-sm text-slate-300">
            Jika email terdaftar, link reset password telah dikirim. Periksa log server atau
            hubungi penyelenggara.
          </p>
        ) : (
          <form action={requestPasswordResetAction} className="space-y-4">
            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </p>
            )}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                placeholder="email@contoh.com"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-full bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
            >
              Kirim Link Reset
            </button>
          </form>
        )}
        <p className="mt-6 text-center text-sm text-slate-400">
          <a href="/login" className="text-cyan-400 hover:text-cyan-300">
            Kembali ke Login
          </a>
        </p>
      </div>
    </main>
  );
}
