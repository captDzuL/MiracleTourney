"use client";

import React, { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

import {
  captainEventLoginAction,
  type CaptainEventLoginState,
} from "@/lib/actions/captain-event-login";

const initialState: CaptainEventLoginState = { status: "idle" };

const COPY = {
  id: {
    kicker: "Masuk sebagai Captain",
    title: "Lanjutkan pendaftaranmu",
    description: "Masuk agar draft tim, pembayaran, dan status pendaftaran tetap tersimpan.",
    contextTitle: "Kamu akan kembali ke event ini",
    contextStep: "Langkah pilih tim",
    email: "Email",
    password: "Kata sandi",
    submit: "Masuk dan lanjutkan",
    signupLead: "Belum punya akun?",
    signup: "Daftar sebagai captain",
    close: "Tutup",
    invalid: "Email atau kata sandi tidak cocok.",
    wrong_role: "Akun ini bukan akun Captain. Gunakan akun Captain untuk mendaftarkan tim.",
    database: "Koneksi sedang bermasalah. Coba lagi sebentar.",
    rate_limited: "Terlalu banyak percobaan. Coba lagi dalam satu menit.",
  },
  en: {
    kicker: "Sign in as Captain",
    title: "Continue your registration",
    description: "Sign in so your team draft, payment, and registration status remain saved.",
    contextTitle: "You will return to this event",
    contextStep: "Choose team step",
    email: "Email",
    password: "Password",
    submit: "Sign in and continue",
    signupLead: "No account yet?",
    signup: "Register as captain",
    close: "Close",
    invalid: "The email or password does not match.",
    wrong_role: "This is not a Captain account. Use a Captain account to register a team.",
    database: "The connection is unavailable. Try again shortly.",
    rate_limited: "Too many attempts. Try again in one minute.",
  },
} as const;

export function CaptainLoginDialog({ locale, eventId, eventName, triggerLabel }: {
  locale: "id" | "en";
  eventId: string;
  eventName: string;
  triggerLabel: string;
}) {
  const copy = COPY[locale];
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(captainEventLoginAction, initialState);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  function close() {
    setOpen(false);
    queueMicrotask(() => triggerRef.current?.focus());
  }

  useEffect(() => {
    if (!open) return;
    emailRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled])',
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return <>
    <div className="sticky bottom-4 z-20 rounded-[var(--radius-panel)] border border-[var(--color-brand-violet)] bg-[var(--color-surface)] p-3 shadow-2xl lg:static lg:shadow-none">
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)} className="min-h-11 w-full rounded-[var(--radius-control)] bg-[var(--color-brand-violet)] px-5 py-3 font-extrabold text-white transition hover:brightness-110 motion-reduce:transition-none">
        {triggerLabel}
      </button>
    </div>

    {open ? <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/75 p-4" onMouseDown={(event) => { if (event.currentTarget === event.target) close(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="captain-login-title" className="my-auto w-full max-w-lg rounded-[var(--radius-panel)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-6 shadow-2xl sm:p-8">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--color-brand-violet)]">{copy.kicker}</p>
            <h2 id="captain-login-title" className="mt-3 text-2xl font-extrabold">{copy.title}</h2>
          </div>
          <button type="button" onClick={close} aria-label={copy.close} className="grid min-h-11 min-w-11 place-items-center rounded-[var(--radius-control)] border border-[var(--color-border)]"><X className="h-5 w-5" aria-hidden /></button>
        </div>
        <p className="mt-4 text-sm leading-6 text-[var(--color-text-muted)]">{copy.description}</p>
        <div className="mt-5 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4">
          <p className="font-extrabold">{copy.contextTitle}</p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">{eventName} · {copy.contextStep}</p>
        </div>
        <form action={formAction} className="mt-5 grid gap-4">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="eventId" value={eventId} />
          <label className="grid gap-2 text-sm font-bold">{copy.email}<input ref={emailRef} name="email" type="email" autoComplete="email" required className="min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 outline-none focus:border-[var(--color-brand-cyan)]" /></label>
          <label className="grid gap-2 text-sm font-bold">{copy.password}<input name="password" type="password" autoComplete="current-password" required className="min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 outline-none focus:border-[var(--color-brand-cyan)]" /></label>
          {state.status === "error" ? <p role="alert" className="rounded-[var(--radius-control)] border border-red-400/50 bg-red-950/40 p-3 text-sm text-red-200">{copy[state.code]}</p> : null}
          <button type="submit" disabled={pending} className="min-h-11 rounded-[var(--radius-control)] bg-[var(--color-brand-violet)] px-5 py-3 font-extrabold text-white disabled:opacity-60">{copy.submit}</button>
        </form>
        <p className="mt-5 text-center text-sm text-[var(--color-text-muted)]">{copy.signupLead} <Link href={`/${locale}/register?eventId=${encodeURIComponent(eventId)}`} className="font-bold text-[var(--color-brand-cyan)] underline-offset-4 hover:underline">{copy.signup}</Link></p>
      </div>
    </div> : null}
  </>;
}