"use client";

import Link from "next/link";

import type { AdaptiveRegistrationEventViewModel } from "@/lib/events/adaptive-public-event";
import { CaptainLoginDialog } from "./CaptainLoginDialog";

const LABELS = {
  id: {
    register_team: "Daftarkan tim",
    create_team_and_register: "Buat tim dan daftar",
    select_team_to_register: "Pilih tim untuk didaftarkan",
    continue_registration: "Lanjutkan pendaftaran",
    continue_payment: "Lanjutkan pembayaran",
    view_registration_status: "Lihat status pendaftaran",
    repair_payment_proof: "Perbaiki bukti pembayaran",
    view_registered_team: "Lihat tim terdaftar",
    register_again: "Daftar ulang",
    use_captain_account: "Gunakan akun Captain",
    register_solo: "Daftar solo",
    view_queue_position: "Lihat posisi antrean",
    use_player_account: "Gunakan akun Pemain",
    registration_upcoming: "Pendaftaran belum dibuka",
    registration_closed: "Pendaftaran ditutup",
    registration_full: "Slot pendaftaran penuh",
    registration_unavailable: "Pendaftaran belum tersedia",
    wrongRole: "Keluar dari akun ini lalu masuk menggunakan akun Captain.",
    wrongRoleSolo: "Keluar dari akun ini lalu masuk menggunakan akun Pemain.",
    soloLogin: "Masuk untuk daftar solo",
    soloCreate: "Buat akun pemain",
  },
  en: {
    register_team: "Register a team",
    create_team_and_register: "Create a team and register",
    select_team_to_register: "Choose a team to register",
    continue_registration: "Continue registration",
    continue_payment: "Continue payment",
    view_registration_status: "View registration status",
    repair_payment_proof: "Fix payment proof",
    view_registered_team: "View registered team",
    register_again: "Register again",
    use_captain_account: "Use a Captain account",
    register_solo: "Join solo",
    view_queue_position: "See your place in the queue",
    use_player_account: "Use a Player account",
    registration_upcoming: "Registration has not opened",
    registration_closed: "Registration is closed",
    registration_full: "Registration slots are full",
    registration_unavailable: "Registration is unavailable",
    wrongRole: "Sign out, then sign in with a Captain account.",
    wrongRoleSolo: "Sign out, then sign in with a Player account.",
    soloLogin: "Sign in to join solo",
    soloCreate: "Create a player account",
  },
} as const;

export function RegistrationEntryCta({ view, locale }: {
  view: AdaptiveRegistrationEventViewModel;
  locale: "id" | "en";
}) {
  const cta = view.viewer.cta;
  const labels = LABELS[locale];
  const label = labels[cta.label as keyof typeof labels] ?? cta.label;

  const solo = view.registration.mode === "solo";
  if (cta.kind === "login" && solo) {
    const returnTo = encodeURIComponent(`/events/${view.event.slug}/register`);
    return <div className="sticky bottom-4 z-20 grid gap-2 rounded-[var(--radius-panel)] border border-[var(--color-brand-violet)] bg-[var(--color-surface)] p-3 shadow-2xl sm:grid-cols-2 lg:static lg:shadow-none">
      <Link href={`/${locale}/login?returnTo=${returnTo}`} className="flex min-h-11 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-brand-violet)] px-5 py-3 text-center font-extrabold text-white transition hover:brightness-110 motion-reduce:transition-none">{labels.soloLogin}</Link>
      <Link href={`/${locale}/register?as=player&returnTo=${returnTo}`} className="flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-5 py-3 text-center font-extrabold text-[var(--color-text)] transition hover:border-[var(--color-brand-cyan)] motion-reduce:transition-none">{labels.soloCreate}</Link>
    </div>;
  }
  if (cta.kind === "login") {
    return <CaptainLoginDialog locale={locale} eventId={view.event.id} eventName={view.event.name} triggerLabel={label} />;
  }
  if (cta.kind === "disabled") {
    return <div className="sticky bottom-4 z-20 rounded-[var(--radius-panel)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-4 shadow-2xl lg:static lg:shadow-none">
      <button disabled className="min-h-11 w-full cursor-not-allowed rounded-[var(--radius-control)] border border-[var(--color-border)] px-5 py-3 font-extrabold text-[var(--color-text-muted)]">{label}</button>
      {view.viewer.state === "wrong_role" ? <p className="mt-2 text-center text-sm text-[var(--color-text-muted)]">{solo ? labels.wrongRoleSolo : labels.wrongRole}</p> : null}
    </div>;
  }

  const href = `/${locale}${cta.href}`;
  return <div className="sticky bottom-4 z-20 rounded-[var(--radius-panel)] border border-[var(--color-brand-violet)] bg-[var(--color-surface)] p-3 shadow-2xl lg:static lg:shadow-none">
    <Link href={href} className="flex min-h-11 w-full items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-brand-violet)] px-5 py-3 text-center font-extrabold text-white transition hover:brightness-110 motion-reduce:transition-none">{label}</Link>
  </div>;
}
