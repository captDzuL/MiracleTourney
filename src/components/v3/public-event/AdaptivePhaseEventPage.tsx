import React from "react";
import Link from "next/link";
import { Award, CalendarDays, ListTree, ShieldCheck, Trophy, Users } from "lucide-react";

import type {
  AdaptivePhaseMatch,
  PublicDrawingEventViewModel,
  PublicFinishedEventViewModel,
} from "@/lib/events/adaptive-public-phases";

type View = PublicDrawingEventViewModel | PublicFinishedEventViewModel;
const panel = "min-w-0 border border-white/15 bg-[#0c1518] p-5 sm:p-6";
const awardLabels = {
  mvp: "MVP of Tournament",
  top_scorer: "Top Scorer",
  top_defender: "Top Defender",
  top_assist: "Top Assist",
} as const;

function MatchCard({ match }: { match: AdaptivePhaseMatch }) {
  return (
    <article className="min-w-0 border border-white/12 bg-[#101c20] p-4">
      <p className="text-xs font-bold uppercase tracking-widest text-cyan-300">{match.roundLabel}</p>
      <h3 className="mt-3 break-words font-black">{match.home ?? "TBD"} <span className="font-normal text-white/40">vs</span> {match.away ?? "TBD"}</h3>
      {match.homeScore !== null ? <p className="mt-2 text-xl font-black tabular-nums">{match.homeScore} - {match.awayScore}</p> : null}
      <p className="mt-2 text-xs text-white/50">{match.start ?? "TBD"}{match.room ? ` · ${match.room}` : ""}</p>
    </article>
  );
}

