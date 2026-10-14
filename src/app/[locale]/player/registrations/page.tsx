import React from "react";
import { getTranslations } from "next-intl/server";

import { PlayerRegistrationCard } from "@/components/player/PlayerRegistrationCard";
import { isActive } from "@/components/player/stage-copy";
import { card, linkButton, muted } from "@/components/player/styles";
import { Link } from "@/i18n/navigation";
import { getPlayerDashboard } from "@/lib/player/dashboard-read";

import { openPlayerPage } from "../guard";

export const dynamic = "force-dynamic";

export default async function PlayerRegistrationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale, user } = await openPlayerPage(params);
  const [t, dashboard] = await Promise.all([getTranslations("player"), getPlayerDashboard(user.id)]);
  const active = dashboard.registrations.filter((item) => isActive(item.stage));
  const history = dashboard.registrations.filter((item) => !isActive(item.stage));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black text-slate-950">{t("nav.registrations")}</h1>

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

      <section aria-labelledby="player-history" className="space-y-3">
        <h2 id="player-history" className="text-lg font-extrabold text-slate-950">{t("history.title")}</h2>
        {history.length === 0 ? (
          <p className={muted}>{t("history.empty")}</p>
        ) : (
          <div className="grid gap-3">
            {history.map((item) => <PlayerRegistrationCard key={item.registrationId} item={item} locale={locale} />)}
          </div>
        )}
      </section>
    </div>
  );
}
