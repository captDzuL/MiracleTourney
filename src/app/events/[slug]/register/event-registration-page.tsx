import { ArrowRight, CalendarDays, ShieldCheck, Trophy, Users } from "lucide-react";
import { notFound } from "next/navigation";

import { CaptainRegistrationWizard } from "@/components/registration/CaptainRegistrationWizard";
import { Link } from "@/i18n/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getGameModeConfig } from "@/lib/platform/config";
import {
  getCaptainRegistrationRequests,
  getCaptainTeams,
  getPaymentSettings,
  getPlayersForTeam,
  getPublicEventBySlug,
  getTeamCountsForEvents,
} from "@/lib/platform/repository";

type SearchParams = { error?: string; success?: string };

export async function renderEventRegistrationPage(
  slug: string,
  _locale: "id" | "en" = "id",
  searchParams?: Promise<SearchParams>,
) {
  const [event, user, resolvedSearchParams] = await Promise.all([
    getPublicEventBySlug(slug),
    getSessionUser(),
    searchParams,
  ]);
  if (!event) notFound();

  const mode = getGameModeConfig(event.gameModeId);
  const returnTo = "/events/" + event.slug + "/register";
  const teamCounts = await getTeamCountsForEvents([event.id]);
  const registeredTeams = teamCounts.get(event.id) ?? 0;

  if (!user || user.role !== "captain") {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_84%_-10%,rgba(114,80,209,.18),transparent_30%)] bg-[#09111e] text-[#f3efe7]">
        <header className="border-b border-[#29374a] bg-[#09111e]/90 backdrop-blur-xl"><div className="mx-auto flex min-h-[72px] w-[min(1180px,calc(100%-36px))] items-center justify-between"><Link href="/" className="text-lg font-extrabold tracking-[0.14em] text-[#f6dfb1]">MIRACLE</Link><Link href={{ pathname: "/login", query: { returnTo } } as never} className="rounded-[10px] border border-[#29374a] bg-white/[0.035] px-4 py-2.5 text-sm font-semibold">Masuk</Link></div></header>
        <section className="mx-auto grid w-[min(1180px,calc(100%-36px))] gap-5 py-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(330px,.8fr)]">
          <div className="rounded-2xl border border-[#29374a] bg-white/[0.025] p-7 shadow-2xl sm:p-8"><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#aa8bff]">Pendaftaran dibuka</p><h1 className="mt-3 text-4xl font-extrabold leading-none tracking-[-0.04em] sm:text-6xl">{event.name}</h1><p className="mt-5 max-w-2xl text-sm leading-7 text-[#aab7c9]">Daftarkan tim langsung melalui Miracle. Siapkan IGN dan UID captain beserta {mode.teamSize} pemain inti.</p><div className="mt-6 grid grid-cols-2 overflow-hidden rounded-xl border border-[#29374a] sm:grid-cols-4">{[[CalendarDays,"Registrasi",event.registrationWindow],[Users,"Slot",registeredTeams+" / "+event.participantCap],[Trophy,"Format",event.format],[ShieldCheck,"Biaya",event.registrationFeeLabel ?? "Gratis"]].map(([Icon,label,value], index) => { const Glyph = Icon as typeof CalendarDays; return <div key={label as string} className={`p-3 ${index < 3 ? "border-r border-[#29374a]" : ""}`}><Glyph className="h-4 w-4 text-[#49d1ec]" /><small className="mt-2 block text-[9px] uppercase text-[#aab7c9]">{label as string}</small><b className="mt-1 block text-xs">{value as string}</b></div>; })}</div><div className="mt-6 flex flex-wrap gap-3"><Link href={{ pathname: "/login", query: { returnTo } } as never} className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-[#7250d1] px-5 text-sm font-semibold text-white">Masuk dan lanjutkan <ArrowRight className="h-4 w-4" /></Link><Link href={{ pathname: "/register", query: { returnTo } } as never} className="inline-flex min-h-11 items-center rounded-[10px] border border-[#29374a] px-5 text-sm font-semibold">Buat akun captain</Link></div></div>
          <div className="relative min-h-72 overflow-hidden rounded-2xl border border-[#29374a] bg-[radial-gradient(circle_at_50%_28%,rgba(73,209,236,.22),transparent_27%),radial-gradient(circle_at_72%_58%,rgba(170,139,255,.27),transparent_35%),#0c1627] p-6"><span className="absolute inset-0 grid place-items-center text-[13rem] font-extrabold text-[#f6dfb1]/[0.08]">M</span><div className="relative flex h-full flex-col justify-end"><b className="text-2xl">Registrasi captain native</b><span className="mt-1 text-sm text-[#aab7c9]">Draft, roster, pembayaran, dan status tetap tersimpan.</span></div></div>
        </section>
      </main>
    );
  }

  const [teams, requests, paymentSettings] = await Promise.all([
    getCaptainTeams(user.id),
    getCaptainRegistrationRequests(user.id),
    getPaymentSettings(),
  ]);
  const draft = teams.find((team) => !team.eventId && team.source === "draft");
  const registeredTeam = teams.find((team) => team.eventId === event.id);
  const players = draft ? await getPlayersForTeam(draft.id) : [];
  const request = requests.find((candidate) => candidate.eventId === event.id);
  const currentRequest = registeredTeam
    ? { id: registeredTeam.id, status: "approved" as const, expiresAt: new Date().toISOString() }
    : request ? { id: request.id, status: request.status, expiresAt: request.expiresAt.toISOString(), rejectReason: request.rejectReason, proofImageUrl: request.proofImageUrl } : undefined;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_84%_-10%,rgba(114,80,209,.16),transparent_30%)] bg-[#09111e] text-[#f3efe7]">
      <header className="sticky top-0 z-20 border-b border-[#29374a] bg-[#09111e]/90 backdrop-blur-xl"><div className="mx-auto flex min-h-[72px] w-[min(1180px,calc(100%-36px))] items-center justify-between"><Link href="/" className="text-lg font-extrabold tracking-[0.14em] text-[#f6dfb1]">MIRACLE</Link><div className="grid h-9 w-9 place-items-center rounded-full bg-[#202d42] text-xs font-bold">{user.name.slice(0, 2).toUpperCase()}</div></div></header>
      <div className="border-b border-[#29374a]"><div className="mx-auto w-[min(1180px,calc(100%-36px))] py-5"><p className="text-[10px] text-[#aab7c9]">Event / {event.name} / Registrasi</p><h1 className="mt-2 text-2xl font-bold">Daftarkan timmu</h1><p className="mt-1 text-sm text-[#aab7c9]">Selesaikan langkah berikut untuk masuk ke {event.name}.</p></div></div>
      <section className="mx-auto w-[min(1180px,calc(100%-36px))] py-6">
        {resolvedSearchParams?.error ? <p className="mb-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{resolvedSearchParams.error}</p> : null}
        {resolvedSearchParams?.success ? <p className="mb-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">Pendaftaran tersimpan. Ikuti tindakan berikutnya di bawah.</p> : null}
        <CaptainRegistrationWizard
          event={{ ...event, registeredTeams, registrationFeeRequired: event.registrationFeeRequired ?? false }}
          positions={mode.positions}
          requiredPlayers={mode.teamSize}
          draftTeam={draft ? { ...draft, players } : undefined}
          currentRequest={currentRequest}
          paymentSettings={paymentSettings}
        />
      </section>
    </main>
  );
}
