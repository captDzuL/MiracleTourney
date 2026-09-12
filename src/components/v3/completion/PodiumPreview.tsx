import { LockKeyhole, Trophy } from "lucide-react";
import { useTranslations } from "next-intl";

import type { CompletionWorkspaceState } from "@/lib/completion/workspace";

type PodiumPreviewProps = {
  podium: CompletionWorkspaceState["podium"];
};

export function PodiumPreview({ podium }: PodiumPreviewProps) {
  const t = useTranslations("completionWorkspace");

  return <section aria-labelledby="completion-podium-title" className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 id="completion-podium-title" className="font-extrabold text-[var(--color-text)]">{t("podium.title")}</h3>
        <p className="mt-1 break-words text-xs leading-5 text-[var(--color-text-subtle)]">{podium.sourceLabel || t(`podium.sources.${podium.sourceKind}`)}</p>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--color-border-strong)] px-2 py-1 text-xs font-bold text-[var(--color-text)]">
        {podium.locked ? <LockKeyhole aria-hidden="true" className="size-3.5 text-[var(--color-brand-cream)]" /> : <Trophy aria-hidden="true" className="size-3.5 text-[var(--color-brand-violet)]" />}
        {podium.locked ? t("podium.locked") : t("podium.draft")}
      </span>
    </div>
    {podium.placements.length > 0 ? <ol data-podium-grid className="mt-5 grid min-w-0 gap-3 min-[700px]:grid-cols-3 min-[1100px]:grid-cols-1">
      {podium.placements.map((placement) => <li key={placement.teamId} className="min-w-0 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4">
        <span className="text-2xl font-extrabold text-[var(--color-brand-cream)]">{placement.rank}</span>
        <p className="mt-2 break-words text-sm font-extrabold text-[var(--color-text)]">{placement.teamName}</p>
        <p className="mt-1 text-xs text-[var(--color-text-subtle)]">{t(`podium.ranks.${placement.rank}`)}</p>
      </li>)}
    </ol> : <div data-podium-grid className="mt-5 grid min-w-0 gap-3 min-[700px]:grid-cols-3 min-[1100px]:grid-cols-1"><p className="text-sm leading-6 text-[var(--color-text-subtle)]">{t("podium.unavailable")}</p></div>}
  </section>;
}
