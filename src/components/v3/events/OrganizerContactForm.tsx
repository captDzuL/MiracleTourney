import { getEventEditorTranslator } from "./event-editor-translations";
import { updateEventOrganizerContactAction } from "@/lib/actions/event-v3-actions";

type OrganizerContactFormProps = { locale?: "id" | "en"; eventId: string; initialChannel?: string; initialValue?: string };
const inputClass = "h-11 min-h-11 w-full min-w-0 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-0 leading-5 text-[var(--color-text)]";
const labelClass = "grid gap-1.5 text-sm font-bold leading-5 text-[var(--color-text)]";

export function OrganizerContactForm({ locale = "id", eventId, initialChannel = "", initialValue = "" }: OrganizerContactFormProps) {
  const t = getEventEditorTranslator(locale);
  return <section className="grid gap-3 border-t border-[var(--color-border)] pt-5" aria-labelledby="organizer-contact-heading">
    <div><h2 className="text-base font-extrabold text-[var(--color-text)]" id="organizer-contact-heading">{t("contactTitle")}</h2><p className="mt-1 text-sm text-[var(--color-text-subtle)]">{t("contactHint")}</p></div>
    <form action={updateEventOrganizerContactAction} className="grid gap-3 min-[700px]:grid-cols-[10rem_minmax(0,1fr)_auto] min-[700px]:items-end">
      <input name="eventId" type="hidden" value={eventId} />
      <label className={labelClass}>{t("contactChannel")}<select className={inputClass} defaultValue={initialChannel || "WhatsApp"} name="contactChannel"><option>WhatsApp</option><option>Email</option><option>Discord</option><option value="Kontak lain">{t("contactOther")}</option></select></label>
      <label className={labelClass}>{t("contactPublic")}<input className={inputClass} defaultValue={initialValue} name="contactValue" placeholder={t("contactExample")} required /></label>
      <button className="min-h-11 rounded-[var(--radius-control)] bg-[var(--color-action)] px-4 text-sm font-extrabold text-[var(--color-action-text)]" type="submit">{t("contactSave")}</button>
    </form>
  </section>;
}
