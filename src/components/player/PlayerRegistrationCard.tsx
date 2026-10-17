import React from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import type { PlayerRegistrationItem } from "@/lib/player/dashboard-read";
import { positionLabel } from "@/lib/solo/labels";

import { hasOpenSignUp, refundText, stageLabelKey, stageText, stageTone, type Locale } from "./stage-copy";
import { TONES, card, linkButton, muted } from "./styles";

/** One registration of the player: where it stands, what it means, and the next step when there is one. */
export function PlayerRegistrationCard({ item, locale }: { item: PlayerRegistrationItem; locale: Locale }) {
  const t = useTranslations("player");
  const { stage, event, team } = item;
  const refund = stage.kind === "out_of_teams" || stage.kind === "lost" ? refundText(t, stage.refund) : null;
  const position = positionLabel(item.primaryPosition, locale);

  return (
    <article className={card} data-registration={item.registrationId}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="min-w-0 break-words text-lg font-extrabold text-slate-950">{event.name}</h3>
        <span className={`inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-bold ring-1 ${TONES[stageTone(stage)]}`}>
          {t(stageLabelKey(stage))}
        </span>
      </div>
      <p className={muted + " mt-1 break-words"}>
        {t("registration.details", { ign: item.ign, uid: item.uid })} · {position}
        {item.secondaryPosition ? ` · ${t("registration.backup", { position: positionLabel(item.secondaryPosition, locale) })}` : ""}
      </p>
      <p className="mt-3 text-sm text-slate-800">{stageText(t, stage, { locale, teamName: team?.name ?? null })}</p>
      {refund && <p className="mt-1 text-sm font-medium text-slate-700">{refund}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {hasOpenSignUp(stage, event.status) && (
          <Link className={linkButton} href={`/events/${event.slug}/register` as never}>{t("registration.open")}</Link>
        )}
        {team && (
          <Link className={linkButton} href={`/player/team/${event.id}` as never}>{t("registration.viewTeam")}</Link>
        )}
      </div>
    </article>
  );
}
