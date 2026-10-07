import React from "react";
import { ShieldCheck, Trophy } from "lucide-react";

import { EventPosterStage } from "@/components/v3/public-discovery/EventPosterStage";
import { PublicV3Action, PublicV3Eyebrow, PublicV3FactStrip, PublicV3StatusBadge } from "@/components/v3/public-discovery/PublicV3Primitives";
import { publicV3LocalizedHref, type PublicV3EventViewModel, type PublicV3Locale } from "@/lib/events/public-v3-types";
import { CaptainLoginDialog } from "./CaptainLoginDialog";

const copy = {
  id: {
    registration: "Pendaftaran",
    drawing: "Drawing resmi",
    ongoing: "Sedang berlangsung",
    finished: "Selesai",
    overview: "Ringkasan event",
    organizedBy: "Diselenggarakan oleh",
    verified: "Organizer terverifikasi",
    starts: "Mulai",
    participants: "Peserta",
    format: "Format",
    venue: "Lokasi",
    prize: "Hadiah",
    viewOverview: "Lihat ringkasan",
    register: "Daftarkan tim",
    viewBracket: "Lihat bracket",
    viewStandings: "Lihat standings",
    viewLive: "Lihat event live",
    viewLeaderboard: "Lihat leaderboard",
    login: "Masuk untuk mendaftar",
    unavailable: "Belum tersedia",
  },
  en: {
    registration: "Registration",
    drawing: "Official drawing",
    ongoing: "Live now",
    finished: "Finished",
    overview: "Event overview",
    organizedBy: "Organized by",
    verified: "Verified organizer",
    starts: "Starts",
    participants: "Participants",
    format: "Format",
    venue: "Venue",
    prize: "Prize",
    viewOverview: "View overview",
    register: "Register a team",
    viewBracket: "View bracket",
    viewStandings: "View standings",
    viewLive: "View live event",
    viewLeaderboard: "View leaderboard",
    login: "Sign in to register",
    unavailable: "Not available yet",
  },
} as const;

const statusExplanationCopy = {
  id: {
    "registration.authoritative": "Detail pendaftaran resmi tersedia.",
    "registration.compatible": "Detail pendaftaran tersedia dari data event tersimpan.",
    "drawing.authoritative": "Drawing resmi telah diterbitkan.",
    "drawing.compatible": "Drawing resmi belum diterbitkan.",
    "ongoing.authoritative": "Event sedang berlangsung dengan jadwal dan hasil resmi.",
    "ongoing.compatible": "Event sedang berlangsung menggunakan jadwal dan hasil tersimpan terbaru.",
    "finished.authoritative": "Event selesai dengan hasil resmi dan penghargaan yang telah diterbitkan.",
    "finished.compatible": "Event selesai; penghargaan ditampilkan setelah publikasinya diverifikasi.",
  },
  en: {
    "registration.authoritative": "Official registration details are available.",
    "registration.compatible": "Registration details are available from saved event data.",
    "drawing.authoritative": "The official drawing is published.",
    "drawing.compatible": "The drawing is not yet officially published.",
    "ongoing.authoritative": "The event is in progress with official schedule and results.",
    "ongoing.compatible": "The event is in progress using the latest saved schedule and results.",
    "finished.authoritative": "The event is complete with official results and published awards.",
    "finished.compatible": "The event is complete; awards appear after publication is verified.",
  },
} as const;

function phaseLabel(view: PublicV3EventViewModel, locale: PublicV3Locale) {
  return copy[locale][view.mode];
}

function ctaLabel(view: PublicV3EventViewModel, locale: PublicV3Locale) {
  const labels = copy[locale];
  if (view.mode === "registration") {
    const registrationLabels = locale === "id"
      ? {
        register_team: "Daftarkan tim", create_team_and_register: "Buat tim dan daftar", select_team_to_register: "Pilih tim untuk didaftarkan", continue_registration: "Lanjutkan pendaftaran", continue_payment: "Lanjutkan pembayaran", view_registration_status: "Lihat status pendaftaran", repair_payment_proof: "Perbaiki bukti pembayaran", view_registered_team: "Lihat tim terdaftar", register_again: "Daftar ulang", use_captain_account: "Gunakan akun Captain", registration_upcoming: "Pendaftaran belum dibuka", registration_closed: "Pendaftaran ditutup", registration_full: "Slot pendaftaran penuh", registration_unavailable: "Pendaftaran belum tersedia",
      }
      : {
        register_team: "Register a team", create_team_and_register: "Create a team and register", select_team_to_register: "Choose a team to register", continue_registration: "Continue registration", continue_payment: "Continue payment", view_registration_status: "View registration status", repair_payment_proof: "Fix payment proof", view_registered_team: "View registered team", register_again: "Register again", use_captain_account: "Use a Captain account", registration_upcoming: "Registration has not opened", registration_closed: "Registration is closed", registration_full: "Registration slots are full", registration_unavailable: "Registration is unavailable",
      };
    return registrationLabels[view.cta.label as keyof typeof registrationLabels] ?? view.cta.label;
  }
  if (view.cta.kind === "login") return labels.login;
  if (view.mode === "drawing") return view.navigation.bracket ? labels.viewBracket : labels.viewStandings;
  if (view.mode === "ongoing") return labels.viewLive;
  return labels.viewLeaderboard;
}

