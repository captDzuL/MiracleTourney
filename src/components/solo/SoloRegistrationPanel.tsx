import React from "react";
import Image from "next/image";

import { positionLabel } from "@/lib/solo/labels";
import type { SoloRegistrationView } from "@/lib/solo/registration-types";

import { formatDeadline, soloCopy, type Locale } from "./registration-copy";
import type { SoloPanelState } from "./registration-state";

type Props = {
  locale: Locale;
  registration: SoloRegistrationView;
  state: Exclude<SoloPanelState, { kind: "form" }>;
  requiredPosition: string;
  feeLabel: string | null;
  payment: { qrisImageUrl?: string; instructions?: string };
  uploadAction: (formData: FormData) => Promise<never>;
  withdrawAction: (formData: FormData) => Promise<never>;
  /** False once registration is closed, when only the organizer can remove a player. */
  canWithdraw: boolean;
};

const cardClass = "grid gap-4 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-7";
const buttonClass = "min-h-11 rounded-[var(--radius-control)] bg-[var(--color-brand-violet)] px-5 py-3 font-extrabold text-white transition hover:brightness-110 motion-reduce:transition-none";

function UploadForm({ action, copy, locale, registrationId }: { action: Props["uploadAction"]; copy: ReturnType<typeof soloCopy>; locale: Locale; registrationId: string }) {
  return <form action={action} className="grid gap-3" data-solo-proof>
    <input name="registrationId" type="hidden" value={registrationId} />
    <input name="locale" type="hidden" value={locale} />
    <div className="grid gap-1 text-sm font-bold">
      <label htmlFor="solo-proof">{copy.proofLabel}</label>
      <input
        accept="image/png,image/jpeg,image/webp"
        aria-describedby="solo-proof-hint"
        className="min-h-11 w-full min-w-0 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 font-normal"
        id="solo-proof"
        name="paymentProof"
        required
        type="file"
      />
      <p className="text-xs font-normal text-[var(--color-text-muted)]" id="solo-proof-hint">{copy.proofHint}</p>
    </div>
    <button className={buttonClass} type="submit">{copy.sendProof}</button>
  </form>;
}

function PaymentDetails({ copy, feeLabel, payment }: { copy: ReturnType<typeof soloCopy>; feeLabel: string | null; payment: Props["payment"] }) {
  return <div className="grid gap-4">
    {feeLabel ? <p className="text-lg font-extrabold text-[var(--color-brand-cream)]">{copy.fee(feeLabel)}</p> : null}
    <p className="text-sm text-[var(--color-text-muted)]">{copy.scanQris}</p>
    {payment.qrisImageUrl ? <div className="relative mx-auto aspect-square w-full max-w-xs overflow-hidden rounded-[var(--radius-control)] bg-white">
      <Image alt={copy.qrisAlt} className="object-contain" fill loading="eager" sizes="(max-width: 384px) 100vw, 320px" src={payment.qrisImageUrl} unoptimized />
    </div> : <p className="text-sm font-semibold text-[var(--color-brand-cream)]" role="note">{copy.noQris}</p>}
    {payment.instructions ? <div className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 text-sm text-[var(--color-text-muted)]">
      <b className="block text-[var(--color-brand-cyan)]">{copy.organizerNote}</b>{payment.instructions}
    </div> : null}
  </div>;
}

/** What a player sees after signing up: where they stand, what to do next, and how to leave. */
export function SoloRegistrationPanel({ locale, registration, state, requiredPosition, feeLabel, payment, uploadAction, withdrawAction, canWithdraw }: Props) {
  const copy = soloCopy(locale);
  const required = positionLabel(requiredPosition, locale);
  const group = registration.slotGroup === "required" ? required : locale === "id" ? "Pemain lapangan" : "Field players";
  const details = copy.yourDetails(registration.ign, registration.uid, positionLabel(registration.primaryPosition, locale));

  return <section className={cardClass} data-solo-panel={state.kind}>
    <p className="text-sm font-semibold text-[var(--color-text-muted)]">{details}</p>

    {state.kind === "queued" ? <>
      <h2 className="text-xl font-extrabold">{copy.queuedTitle}</h2>
      <p className="text-sm">{state.position ? copy.queuedBody(String(state.position), group) : copy.queuedBodyUnknown}</p>
    </> : null}

    {state.kind === "pay" ? <>
      <h2 className="text-xl font-extrabold">{copy.payTitle}</h2>
      <p className="text-sm">{copy.payBody(formatDeadline(state.deadline, locale))}</p>
      <PaymentDetails copy={copy} feeLabel={feeLabel} payment={payment} />
      <UploadForm action={uploadAction} copy={copy} locale={locale} registrationId={registration.id} />
    </> : null}

    {state.kind === "review" ? <>
      <h2 className="text-xl font-extrabold">{copy.reviewTitle}</h2>
      <p className="text-sm">{copy.reviewBody}</p>
    </> : null}

    {state.kind === "rejected" ? <>
      <h2 className="text-xl font-extrabold">{copy.rejectedTitle}</h2>
      <p className="text-sm" role="alert">{copy.rejectedBody(state.reason ?? "—", formatDeadline(state.deadline, locale))}</p>
      <PaymentDetails copy={copy} feeLabel={feeLabel} payment={payment} />
      <UploadForm action={uploadAction} copy={copy} locale={locale} registrationId={registration.id} />
    </> : null}

    {state.kind === "approved" ? <>
      <h2 className="text-xl font-extrabold">{copy.approvedTitle}</h2>
      <p className="text-sm">{copy.approvedBody}</p>
    </> : null}

    {canWithdraw ? <form action={withdrawAction} className="grid gap-2 border-t border-[var(--color-border)] pt-4" data-solo-withdraw>
      <input name="registrationId" type="hidden" value={registration.id} />
      <input name="locale" type="hidden" value={locale} />
      <p className="text-xs text-[var(--color-text-muted)]">{copy.withdrawHint}</p>
      <button className="min-h-11 w-fit rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-4 text-sm font-bold text-[var(--color-text)] hover:border-[var(--color-brand-cream)]" type="submit">{copy.withdraw}</button>
    </form> : null}
  </section>;
}
