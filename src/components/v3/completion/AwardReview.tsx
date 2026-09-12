import { Award, Scale } from "lucide-react";
import { useTranslations } from "next-intl";

import type { CompletionAwardSummary } from "@/lib/completion/workspace";

type AwardReviewProps = {
  actionBlockerMessage: string | null;
  awards: readonly CompletionAwardSummary[];
  decisions: Readonly<Record<CompletionAwardSummary["award"], AwardReviewDecision>>;
  onDecisionChange: (award: CompletionAwardSummary["award"], decision: AwardReviewDecision) => void;
  readOnly: boolean;
};

export type AwardReviewDecision = {
  readonly playerId: string | null;
  readonly reason: string;
};

export function AwardReview({ actionBlockerMessage, awards, decisions, onDecisionChange, readOnly }: AwardReviewProps) {
  const t = useTranslations("completionWorkspace");

  return <section aria-labelledby="completion-awards-title" className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 min-[700px]:p-6">
    <div>
      <h3 id="completion-awards-title" className="text-lg font-extrabold text-[var(--color-text)]">{t("awards.title")}</h3>
      <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">{t("awards.description")}</p>
    </div>
    {actionBlockerMessage ? <p className="mt-4 rounded-[var(--radius-control)] border border-[var(--color-accent-cream-foreground)] bg-[var(--color-surface-subtle)] p-3 text-sm font-bold text-[var(--color-text)]" data-award-action-blocker role="alert">{actionBlockerMessage}</p> : null}
    <div data-award-grid className="mt-5 grid min-w-0 gap-3 min-[700px]:grid-cols-2">
      {awards.map((award) => {
        const decision = decisions[award.award];
        const selected = award.candidates.find(({ playerId }) => playerId === decision.playerId);
        return <article data-award={award.award} key={award.award} className="min-w-0 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-control)] border border-[var(--color-border-strong)] text-[var(--color-accent-violet-foreground)]"><Award aria-hidden="true" className="size-5" /></span>
            <div className="min-w-0">
              <h4 className="font-extrabold text-[var(--color-text)]">{t(`awards.names.${award.award}`)}</h4>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">{t("awards.sourceMetric", { metric: award.metricLabel || t("awards.unavailable") })}</p>
            </div>
          </div>
          {award.candidates.length > 0 ? <ul aria-label={t("awards.candidatesLabel", { award: t(`awards.names.${award.award}`) })} className="mt-4 grid gap-2" role="radiogroup">
            {award.candidates.map((candidate) => <li key={candidate.playerId} className="border-t border-[var(--color-border)] pt-3 first:border-t-0 first:pt-0">
              <label className={`flex min-h-11 min-w-0 items-start gap-3 rounded-[var(--radius-control)] miracle-focus-within-ring ${readOnly ? "cursor-default" : "cursor-pointer"}`}>
                <input checked={candidate.playerId === decision.playerId} className="mt-1 size-4 shrink-0 accent-[var(--color-brand-violet)]" disabled={readOnly} name={`award-${award.award}`} onChange={() => onDecisionChange(award.award, { ...decision, playerId: candidate.playerId })} type="radio" value={candidate.playerId} />
                <span className="min-w-0"><span className="block break-words text-sm font-bold text-[var(--color-text)]">{candidate.playerName}</span><span className="block break-words text-xs text-[var(--color-text-muted)]">{candidate.teamName} · {candidate.valueLabel}</span></span>
              </label>
            </li>)}
          </ul> : <p className="mt-4 text-sm text-[var(--color-text-muted)]">{t("awards.unavailable")}</p>}
          {award.tied ? <div className="mt-4 rounded-[var(--radius-control)] border border-[var(--color-brand-cream)]/40 p-3">
            <p className="flex items-center gap-2 text-sm font-bold text-[var(--color-accent-cream-foreground)]"><Scale aria-hidden="true" className="size-4" />{t("awards.tieExplanation", { count: award.candidates.length })}</p>
            <label className="mt-3 block text-xs font-bold text-[var(--color-text)]" htmlFor={`awardReason-${award.award}`}>{t("awards.reasonLabel")}</label>
            <textarea aria-readonly={readOnly} className="mt-2 min-h-24 w-full resize-y rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-3 text-sm text-[var(--color-text)] miracle-focus-ring read-only:cursor-default read-only:bg-[var(--color-surface-selected)]" id={`awardReason-${award.award}`} maxLength={2000} name={`awardReason-${award.award}`} onChange={(event) => onDecisionChange(award.award, { ...decision, reason: event.target.value })} readOnly={readOnly} required={!readOnly} value={decision.reason} />
            <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">{decision.reason.trim() ? t("awards.auditReason", { reason: decision.reason.trim() }) : t("awards.reasonRequired")}</p>
          </div> : null}
          {!award.tied && selected ? <p className="mt-4 text-xs text-[var(--color-text-muted)]">{t("awards.decisionRecorded")}</p> : null}
        </article>;
      })}
    </div>
  </section>;
}
