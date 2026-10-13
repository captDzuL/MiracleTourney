import React from "react";
import { notFound } from "next/navigation";

import { SoloRegisterForm } from "@/components/solo/SoloRegisterForm";
import { SoloRegistrationPanel } from "@/components/solo/SoloRegistrationPanel";
import { SoloSlotMeter } from "@/components/solo/SoloSlotMeter";
import { soloCopy, successNotice, type Locale } from "@/components/solo/registration-copy";
import { soloPanelState } from "@/components/solo/registration-state";
import { Link } from "@/i18n/navigation";
import { registerSoloAction, uploadSoloProofAction, withdrawSoloAction } from "@/lib/actions/solo-registration-actions";
import { getAdaptivePublicEventView } from "@/lib/events/adaptive-public-event";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getGameModeConfig, getSoloDrawRules } from "@/lib/platform/config";
import { getPlayerWhatsapp } from "@/lib/player/profile-repository";
import type { AppUser, Event } from "@/lib/platform/types";
import { getCaptainPaymentSettings } from "@/lib/registration/captain-repository";
import { getSoloQueuePosition, getSoloRegistrationForUser } from "@/lib/solo/registration-repository";
import { sweepSoloEventAndAnnounce } from "@/lib/solo/registration-service";

type Search = { error?: string; success?: string };

const cardClass = "grid gap-4 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-7";
const linkButton = "inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] px-5 py-3 text-center font-extrabold transition motion-reduce:transition-none";

function Notice({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  const style = tone === "error" ? "border-rose-400/30 bg-rose-400/10 text-rose-200" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  return <p className={`rounded-xl border px-4 py-3 text-sm ${style}`} role={tone === "error" ? "alert" : "status"}>{children}</p>;
}

function SignIn({ copy, returnTo }: { copy: ReturnType<typeof soloCopy>; returnTo: string }) {
  const encoded = encodeURIComponent(returnTo);
  return <section className={cardClass}>
    <h2 className="text-xl font-extrabold">{copy.signInTitle}</h2>
    <p className="text-sm text-[var(--color-text-muted)]">{copy.signInBody}</p>
    <div className="grid gap-2 sm:grid-cols-2">
      <Link className={`${linkButton} bg-[var(--color-brand-violet)] text-white hover:brightness-110`} href={`/login?returnTo=${encoded}` as never}>{copy.signIn}</Link>
      <Link className={`${linkButton} border border-[var(--color-border-strong)] text-[var(--color-text)] hover:border-[var(--color-brand-cyan)]`} href={`/register?as=player&returnTo=${encoded}` as never}>{copy.createAccount}</Link>
    </div>
  </section>;
}

/**
 * The sign-up page of a solo event. It shows the slots to everyone, and then whatever the visitor's
 * account allows: sign in, switch to a player account, fill in the form, or follow their registration.
 */
export async function renderSoloRegistrationPage({ event, user, locale, search }: {
  event: Event;
  user: AppUser | null;
  locale: Locale;
  search?: Search;
}) {
  if (!isFeatureEnabled("solo_tournament_v1")) notFound();
  const rules = getSoloDrawRules(event.gameModeId);
  if (!rules) notFound();
  const requiredPosition = Object.keys(rules.requiredPositions)[0];
  const copy = soloCopy(locale);

  // Expire late slots first, so nobody is shown a slot that is already gone.
  await sweepSoloEventAndAnnounce(event.id);
  const view = await getAdaptivePublicEventView(event.slug, user);
  const registration = view?.mode === "registration" ? view.registration : null;
  const registerPath = `/events/${event.slug}/register`;

  let body: React.ReactNode;
  if (!view || !registration) {
    body = <Notice tone="error">{copy.closed}</Notice>;
  } else if (view.viewer.state === "anonymous") {
    body = <SignIn copy={copy} returnTo={registerPath} />;
  } else if (view.viewer.state === "wrong_role" || !user) {
    body = <section className={cardClass}>
      <h2 className="text-xl font-extrabold">{copy.wrongRoleTitle}</h2>
      <p className="text-sm text-[var(--color-text-muted)]">{copy.wrongRoleBody}</p>
    </section>;
  } else {
    const own = await getSoloRegistrationForUser(event.id, user.id);
    const position = own ? await getSoloQueuePosition(own) : null;
    const state = soloPanelState(own, position, new Date());
    const feeLabel = registration.feeRequired ? (registration.feeLabel || (registration.feeAmount != null ? `Rp${registration.feeAmount.toLocaleString("id-ID")}` : null)) : null;

    if (state.kind !== "form" && own) {
      const payment = state.kind === "pay" || state.kind === "rejected" ? await getCaptainPaymentSettings(event.id) : {};
      body = <SoloRegistrationPanel
        canWithdraw={event.status === "Published"}
        feeLabel={feeLabel}
        locale={locale}
        payment={payment ?? {}}
        registration={own}
        requiredPosition={requiredPosition}
        state={state}
        uploadAction={uploadSoloProofAction}
        withdrawAction={withdrawSoloAction}
      />;
    } else if (registration.availability === "upcoming") {
      body = <Notice tone="error">{copy.notOpen}</Notice>;
    } else if (registration.availability === "closed" || registration.availability === "legacy") {
      body = <Notice tone="error">{copy.closed}</Notice>;
    } else {
      body = <section className={cardClass}>
        <SoloRegisterForm
          action={registerSoloAction}
          defaults={{ whatsapp: await getPlayerWhatsapp(user.id) }}
          eventId={event.id}
          feeLabel={feeLabel}
          locale={locale}
          positions={getGameModeConfig(event.gameModeId).positions}
          requiredPosition={requiredPosition}
        />
      </section>;
    }
  }

  const success = successNotice(search?.success, locale);
  return <main className="miracle-v3 min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
    <div className="mx-auto grid w-[min(720px,calc(100%-32px))] gap-6 py-10">
      <div>
        <Link className="text-sm font-bold text-[var(--color-brand-cyan)]" href={`/events/${event.slug}` as never}>{copy.back}</Link>
        <h1 className="mt-3 text-3xl font-extrabold leading-tight sm:text-4xl">{event.name}</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">{copy.title}</p>
      </div>
      {search?.error ? <Notice tone="error">{search.error}</Notice> : null}
      {success ? <Notice tone="success">{success}</Notice> : null}
      <section className={cardClass}>
        <SoloSlotMeter locale={locale} requiredPosition={requiredPosition} slots={registration?.solo?.slots ?? null} />
      </section>
      {body}
    </div>
  </main>;
}
