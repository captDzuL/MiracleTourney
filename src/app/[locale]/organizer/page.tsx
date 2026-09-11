import { notFound } from "next/navigation";

import { Link } from "@/i18n/navigation";
import { redirectToActiveLocale } from "@/i18n/redirect";
import { requireAnyRole } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getActiveEventEditRevisionIds } from "@/lib/events/event-revision";
import { getManageableEventsForUser, getOrganizerProfileForUser, getTeamCountsForEvents } from "@/lib/platform/repository";
import type { Event } from "@/lib/platform/types";

const statusTone: Record<Event["status"], string> = {
  Draft: "border-[var(--color-brand-cream)] text-[var(--color-brand-cream)]",
  Published: "border-[var(--color-brand-cyan)] text-[var(--color-brand-cyan)]",
  "Registration Closed": "border-[var(--color-brand-violet)] text-[var(--color-brand-violet)]",
  Ongoing: "border-[var(--color-brand-cyan)] text-[var(--color-brand-cyan)]",
  Finished: "border-[var(--color-text-subtle)] text-[var(--color-text-subtle)]",
};

function EventStatusPill({ status }: { status: Event["status"] }) {
  return <span className={`w-fit rounded-full border px-2.5 py-1 text-xs font-extrabold ${statusTone[status]}`}>{status}</span>;
}

function EventCard({ event, teamCount, hasActiveRevision }: { event: Event; teamCount: number; hasActiveRevision: boolean }) {
  const workspaceHref = `/organizer/events/${event.id}/overview`;
  const editHref = `/organizer/events/${event.id}/edit`;
  const isDraft = event.status === "Draft";
  const isEditablePublished = event.status === "Published" || event.status === "Registration Closed";
  const actionHref = isDraft ? workspaceHref : isEditablePublished ? editHref : workspaceHref;
  const actionLabel = isDraft ? "Lanjutkan setup" : isEditablePublished ? (hasActiveRevision ? "Lanjutkan revisi" : "Edit event") : "Buka workspace";
  return <article className="grid gap-4 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-subtle)]">{event.gameId} � {event.format}</p><h3 className="mt-1 text-lg font-extrabold text-[var(--color-text)]">{event.name}</h3></div>
      <EventStatusPill status={event.status} />
    </div>
    <div className="grid grid-cols-2 gap-3 text-sm"><p className="rounded-[var(--radius-control)] bg-[var(--color-surface-subtle)] px-3 py-2 text-[var(--color-text-subtle)]"><b className="text-[var(--color-text)]">{teamCount}/{event.participantCap}</b> tim</p><p className="rounded-[var(--radius-control)] bg-[var(--color-surface-subtle)] px-3 py-2 text-[var(--color-text-subtle)]">{isDraft ? "Privat sampai diterbitkan" : hasActiveRevision ? "Revisi privat aktif" : "Terlihat publik"}</p></div>
    <div className="flex flex-wrap gap-3"><Link className="inline-flex min-h-11 items-center border border-[var(--color-border)] px-4 text-sm font-extrabold text-[var(--color-text)]" href={actionHref}>{actionLabel}</Link>{!isDraft && <Link className="inline-flex min-h-11 items-center px-2 text-sm font-bold text-[var(--color-brand-cyan)]" href={`/events/${event.slug}`}>Lihat halaman publik</Link>}</div>
  </article>;
}

type OrganizerCommandCenterPageProps = { params: Promise<{ locale: string }> };

