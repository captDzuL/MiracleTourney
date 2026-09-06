import { updateEventOrganizerContactAction } from "@/lib/actions/event-v3-actions";

type OrganizerContactFormProps = {
  eventId: string;
  initialChannel?: string;
  initialValue?: string;
};

const inputClass = "min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[var(--color-text)]";
const labelClass = "grid gap-2 text-sm font-bold text-[var(--color-text)]";

export function OrganizerContactForm({ eventId, initialChannel = "", initialValue = "" }: OrganizerContactFormProps) {
  return <section className="grid scroll-mt-24 gap-4" id="section-organizer" tabIndex={-1}>
    <div>
      <h2 className="text-lg font-extrabold text-[var(--color-text)]">Organizer contact</h2>
      <p className="mt-1 text-sm text-[var(--color-text-subtle)]">Shown to participants who need event support.</p>
    </div>
    <form action={updateEventOrganizerContactAction} className="grid gap-3">
      <input name="eventId" type="hidden" value={eventId} />
      <label className={labelClass}>Contact channel<input className={inputClass} defaultValue={initialChannel} name="contactChannel" placeholder="WhatsApp" required /></label>
      <label className={labelClass}>Contact value<input className={inputClass} defaultValue={initialValue} name="contactValue" placeholder="+62 812 3456 7890" required /></label>
      <button className="min-h-11 justify-self-start bg-[var(--color-action)] px-4 text-sm font-extrabold text-[var(--color-action-text)]" type="submit">Save contact</button>
    </form>
  </section>;
}