function heroAction(view: PublicV3EventViewModel, locale: PublicV3Locale) {
  const label = ctaLabel(view, locale);
  if (view.mode === "registration" && view.cta.kind === "login") {
    return <CaptainLoginDialog locale={locale} eventId={view.identity.id} eventName={view.identity.title} triggerLabel={label} />;
  }
  if (view.mode === "registration" && view.cta.kind === "disabled") {
    return <button type="button" disabled className="mpv3-action mpv3-action--primary w-full sm:w-auto">{label}</button>;
  }
  return <PublicV3Action href={ctaHref(view, locale)} variant="primary">{label}</PublicV3Action>;
}

function ctaHref(view: PublicV3EventViewModel, locale: PublicV3Locale) {
  if (!view.cta.enabled) return null;
  if (view.cta.hrefByLocale) return view.cta.hrefByLocale[locale];
  if (view.cta.kind === "login") {
    const returnTo = view.identity.routes.register.hrefByLocale[locale];
    return publicV3LocalizedHref(`/login?returnTo=${encodeURIComponent(returnTo)}`)[locale];
  }
  return view.identity.routes.overview.hrefByLocale[locale];
}

function dateLabel(value: string, locale: PublicV3Locale, timezone: string) {
  if (!value || value === "TBD") return "TBD";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone === "TBD" ? "UTC" : timezone,
    }).format(date);
  } catch {
    return value;
  }
}

function posterUrl(view: PublicV3EventViewModel) {
  return view.identity.poster.eventUrl ?? view.identity.poster.gameImageUrl ?? view.identity.poster.logoUrl;
}

function statusExplanation(view: PublicV3EventViewModel, locale: PublicV3Locale) {
  return statusExplanationCopy[locale][view.statusExplanationKey as keyof typeof statusExplanationCopy[typeof locale]] ?? view.statusExplanation;
}

export function PublicV3EventHero({ view, locale }: { view: PublicV3EventViewModel; locale: PublicV3Locale }) {
  const t = copy[locale];
  const identity = view.identity;
  const gameSlug = identity.game.id.toLowerCase().includes("flashpeak") ? "flashpeak" : null;
  return <section className="mpv3-featured" data-event-hero>
    <div className="mpv3-hero-grid">
      <div className="mpv3-hero-copy">
        <div className="flex flex-wrap items-center gap-3">
          <PublicV3StatusBadge status={view.mode} label={phaseLabel(view, locale)} />
          <PublicV3Eyebrow tone="muted">{identity.game.name} · {identity.game.modeName}</PublicV3Eyebrow>
        </div>
        <div className="mt-7 flex min-w-0 items-center gap-3" data-event-organizer>
          <div data-testid="adaptive-event-logo" className="mpv3-event-monogram" aria-hidden="true">{identity.title.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "EV"}</div>
          <div className="min-w-0">
            <p className="text-[11px] text-[var(--mpv3-muted)]">{t.organizedBy}</p>
            <p className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold">
              <span className="break-words">{identity.organizer.name}</span>
              {identity.organizer.verified && <span className="inline-flex items-center gap-1 text-[var(--mpv3-cyan)]"><ShieldCheck aria-hidden="true" size={15} />{t.verified}</span>}
            </p>
          </div>
        </div>
        <h1>{identity.title}</h1>
        <p className="mpv3-home-description">{identity.description || t.overview}</p>
        <p className="mt-4 max-w-xl text-xs leading-6 text-[var(--mpv3-muted)]" data-status-explanation>{statusExplanation(view, locale)}</p>
        <div className="mpv3-actions mt-6" data-event-actions>
          {heroAction(view, locale)}
          <PublicV3Action href={identity.routes.participants.hrefByLocale[locale]} variant="text">{locale === "id" ? "Peserta" : "Participants"}</PublicV3Action>
        </div>
      </div>
      <div data-testid="adaptive-event-poster" className="min-w-0"><EventPosterStage
          eventName={identity.title}
          gameSlug={gameSlug}
          posterUrl={posterUrl(view)}
          posterAlt={identity.title}
          eyebrow={`${identity.game.name} · ${phaseLabel(view, locale)}`}
          variant="hero"
          priority
        /></div>
    </div>
    <PublicV3FactStrip
      facts={[
        { label: t.starts, value: dateLabel(identity.facts.startsAt, locale, identity.facts.timezone) },
        { label: t.participants, value: `${identity.facts.participants} / ${identity.facts.participantCap || "TBD"}` },
        { label: t.format, value: identity.format },
        { label: t.venue, value: identity.facts.venue },
      ]}
      action={identity.facts.prize ? <span className="mpv3-badge"><Trophy aria-hidden="true" size={14} />{t.prize}: {identity.facts.prize}</span> : null}
    />
  </section>;
}

export { dateLabel };
