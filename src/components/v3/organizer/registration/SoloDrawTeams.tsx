import React from "react";
import { useTranslations } from "next-intl";

import type { SoloDrawTeam } from "@/lib/solo/draw-types";
import { positionLabel } from "@/lib/solo/labels";

import { muted } from "./shared";

type Props = {
  locale: "id" | "en";
  teams: readonly SoloDrawTeam[];
  /** Registration ids picked for a swap. Empty and unused when the draw can no longer change. */
  selected: readonly string[];
  /** Null when the teams are read-only. */
  onToggle: ((registrationId: string) => void) | null;
  /** Id of the line that says how to swap, read out together with each player. */
  describedBy?: string;
};

/** The teams of a draw. Every player is a toggle while the draw is a draft, so two of them can be swapped. */
export function SoloDrawTeams({ locale, teams, selected, onToggle, describedBy }: Props) {
  const t = useTranslations("registrationWorkspace");
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {teams.map((team) => (
        <article key={team.index} className="min-w-0 rounded-[var(--radius-control)] border border-[var(--color-border)] p-3">
          <h3 style={{ fontFamily: "var(--font-miracle-v3)" }} className="mb-2 font-extrabold">
            {t("solo.draw.result.team", { index: team.index })}
          </h3>
          <ul className="grid gap-1">
            {team.members.map((member) => {
              const label = (
                <>
                  <span className="min-w-0 flex-1 break-words text-left">
                    <strong>{member.ign}</strong>
                    <span className={muted + " block"}>{member.uid}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1 text-xs">
                    <span>{positionLabel(member.position, locale)}</span>
                    {member.isCaptain && (
                      <span className="rounded-full border border-[var(--color-brand-cyan)] px-2 py-0.5 font-bold text-[var(--color-brand-cyan)]">
                        {t("solo.draw.result.captain")}
                      </span>
                    )}
                  </span>
                </>
              );
              const picked = selected.includes(member.registrationId);
              return (
                <li key={member.registrationId}>
                  {onToggle ? (
                    <button
                      type="button"
                      data-member={member.registrationId}
                      aria-pressed={picked}
                      aria-describedby={describedBy}
                      onClick={() => onToggle(member.registrationId)}
                      className={"miracle-focus-ring flex min-h-11 w-full items-center gap-3 rounded-[var(--radius-control)] border px-3 py-2 text-sm " + (picked
                        ? "border-[var(--color-brand-violet)] bg-[var(--color-surface-selected)]"
                        : "border-transparent hover:bg-[var(--color-surface-selected)]")}
                    >
                      {label}
                    </button>
                  ) : (
                    <div className="flex min-h-11 items-center gap-3 px-3 py-2 text-sm">{label}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </article>
      ))}
    </div>
  );
}
