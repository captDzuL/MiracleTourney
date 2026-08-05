import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, KeyRound } from "lucide-react";

import { changePasswordAction } from "@/lib/actions";
import { requireRole } from "@/lib/auth/session";
import { hasTempPassword } from "@/lib/platform/repository";
import { buttonStyles } from "@/components/ui";

export default async function CaptainSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const user = await requireRole("captain");
  if (!user) redirect("/login");

  const params = await searchParams;
  const error = params?.error ? decodeURIComponent(params.error) : null;
  const usingTempPassword = await hasTempPassword(user.id);

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/captain"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-black text-slate-900">Pengaturan Akun</h1>
          <p className="text-sm text-slate-500">Kelola password login kamu.</p>
        </div>
      </div>

      {usingTempPassword && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <strong>Kamu masih menggunakan password sementara dari admin.</strong> Segera ganti ke password
          pribadi agar akunmu aman.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-slate-400" />
          <h2 className="font-semibold text-slate-900">Ganti Password</h2>
        </div>

        <form action={changePasswordAction} className="grid gap-4">
          <label className="grid gap-1.5 text-sm text-slate-600">
            Password saat ini
            <input
              type="password"
              name="currentPassword"
              required
              autoComplete="current-password"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </label>
          <label className="grid gap-1.5 text-sm text-slate-600">
            Password baru
            <input
              type="password"
              name="newPassword"
              required
              minLength={8}
              autoComplete="new-password"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <span className="text-xs text-slate-400">Minimal 8 karakter.</span>
          </label>
          <label className="grid gap-1.5 text-sm text-slate-600">
            Konfirmasi password baru
            <input
              type="password"
              name="confirmPassword"
              required
              autoComplete="new-password"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </label>
          <div className="pt-1">
            <button type="submit" className={`${buttonStyles.primary} text-sm`}>
              Ganti Password
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
