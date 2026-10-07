import { notFound } from "next/navigation";

import { completeOrganizerPasswordChangeAction } from "@/lib/actions/organizer-profile-actions";
import { requireAnyRole } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { redirectToActiveLocale } from "@/i18n/redirect";

export default async function OrganizerChangePasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if ((locale !== "id" && locale !== "en") || !isFeatureEnabled("organizer_workspace_v3")) notFound();
  const user = await requireAnyRole(["organizer"]);
  if (!user) return redirectToActiveLocale("/login");
  if (!user.mustChangePassword) return redirectToActiveLocale("/organizer");

  return <main className="mx-auto grid min-h-[60vh] max-w-lg content-center gap-6">
    <header><p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-brand-cream)]">Secure your organizer account</p><h1 className="mt-2 text-3xl font-extrabold text-[var(--color-text)]">Choose your password</h1><p className="mt-3 text-[var(--color-text-subtle)]">Your administrator created a temporary password. Replace it before accessing the Organizer Command Center.</p></header>
    <form action={completeOrganizerPasswordChangeAction} className="grid gap-4 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <input name="locale" type="hidden" value={locale} />
      <label className="grid gap-2 text-sm font-bold text-[var(--color-text)]">Temporary password<input className="min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3" name="currentPassword" required type="password" /></label>
      <label className="grid gap-2 text-sm font-bold text-[var(--color-text)]">New password<input className="min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3" minLength={8} name="newPassword" required type="password" /></label>
      <label className="grid gap-2 text-sm font-bold text-[var(--color-text)]">Confirm new password<input className="min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3" minLength={8} name="confirmPassword" required type="password" /></label>
      <button className="min-h-11 bg-[var(--color-brand-violet)] px-5 font-extrabold text-white" type="submit">Save password and continue</button>
    </form>
  </main>;
}