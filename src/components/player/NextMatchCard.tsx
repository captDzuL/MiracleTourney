import React from "react";
import { useTranslations } from "next-intl";

import type { PlayerMatch } from "@/lib/player/dashboard-read";

import { formatDateTime, type Locale } from "./stage-copy";
import { card, muted } from "./styles";

/** One match of the player's team: who plays whom, in which round, and when. */
export function MatchLine({ match, locale }: { match: PlayerMatch; locale: Locale }) {
  const t = useTranslations("player");
  const when = match.status === "Live"
    ? t("nextMatch.live")
    : match.scheduledAt
      ? formatDateTime(match.scheduledAt, locale)
      : match.scheduledLabel ?? t("nextMatch.noTime");
  return (
    <div>
      <p className="break-words font-bold text-slate-950">
        {match.opponentName ? t("nextMatch.versus", { team: match.teamName, opponent: match.opponentName }) : `${match.teamName} · ${t("nextMatch.noOpponent")}`}
      </p>
      <p className={muted}>{match.roundLabel} · {when}</p>
    </div>
  );
}

/** The soonest match of the player's team, or a plain note that none is scheduled. */
export function NextMatchCard({ match, locale }: { match: PlayerMatch | null; locale: Locale }) {
  const t = useTranslations("player");
  return (
    <section className={card} aria-labelledby="player-next-match">
      <h2 id="player-next-match" className="mb-3 text-lg font-extrabold text-slate-950">{t("nextMatch.title")}</h2>
      {match ? (
        <>
          <p className={muted + " mb-1"}>{match.eventName}</p>
          <MatchLine match={match} locale={locale} />
        </>
      ) : (
        <p className={muted}>{t("nextMatch.empty")}</p>
      )}
    </section>
  );
}
