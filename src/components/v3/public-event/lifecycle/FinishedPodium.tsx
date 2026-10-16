import React from "react";
import { Medal, Trophy } from "lucide-react";
import type { PublicV3FinishedEventViewModel, PublicV3Locale } from "@/lib/events/public-v3-types";
import { PublicV3EmptyState, PublicV3SectionHeading } from "@/components/v3/public-discovery/PublicV3Primitives";
import { certificateTypeLabel } from "@/lib/certificate/type-labels";

const copy = {
  id: { title: "Podium akhir", empty: "Podium belum diterbitkan." },
  en: { title: "Final podium", empty: "The podium has not been published." },
} as const;

const rankTypes: Record<number, string> = { 1: "champion", 2: "runner_up", 3: "third_place" };

/** Placements are rendered in rank order; CSS puts the champion in the middle so screen readers still hear 1, 2, 3. */
export function FinishedPodium({ podium, locale }: { podium: PublicV3FinishedEventViewModel["podium"]; locale: PublicV3Locale }) {
  const t = copy[locale];
  const placements = [...podium].filter((placement) => placement.rank >= 1 && placement.rank <= 3).sort((a, b) => a.rank - b.rank);
  return <section className="mpv3-panel mpv3-panel-pad" data-podium={placements.length ? "published" : "empty"}>
    <PublicV3SectionHeading title={t.title} />
    {placements.length ? <ol className="mpv3-podium" data-podium-count={placements.length}>
      {placements.map((placement) => <li key={placement.rank} className="mpv3-podium-step" data-rank={placement.rank}>
        <div className="mpv3-podium-team">
          {placement.rank === 1 ? <Trophy aria-hidden="true" /> : <Medal aria-hidden="true" />}
          <span className="mpv3-podium-label">{certificateTypeLabel(locale, rankTypes[placement.rank])}</span>
          <strong>{placement.teamName}</strong>
        </div>
        <div className="mpv3-podium-block" aria-hidden="true">{placement.rank}</div>
      </li>)}
    </ol> : <PublicV3EmptyState title={t.empty} description={t.empty} />}
  </section>;
}
