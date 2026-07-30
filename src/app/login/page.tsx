import { loginAction } from "@/lib/actions";
import { appUsers } from "@/lib/platform/config";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  return (
    <div className="mx-auto max-w-2xl rounded-[2rem] border border-white/10 bg-slate-900/70 p-8">
      <h1 className="text-3xl font-semibold text-white">Demo access</h1>
      <p className="mt-2 text-sm text-slate-400">
        This MVP ships with seeded captain and admin accounts so we can validate the full UX before wiring production auth.
      </p>

      {resolvedSearchParams?.error ? (
        <p className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          Login failed. Please use one of the seeded demo accounts below.
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {appUsers.map((user) => (
          <form key={user.id} action={loginAction} className="rounded-2xl border border-white/8 bg-white/5 p-5">
            <p className="text-sm text-slate-400">{user.role.toUpperCase()}</p>
            <h2 className="mt-2 text-xl font-semibold text-white">{user.name}</h2>
            <p className="mt-1 text-sm text-slate-300">{user.email}</p>
            <input type="hidden" name="email" value={user.email} />
            <button className="mt-5 w-full rounded-full bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950" type="submit">
              Continue as {user.role}
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
