import React from "react";
import { getTranslations } from "next-intl/server";

import { NextMatchCard } from "@/components/player/NextMatchCard";
import { PlayerRegistrationCard } from "@/components/player/PlayerRegistrationCard";
import { PlayerTeamCard } from "@/components/player/PlayerTeamCard";
import { isActive } from "@/components/player/stage-copy";
import { card, linkButton, muted } from "@/components/player/styles";
import { Link } from "@/i18n/navigation";
import { getPlayerDashboard, type PlayerRegistrationItem } from "@/lib/player/dashboard-read";

import { openPlayerPage } from "./guard";

export const dynamic = "force-dynamic";

type TeamItem = PlayerRegistrationItem & { team: NonNullable<PlayerRegistrationItem["team"]> };

/** One card per team, however many registrations point at it. */
function teamsOf(items: readonly PlayerRegistrationItem[]): TeamItem[] {
  const seen = new Set<string>();
  return items.filter((item): item is TeamItem => {
    if (!item.team || seen.has(item.team.id)) return false;
    seen.add(item.team.id);
    return true;
  });
}

export default async function PlayerHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ success?: string }>;
}) {
  const { locale, user } = await openPlayerPage(params);
  const [t, query, dashboard] = await Promise.all([getTranslations("player"), searchParams, getPlayerDashboard(user.id)]);
  const active = dashboard.registrations.filter((item) => isActive(item.stage));
  const teams = teamsOf(dashboard.registrations);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black text-slate-950">{t("greeting", { name: user.name })}</h1>
        <p className={muted + " mt-1"}>{t("greetingHint")}</p>
      </header>

      {query?.success === "password-changed" && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{t("notices.passwordChanged")}</p>
      )}

      {teams.length > 0 && (
        <section aria-labelledby="player-teams" className="space-y-3">
          <h2 id="player-teams" className="text-lg font-extrabold text-slate-950">{t("teams.title")}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {teams.map((item) => <PlayerTeamCard key={item.team.id} item={item} />)}
          </div>
        </section>
      )}

      {teams.length > 0 && <NextMatchCard match={dashboard.nextMatch} locale={locale} />}

      <section aria-labelledby="player-active" className="space-y-3">
        <h2 id="player-active" className="text-lg font-extrabold text-slate-950">{t("active.title")}</h2>
        {active.length === 0 ? (
          <div className={card}>
            <p className={muted}>{t("active.empty")}</p>
            <Link className={linkButton + " mt-4"} href={"/events" as never}>{t("active.browse")}</Link>
          </div>
        ) : (
          <div className="grid gap-3">
            {active.map((item) => <PlayerRegistrationCard key={item.registrationId} item={item} locale={locale} />)}
          </div>
        )}
      </section>
    </div>
  );
}