export default async function OrganizerCommandCenterPage({ params }: OrganizerCommandCenterPageProps) {
  const { locale } = await params;
  if ((locale !== "id" && locale !== "en") || !isFeatureEnabled("organizer_workspace_v3")) notFound();

  const user = await requireAnyRole(["organizer"]);
  if (!user) return redirectToActiveLocale("/login");
  if (user.role === "organizer" && user.mustChangePassword) return redirectToActiveLocale("/organizer/change-password");

  const [events, profile] = await Promise.all([getManageableEventsForUser(user), getOrganizerProfileForUser(user)]);
  const teamCounts = await getTeamCountsForEvents(events.map(event => event.id));
  const activeRevisions = await getActiveEventEditRevisionIds({ eventIds: events.map((event) => event.id), actor: { id: user.id, role: "organizer" } });
  const drafts = events.filter(event => event.status === "Draft");
  const published = events.filter(event => event.status !== "Draft");
  const criticalEvents = drafts.slice(0, 3);

  return <div className="mx-auto grid w-full max-w-6xl gap-7">
    <header className="grid gap-5 border-b border-[var(--color-border)] pb-7 min-[700px]:grid-cols-[minmax(0,1fr)_auto] min-[700px]:items-end">
      <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-brand-cream)]">Organizer workspace</p><h1 className="mt-2 text-3xl font-extrabold text-[var(--color-text)]">Organizer Command Center</h1><p className="mt-3 max-w-2xl text-[var(--color-text-subtle)]">Create an event, finish the details that block publication, and return to every tournament from one place.</p></div>
      <Link className="inline-flex min-h-11 items-center justify-center bg-[var(--color-brand-violet)] px-5 font-extrabold text-white" href="/organizer/events/new">Create event</Link>
    </header>

    <section aria-label="Event overview" className="grid gap-3 min-[620px]:grid-cols-3">
      <div className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"><p className="text-sm text-[var(--color-text-subtle)]">All events</p><p className="mt-1 text-3xl font-extrabold text-[var(--color-text)]">{events.length}</p></div>
      <div className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"><p className="text-sm text-[var(--color-text-subtle)]">Drafts to finish</p><p className="mt-1 text-3xl font-extrabold text-[var(--color-brand-cream)]">{drafts.length}</p></div>
      <div className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"><p className="text-sm text-[var(--color-text-subtle)]">Published or running</p><p className="mt-1 text-3xl font-extrabold text-[var(--color-brand-cyan)]">{published.length}</p></div>
    </section>

    <section className="grid gap-4 min-[980px]:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="grid gap-4">
        <div className="flex items-center justify-between gap-4"><div><h2 className="text-xl font-extrabold text-[var(--color-text)]">Needs your attention</h2><p className="mt-1 text-sm text-[var(--color-text-subtle)]">Drafts stay private until their event details and organizer contact are ready.</p></div></div>
        {criticalEvents.length ? <div className="grid gap-3">{criticalEvents.map(event => <EventCard key={event.id} event={event} hasActiveRevision={Boolean(activeRevisions[event.id])} teamCount={teamCounts.get(event.id) ?? 0} />)}</div> : <div className="rounded-[var(--radius-panel)] border border-dashed border-[var(--color-border)] p-5 text-sm text-[var(--color-text-subtle)]">No unfinished drafts. Create a new event when you are ready.</div>}
      </div>
      <aside className="grid content-start gap-4 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-5">
        <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-brand-cream)]">Organizer profile</p><h2 className="mt-2 text-lg font-extrabold text-[var(--color-text)]">{profile?.organizationName ?? user.name}</h2><p className="mt-2 text-sm text-[var(--color-text-subtle)]">{profile ? `${profile.contactChannel}: ${profile.contactValue}` : "Add a public contact before you publish your first event."}</p></div>
        <Link className="inline-flex min-h-11 items-center justify-center border border-[var(--color-border)] px-4 text-sm font-extrabold text-[var(--color-text)]" href="/organizer/profile">{profile ? "Edit organizer profile" : "Set up organizer profile"}</Link>
      </aside>
    </section>

    <section className="grid gap-4"><div><h2 className="text-xl font-extrabold text-[var(--color-text)]">All events</h2><p className="mt-1 text-sm text-[var(--color-text-subtle)]">Every event opens its existing V3 workspace.</p></div>{events.length ? <div className="grid gap-3 min-[700px]:grid-cols-2">{events.map(event => <EventCard key={event.id} event={event} hasActiveRevision={Boolean(activeRevisions[event.id])} teamCount={teamCounts.get(event.id) ?? 0} />)}</div> : <div className="rounded-[var(--radius-panel)] border border-dashed border-[var(--color-border)] p-6 text-[var(--color-text-subtle)]">Your event list is empty. Start with a private draft to see how it will appear before publishing.</div>}</section>
  </div>;
}