import React from "react";

import { positionLabel } from "@/lib/solo/labels";

import { soloCopy, type Locale } from "./registration-copy";

type Props = {
  action: (formData: FormData) => Promise<never>;
  eventId: string;
  locale: Locale;
  positions: readonly string[];
  requiredPosition: string;
  /** The fee as the organizer wrote it, or null for a free event. */
  feeLabel: string | null;
  defaults?: { whatsapp?: string };
};

const fieldClass = "mt-1 h-11 w-full min-w-0 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[var(--color-text)]";
const labelClass = "grid gap-1 text-sm font-bold text-[var(--color-text)]";
const checkClass = "flex min-h-11 items-center gap-3 text-sm font-semibold text-[var(--color-text)]";

/** The solo sign-up form. The server action reads the signed-in player from the session, never from the form. */
export function SoloRegisterForm({ action, eventId, locale, positions, requiredPosition, feeLabel, defaults }: Props) {
  const copy = soloCopy(locale);
  const required = positionLabel(requiredPosition, locale);
  return <form action={action} className="grid gap-4" data-solo-register>
    <input name="eventId" type="hidden" value={eventId} />
    <input name="locale" type="hidden" value={locale} />
    <div>
      <h2 className="text-xl font-extrabold">{copy.title}</h2>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">{copy.formIntro}</p>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className={labelClass}>
        <label htmlFor="solo-ign">{copy.ign}</label>
        <input autoComplete="off" className={fieldClass} id="solo-ign" maxLength={40} minLength={2} name="ign" required type="text" />
      </div>
      <div className={labelClass}>
        <label htmlFor="solo-uid">{copy.uid}</label>
        <input autoComplete="off" className={fieldClass} id="solo-uid" maxLength={40} minLength={2} name="uid" required type="text" />
      </div>
      <div className={labelClass}>
        <label htmlFor="solo-primary">{copy.primaryPosition}</label>
        <select className={fieldClass} defaultValue="" id="solo-primary" name="primaryPosition" required>
          <option value="">{copy.pickPosition}</option>
          {positions.map((position) => <option key={position} value={position}>{positionLabel(position, locale)}</option>)}
        </select>
      </div>
      <div className={labelClass}>
        <label htmlFor="solo-secondary">{copy.secondaryPosition}</label>
        <select aria-describedby="solo-secondary-hint" className={fieldClass} defaultValue="" id="solo-secondary" name="secondaryPosition">
          <option value="">{copy.noSecondary}</option>
          {positions.map((position) => <option key={position} value={position}>{positionLabel(position, locale)}</option>)}
        </select>
        <p className="text-xs font-normal text-[var(--color-text-muted)]" id="solo-secondary-hint">{copy.emergencyHint(required)}</p>
      </div>
    </div>
    <div className={labelClass}>
      <label htmlFor="solo-whatsapp">{copy.whatsapp}</label>
      <input
        aria-describedby="solo-whatsapp-hint"
        autoComplete="tel"
        className={fieldClass}
        defaultValue={defaults?.whatsapp}
        id="solo-whatsapp"
        inputMode="tel"
        name="whatsapp"
        required
        type="tel"
      />
      <p className="text-xs font-normal text-[var(--color-text-muted)]" id="solo-whatsapp-hint">{copy.whatsappHint}</p>
    </div>
    <label className={checkClass} htmlFor="solo-captain"><input id="solo-captain" name="willingCaptain" type="checkbox" />{copy.willingCaptain}</label>
    <label className={checkClass} htmlFor="solo-share"><input id="solo-share" name="shareContact" required type="checkbox" />{copy.shareContact}</label>
    <p className="text-sm font-semibold text-[var(--color-brand-cream)]">{feeLabel ? copy.feeNote(feeLabel) : copy.freeNote}</p>
    <button className="min-h-11 rounded-[var(--radius-control)] bg-[var(--color-brand-violet)] px-5 py-3 font-extrabold text-white transition hover:brightness-110 motion-reduce:transition-none" type="submit">{copy.submit}</button>
  </form>;
}
