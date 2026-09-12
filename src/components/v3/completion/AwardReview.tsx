import { Award, CheckCircle2, Scale } from "lucide-react";
import { useTranslations } from "next-intl";

import type { CompletionAwardSummary } from "@/lib/completion/workspace";

type AwardReviewProps = {
  awards: readonly CompletionAwardSummary[];
};

export function AwardReview({ awards }: AwardReviewProps) {
  const t = useTranslations("completionWorkspace");

  return <section aria-labelledby="completion-awards-title" className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 min-[700px]:p-6">
    <div>
      <h3 id="completion-awards-title" className="text-lg font-extrabold text-[var(--color-text)]">{t("awards.title")}</h3>
      <p className="mt-1 text-sm leading-6 text-[var(--color-text-subtle)]">{t("awards.description")}</p>
    </div>
    <div data-award-grid className="mt-5 grid min-w-0 gap-3 min-[700px]:grid-cols-2">
      {awards.map((award) => {
        const selected = award.candidates.find(({ playerId }) => playerId === award.selectedPlayerId);
        return <article data-award={award.award} key={award.award} className="min-w-0 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-control)] border border-[var(--color-border-strong)] text-[var(--color-brand-violet)]"><Award aria-hidden="true" className="size-5" /></span>
            <div className="min-w-0">
              <h4 className="font-extrabold text-[var(--color-text)]">{t(`awards.names.${award.award}`)}</h4>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-text-subtle)]">{t("awards.sourceMetric", { metric: award.metricLabel || t("awards.unavailable") })}</p>
            </div>
          </div>
          {award.candidates.length > 0 ? <ul aria-label={t("awards.candidatesLabel", { award: t(`awards.names.${award.award}`) })} className="mt-4 grid gap-2">
            {award.candidates.map((candidate) => <li key={candidate.playerId} className="flex min-w-0 items-start justify-between gap-3 border-t border-[var(--color-border)] pt-3 first:border-t-0 first:pt-0">
              <div className="min-w-0"><p className="break-words text-sm font-bold text-[var(--color-text)]">{candidate.playerName}</p><p className="break-words text-xs text-[var(--color-text-subtle)]">{candidate.teamName} · {candidate.valueLabel}</p></div>
              {candidate.playerId === award.selectedPlayerId ? <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-[var(--color-brand-cyan)]"><CheckCircle2 aria-hidden="true" className="size-4" />{t("awards.selected")}</span> : null}
            </li>)}
          </ul> : <p className="mt-4 text-sm text-[var(--color-text-subtle)]">{t("awards.unavailable")}</p>}
          {award.tied ? <div className="mt-4 rounded-[var(--radius-control)] border border-[var(--color-brand-cream)]/40 p-3">
            <p className="flex items-center gap-2 text-sm font-bold text-[var(--color-brand-cream)]"><Scale aria-hidden="true" className="size-4" />{t("awards.tieExplanation", { count: award.candidates.length })}</p>
            <p className="mt-2 text-xs leading-5 text-[var(--color-text-subtle)]">{award.decisionReason ? t("awards.auditReason", { reason: award.decisionReason }) : t("awards.reasonRequired")}</p>
          </div> : null}
          {!award.tied && selected ? <p className="mt-4 text-xs text-[var(--color-text-subtle)]">{t("awards.decisionRecorded")}</p> : null}
        </article>;
      })}
    </div>
  </section>;
}
