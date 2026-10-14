import React from "react";
import { useTranslations } from "next-intl";

import type { TeamMember } from "@/lib/player/dashboard-read";
import { positionLabel } from "@/lib/solo/labels";

import type { Locale } from "./stage-copy";
import { card, muted } from "./styles";

/** Only digits with a country code ever become a link, whatever the database holds. */
const CHAT_NUMBER = /^\d{10,15}$/;

function Contact({ number, label, none }: { number: string | null; label: string; none: string }) {
  if (!number || !CHAT_NUMBER.test(number)) return <span className="text-slate-400">{none}</span>;
  return (
    <a
      className="inline-flex min-h-11 items-center font-semibold text-cyan-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
      href={`https://wa.me/${number}`}
      rel="noopener noreferrer"
      target="_blank"
    >
      +{number} · {label}
    </a>
  );
}

/** The people of a team with the positions they hold and how to reach them. For teammates only. */
export function TeamMembers({ members, locale }: { members: readonly TeamMember[]; locale: Locale }) {
  const t = useTranslations("player");
  return (
    <section className={card} aria-labelledby="player-team-members">
      <h2 id="player-team-members" className="mb-3 text-lg font-extrabold text-slate-950">{t("team.members")}</h2>
      <ul className="grid gap-3">
        {members.map((member) => (
          <li key={member.playerId} className="grid gap-1 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 break-words font-bold text-slate-950">
                {member.ign}
                {member.isCaptain && <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-xs font-bold text-cyan-800 ring-1 ring-cyan-200">{t("team.captain")}</span>}
                {member.isMe && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700 ring-1 ring-slate-200">{t("team.you")}</span>}
              </p>
              <p className={muted + " break-all"}>{t("team.uid")} {member.uid} · {positionLabel(member.position, locale) || "-"}</p>
            </div>
            <Contact number={member.whatsapp} label={t("team.chat")} none={t("team.noContact")} />
          </li>
        ))}
      </ul>
      <p className={muted + " mt-4"}>{t("team.privacy")}</p>
    </section>
  );
}
