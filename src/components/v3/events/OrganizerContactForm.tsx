import { updateEventOrganizerContactAction } from "@/lib/actions/event-v3-actions";

type OrganizerContactFormProps = { eventId: string; initialChannel?: string; initialValue?: string };
const inputClass = "h-11 min-h-11 w-full min-w-0 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-0 leading-5 text-[var(--color-text)]";
const labelClass = "grid gap-1.5 text-sm font-bold leading-5 text-[var(--color-text)]";

export function OrganizerContactForm({ eventId, initialChannel = "", initialValue = "" }: OrganizerContactFormProps) {
  return <section className="grid gap-3 border-t border-[var(--color-border)] pt-5" aria-labelledby="organizer-contact-heading">
    <div><h2 className="text-base font-extrabold text-[var(--color-text)]" id="organizer-contact-heading">Kontak organizer</h2><p className="mt-1 text-sm text-[var(--color-text-subtle)]">Cantumkan WhatsApp atau email yang boleh dilihat calon peserta.</p></div>
    <form action={updateEventOrganizerContactAction} className="grid gap-3 min-[700px]:grid-cols-[10rem_minmax(0,1fr)_auto] min-[700px]:items-end">
      <input name="eventId" type="hidden" value={eventId} />
      <label className={labelClass}>Jenis kontak<select className={inputClass} defaultValue={initialChannel || "WhatsApp"} name="contactChannel"><option>WhatsApp</option><option>Email</option><option>Discord</option><option>Kontak lain</option></select></label>
      <label className={labelClass}>Kontak publik<input className={inputClass} defaultValue={initialValue} name="contactValue" placeholder="Contoh: panitia@organisasi.id" required /></label>
      <button className="min-h-11 rounded-[var(--radius-control)] bg-[var(--color-action)] px-4 text-sm font-extrabold text-[var(--color-action-text)]" type="submit">Simpan kontak</button>
    </form>
  </section>;
}