export function AdaptivePhaseEventPage({ view, locale }: { view: View; locale: "id" | "en" }) {
  const base = `/${locale}/events/${view.event.slug}`;
  const nav = [
    [view.navigation.overview, locale === "id" ? "Ringkasan" : "Overview", base],
    [view.navigation.participants, locale === "id" ? "Peserta" : "Participants", `${base}/participants`],
    [view.navigation.schedule, locale === "id" ? "Jadwal" : "Schedule", `${base}/schedule`],
    [view.navigation.bracket, "Bracket", `${base}/bracket`],
    [view.navigation.leaderboard, "Leaderboard", `${base}/leaderboards`],
  ] as const;
  return (
    <div className="miracle-v3 adaptive-public-event grid min-w-0 gap-6 bg-[#071012] pb-12 text-[#f4f1e9]">
      <header className="relative isolate min-h-[390px] overflow-hidden border border-white/15 p-6 sm:p-10">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_72%_18%,rgba(111,78,255,0.3),transparent_34%),linear-gradient(125deg,#0b171a,#10152b)]" />
        <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-[#c7ff35]">
          {view.mode === "drawing" ? <ListTree aria-hidden="true" size={18} /> : <Trophy aria-hidden="true" size={18} />}
          {view.mode === "drawing" ? (locale === "id" ? "Drawing resmi" : "Official draw") : (locale === "id" ? "Hasil akhir resmi" : "Official final results")}
        </p>
        <h1 className="mt-5 max-w-4xl break-words text-4xl font-black uppercase leading-none tracking-[-0.04em] sm:text-6xl">{view.event.name}</h1>
        <p className="mt-5 max-w-3xl leading-7 text-white/65">{view.event.description}</p>
        <p className="mt-4 max-w-3xl text-sm font-semibold text-cyan-200">{view.statusExplanation}</p>
        <div className="mt-6 flex flex-wrap gap-4 text-sm text-white/65">
          <span className="inline-flex items-center gap-2"><CalendarDays size={16} />{view.facts.startsAt}</span>
          <span className="inline-flex items-center gap-2"><Users size={16} />{view.facts.participants}/{view.facts.participantCap}</span>
          <span className="inline-flex items-center gap-2"><ShieldCheck size={16} />{view.organizer.name}{view.organizer.verified ? " · Verified" : ""}</span>
        </div>
      </header>

      <nav aria-label={locale === "id" ? "Navigasi event" : "Event navigation"} className="flex flex-wrap border border-white/15">
        {nav.filter(([visible]) => visible).map(([, label, href]) => <Link key={href} href={href} className="miracle-focus-ring inline-flex min-h-11 items-center border-r border-white/10 px-4 text-sm font-bold hover:text-[#c7ff35]">{label}</Link>)}
      </nav>

      {view.mode === "drawing" ? (
        <>
          <section className={panel}>
            <h2 className="text-xl font-black uppercase">{locale === "id" ? "Urutan seed resmi" : "Official seed order"}</h2>
            <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{view.drawing.seeds.map((seed) => <li key={seed.teamId} className="border border-white/10 bg-white/[0.03] p-3"><span className="mr-3 text-[#c7ff35]">{seed.seed}</span><strong>{seed.teamName}</strong></li>)}</ol>
          </section>
          <section className={panel}>
            <h2 className="text-xl font-black uppercase">Bracket</h2>
            <p className="mt-2 text-sm text-white/55">{locale === "id" ? "Slot babak berikutnya tetap TBD hingga hasil pertandingan resmi." : "Future-round slots remain TBD until official results are posted."}</p>
            <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-2 lg:grid-cols-3">{view.matches.map((match) => <MatchCard key={match.id} match={match} />)}</div>
          </section>
          <section className={panel}>
            <h2 className="text-xl font-black uppercase">{locale === "id" ? "Jadwal" : "Schedule"}</h2>
            <p className="mt-3 text-white/60">{view.schedule ? (locale === "id" ? `Jadwal resmi versi ${view.schedule.version} telah diterbitkan.` : `Official schedule version ${view.schedule.version} is published.`) : (locale === "id" ? "Jadwal belum diterbitkan organizer." : "The organizer has not published the schedule yet.")}</p>
          </section>
        </>
      ) : (
        <>
          <section className={panel}>
            <h2 className="text-xl font-black uppercase">{locale === "id" ? "Podium akhir" : "Final podium"}</h2>
            <ol className="mt-4 grid gap-3 md:grid-cols-3">{view.podium.map((placement) => <li key={placement.rank} className="border border-white/10 p-4"><span className="text-3xl font-black text-[#c7ff35]">#{placement.rank}</span><p className="mt-2 font-black">{placement.teamName}</p></li>)}</ol>
          </section>
          <section className={panel}>
            <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-cyan-300">{locale === "id" ? "Keputusan organizer" : "Organizer decisions"}</p><h2 className="mt-2 text-xl font-black uppercase">{locale === "id" ? "Penghargaan individual" : "Individual awards"}</h2></div><Link href={`${base}/leaderboards`} className="miracle-focus-ring inline-flex min-h-11 items-center border border-white/20 px-4 text-sm font-bold">{locale === "id" ? "Lihat leaderboard akhir" : "View final leaderboard"}</Link></div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">{view.awards.map((award) => <article key={award.type} className="border border-white/10 bg-white/[0.03] p-4"><p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-[#c7ff35]"><Award size={15} />{awardLabels[award.type]}</p><h3 className="mt-3 font-black">{award.recipientName}</h3><p className="mt-1 text-sm text-white/55">{award.teamName}</p>{award.reason ? <p className="mt-2 text-sm text-white/65">{award.reason}</p> : null}{award.certificate ? <div className="mt-4 flex flex-wrap gap-3"><a href={award.certificate.publishedUrl} target="_blank" rel="noopener noreferrer" className="miracle-focus-ring inline-flex min-h-11 items-center text-sm font-bold text-cyan-300 underline">{locale === "id" ? "Lihat certificate" : "View certificate"}</a><Link href={`/${locale}/certificates/verify/${award.certificate.verificationCode}`} className="miracle-focus-ring inline-flex min-h-11 items-center text-sm font-bold text-white/70 underline">{locale === "id" ? "Verifikasi" : "Verify"}</Link></div> : null}</article>)}</div>
          </section>
          <section className={panel}>
            <h2 className="text-xl font-black uppercase">{locale === "id" ? "Perjalanan final" : "Final journey"}</h2>
            <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-2 lg:grid-cols-3">{view.matches.map((match) => <MatchCard key={match.id} match={match} />)}</div>
          </section>
        </>
      )}

      {view.standings.map((table) => <section key={`${table.phaseId}:${table.groupId}`} className={panel}><h2 className="text-xl font-black uppercase">{locale === "id" ? "Klasemen akhir" : "Final standings"}</h2><ol className="mt-4 grid gap-2">{table.rows.map((row) => <li key={row.teamId} className="flex flex-wrap justify-between gap-3 border-t border-white/10 py-3"><strong>{row.rank}. {row.name}</strong><span className="tabular-nums text-white/60">{row.points} pts · {row.played} {locale === "id" ? "main" : "played"}</span></li>)}</ol></section>)}
    </div>
  );
}
