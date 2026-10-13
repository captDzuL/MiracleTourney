import React from "react";
import { useTranslations } from "next-intl";

import type { SoloDrawView } from "@/lib/solo/draw-types";
import type { SoloEventSummary } from "@/lib/solo/organizer-read";

import { SoloDrawTeams } from "./SoloDrawTeams";
import { WarningList } from "./SoloDrawSections";
import { control, muted, panel, primary } from "./shared";

type Props = {
  locale: "id" | "en";
  summary: SoloEventSummary;
  draw: SoloDrawView;
  /** True while the draw is a draft of an event whose teams are not locked. Swap and lock exist only then. */
  editable: boolean;
  selected: readonly string[];
  busy: boolean;
  onToggle: (registrationId: string) => void;
  onSwap: () => void;
  onLock: () => void;
};

/** The teams of one draw, with the swap and lock controls while it can still change. */
export function SoloDrawResult({ locale, summary, draw, editable, selected, busy, onToggle, onSwap, onLock }: Props) {
  const t = useTranslations("registrationWorkspace");
  const teamOf = (id: string) => draw.teams.find((team) => team.members.some((member) => member.registrationId === id))?.index;
  const canSwap = selected.length === 2 && teamOf(selected[0]) !== teamOf(selected[1]);
  return (
    <section className={panel + " grid gap-4"} aria-labelledby="solo-result-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="solo-result-title" style={{ fontFamily: "var(--font-miracle-v3)" }} className="text-lg font-extrabold">
          {t("solo.draw.result.title", { version: draw.version })}
        </h2>
        <span className={muted}>{t("solo.draw.result.seed", { seed: draw.seed })}</span>
      </div>
      <WarningList warnings={draw.warnings} summary={summary} locale={locale} />
      <SoloDrawTeams locale={locale} teams={draw.teams} selected={selected} onToggle={editable ? onToggle : null} describedBy="solo-swap-hint" />
      {editable && (
        <div className="grid gap-2">
          <p id="solo-swap-hint" className={muted}>
            {selected.length === 0 ? t("solo.draw.result.swapHint") : t("solo.draw.result.swapSelected", { count: selected.length })}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" data-swap className={control} disabled={busy || !canSwap} onClick={onSwap}>
              {t("solo.draw.result.swap")}
            </button>
            <button type="button" data-lock className={primary} disabled={busy || !draw.canLock} aria-describedby={draw.canLock ? undefined : "solo-lock-blocker"} onClick={onLock}>
              {t("solo.draw.lock.button")}
            </button>
          </div>
          {!draw.canLock && <p id="solo-lock-blocker" className={muted}>{t("solo.draw.lock.blocked")}</p>}
        </div>
      )}
    </section>
  );
}
