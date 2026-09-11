import { notFound } from "next/navigation";

import { updatePlatformProfileAction } from "@/lib/actions/platform-profile-actions";
import { requireAnyRole } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getPlatformProfile } from "@/lib/platform/repository";
import { redirectToActiveLocale } from "@/i18n/redirect";

export default async function PlatformProfilePage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ saved?: string }> }) {
  const [{ locale }, { saved }] = await Promise.all([params, searchParams]);
  if ((locale !== "id" && locale !== "en") || !isFeatureEnabled("organizer_workspace_v3")) notFound();
  const user = await requireAnyRole(["platform_admin", "admin"]);
  if (!user) return redirectToActiveLocale("/login");
  const profile = await getPlatformProfile();
  return <main className="mx-auto grid max-w-2xl gap-6"><header><p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-brand-cream)]">Platform identity</p><h1 className="mt-2 text-3xl font-extrabold text-[var(--color-text)]">Miracle public contact</h1><p className="mt-3 text-[var(--color-text-subtle)]">This identity appears on every platform-owned event published as by Miracle.</p></header>{saved === "1" ? <p className="rounded-[var(--radius-control)] border border-[var(--color-success)] px-4 py-3 text-sm" role="status">Miracle public contact saved.</p> : null}<form action={updatePlatformProfileAction} className="grid gap-4 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5"><input name="locale" type="hidden" value={locale} /><label className="grid gap-2 text-sm font-bold text-[var(--color-text)]">Public name<input className="min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3" defaultValue={profile?.displayName ?? "Miracle"} name="displayName" required /></label><div className="grid gap-4 min-[700px]:grid-cols-2"><label className="grid gap-2 text-sm font-bold text-[var(--color-text)]">Contact channel<input className="min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3" defaultValue={profile?.contactChannel ?? "WhatsApp"} name="contactChannel" required /></label><label className="grid gap-2 text-sm font-bold text-[var(--color-text)]">Contact details<input className="min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3" defaultValue={profile?.contactValue ?? ""} name="contactValue" required /></label></div><button className="min-h-11 justify-self-end bg-[var(--color-brand-violet)] px-5 font-extrabold text-white" type="submit">Save Miracle contact</button></form></main>;
}