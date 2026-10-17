import React from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import type { PlayerRegistrationItem } from "@/lib/player/dashboard-read";

import { card, linkButton, muted } from "./styles";

type TeamItem = PlayerRegistrationItem & { team: NonNullable<PlayerRegistrationItem["team"]> };

/** A team the player drew, as a short card on the overview. The team page has the people and their numbers. */
export function PlayerTeamCard({ item }: { item: TeamItem }) {
  const t = useTranslations("player");
  return (
    <article className={card}>
      <p className={muted}>{item.event.name}</p>
      <h3 className="mt-1 text-xl font-extrabold text-slate-950">
        {item.team.name} <span className="text-sm font-bold text-cyan-700">{item.team.tag}</span>
      </h3>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link className={linkButton} href={`/player/team/${item.event.id}` as never}>{t("teams.view")}</Link>
        {item.team.iAmCaptain && <Link className={linkButton} href={"/captain" as never}>{t("teams.manage")}</Link>}
      </div>
    </article>
  );
}
