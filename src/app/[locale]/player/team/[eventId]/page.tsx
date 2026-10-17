import React from "react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { MatchLine } from "@/components/player/NextMatchCard";
import { TeamMembers } from "@/components/player/TeamMembers";
import { card, linkButton, muted } from "@/components/player/styles";
import { Link } from "@/i18n/navigation";
import { getPlayerTeamView } from "@/lib/player/dashboard-read";
import { isSafeEntityId } from "@/lib/security/request-guard";

import { openPlayerPage } from "../../guard";

export const dynamic = "force-dynamic";

/** The team a player drew in one event. Anybody who is not on that team, or asks before the lock, gets a 404. */
export default async function PlayerTeamPage({ params }: { params: Promise<{ locale: string; eventId: string }> }) {
  const { locale, user } = await openPlayerPage(params);
  const { eventId } = await params;
  if (!isSafeEntityId(eventId)) notFound();

  const [t, view] = await Promise.all([getTranslations("player"), getPlayerTeamView(user.id, eventId)]);
  if (!view) notFound();

  return (
    <div className="space-y-6">
      <header>
        <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-cyan-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400" href={"/player" as never}>← {t("team.back")}</Link>
        <h1 className="mt-2 text-2xl font-black text-slate-950">
          {view.team.name} <span className="text-base font-bold text-cyan-700">{view.team.tag}</span>
        </h1>
        <p className={muted}>{t("team.event", { name: view.event.name })}</p>
      </header>

      <TeamMembers members={view.members} locale={locale} />

      <section className={card} aria-labelledby="player-team-matches">
        <h2 id="player-team-matches" className="mb-3 text-lg font-extrabold text-slate-950">{t("team.matches")}</h2>
        {view.matches.length === 0 ? (
          <p className={muted}>{t("team.noMatches")}</p>
        ) : (
          <ul className="grid gap-3">
            {view.matches.map((match) => <li key={match.matchId}><MatchLine match={match} locale={locale} /></li>)}
          </ul>
        )}
      </section>

      {view.iAmCaptain && <Link className={linkButton} href={"/captain" as never}>{t("team.manage")}</Link>}
    </div>
  );
}
