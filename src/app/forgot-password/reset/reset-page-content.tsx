import { resetPasswordAction } from "@/lib/actions";
import { SubmitButton } from "@/components/submit-button";

export async function renderResetPasswordPage(
  searchParams?: Promise<{ token?: string; error?: string }>,
) {
  const params = await searchParams;
  const token = params?.token ?? "";
  const error = params?.error ? decodeURIComponent(params.error) : undefined;

  if (!token) {
    return (
      <div className="mx-auto w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-8 shadow-xl">
        <p className="text-sm text-slate-300">
          Link tidak valid.{" "}
          <a href="/forgot-password" className="text-cyan-400 hover:text-cyan-300">
            Minta link baru
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-8 shadow-xl">
      <h1 className="mb-6 text-xl font-semibold text-white">Reset Password</h1>
      <form action={resetPasswordAction} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-300">
            Password Baru (min. 8 karakter)
          </label>
          <input
            id="password"
            name="password"
            type="password"
            minLength={8}
            required
            className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
            placeholder="........"
          />
        </div>
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300">
            Konfirmasi Password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
            placeholder="........"
          />
        </div>
        <SubmitButton className="w-full rounded-full bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300">
          Reset Password
        </SubmitButton>
      </form>
    </div>
  );
}
