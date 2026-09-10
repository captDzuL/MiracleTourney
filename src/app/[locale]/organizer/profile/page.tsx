import { notFound } from "next/navigation";

import { updateOrganizerProfileAction } from "@/lib/actions/organizer-profile-actions";
import { requireAnyRole } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getOrganizerProfileForUser } from "@/lib/platform/repository";
import { redirectToActiveLocale } from "@/i18n/redirect";

const inputClass = "min-h-11 w-full min-w-0 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[var(--color-text)]";
const labelClass = "grid gap-2 text-sm font-bold text-[var(--color-text)]";

type OrganizerProfilePageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ saved?: string }>;
};

export default async function OrganizerProfilePage({ params, searchParams }: OrganizerProfilePageProps) {
  const [{ locale }, { saved }] = await Promise.all([params, searchParams]);
  if ((locale !== "id" && locale !== "en") || !isFeatureEnabled("organizer_workspace_v3")) notFound();

  const user = await requireAnyRole(["organizer"]);
  if (!user) return redirectToActiveLocale("/login");
  if (user.role === "organizer" && user.mustChangePassword) return redirectToActiveLocale("/organizer/change-password");
  const profile = await getOrganizerProfileForUser(user);

  return <div className="mx-auto grid w-full max-w-2xl gap-6">
    <header>
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-brand-cream)]">Organizer identity</p>
      <h1 className="mt-2 text-3xl font-extrabold text-[var(--color-text)]">Organizer profile</h1>
      <p className="mt-3 text-[var(--color-text-subtle)]">This name and contact make every event you publish easier to trust.</p>
    </header>
    {saved === "1" ? <p className="rounded-[var(--radius-control)] border border-[var(--color-success)] bg-[var(--color-surface-subtle)] px-4 py-3 text-sm font-semibold text-[var(--color-text)]" role="status">Organizer profile saved.</p> : null}
    <form action={updateOrganizerProfileAction} className="grid gap-5 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 min-[700px]:p-7">
      <input name="locale" type="hidden" value={locale} />
      <label className={labelClass}>Organization name<input className={inputClass} defaultValue={profile?.organizationName ?? user.name} name="organizationName" required /></label>
      <div className="grid gap-4 min-[700px]:grid-cols-2">
        <label className={labelClass}>Contact channel<input className={inputClass} defaultValue={profile?.contactChannel ?? "WhatsApp"} name="contactChannel" placeholder="WhatsApp" required /></label>
        <label className={labelClass}>Contact details<input className={inputClass} defaultValue={profile?.contactValue ?? ""} name="contactValue" placeholder="+62 812 3456 7890" required /></label>
      </div>
      <div className="flex justify-end border-t border-[var(--color-border)] pt-5"><button className="min-h-11 bg-[var(--color-brand-violet)] px-5 font-extrabold text-white" type="submit">Save organizer profile</button></div>
    </form>
  </div>;
}