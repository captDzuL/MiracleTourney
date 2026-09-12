import { AlertTriangle, CheckCircle2, PlugZap } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import type { CompletionWorkspaceBlocker, CompletionWorkspaceState } from "@/lib/completion/workspace";

type ReadinessChecklistProps = {
  actionBlockerMessage?: string | null;
  state: CompletionWorkspaceState;
  blockers?: readonly CompletionWorkspaceBlocker[];
  onRepairTarget?: (target: "awards") => void;
};

export function ReadinessChecklist({ actionBlockerMessage, blockers: blockersOverride, onRepairTarget, state }: ReadinessChecklistProps) {
  const t = useTranslations("completionWorkspace");

  if (state.status === "integration_required") {
    return <section aria-labelledby="completion-integration-title" className="rounded-[var(--radius-panel)] border border-[var(--color-brand-violet)]/45 bg-[var(--color-surface)] p-5 min-[700px]:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full border border-[var(--color-brand-violet)]/50 bg-[var(--color-surface-subtle)] text-[var(--color-accent-violet-foreground)]">
          <PlugZap aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <h3 id="completion-integration-title" className="text-lg font-extrabold text-[var(--color-text)]">{t("readiness.integrationTitle")}</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{t("readiness.integrationBody")}</p>
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.1em] text-[var(--color-accent-cream-foreground)]">{t("readiness.noDemoData")}</p>
        </div>
      </div>
    </section>;
  }

  const blockers = blockersOverride ?? state.blockers;

  return <section aria-labelledby="completion-readiness-title" className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 min-[700px]:p-6">
    <div>
      <h3 id="completion-readiness-title" className="text-lg font-extrabold text-[var(--color-text)]">{t("readiness.title")}</h3>
      <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">{t("readiness.description")}</p>
    </div>
    {actionBlockerMessage ? <p className="mt-4 rounded-[var(--radius-control)] border border-[var(--color-accent-cream-foreground)] bg-[var(--color-surface-subtle)] p-3 text-sm font-bold text-[var(--color-text)]" data-refresh-action-blocker>{actionBlockerMessage}</p> : null}
    {blockers.length === 0 && !actionBlockerMessage
      ? <div className="mt-5 flex items-start gap-3 rounded-[var(--radius-control)] border border-[var(--color-brand-cyan)]/35 bg-[var(--color-surface-subtle)] p-4">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[var(--color-accent-cyan-foreground)]" />
          <div><p className="font-bold text-[var(--color-text)]">{t("readiness.readyTitle")}</p><p className="mt-1 text-sm text-[var(--color-text-muted)]">{t("readiness.readyBody")}</p></div>
        </div>
      : blockers.length > 0 ? <ul className="mt-5 grid gap-3">
          {blockers.map((blocker, index) => <li data-blocker={blocker.code} key={`${blocker.code}-${index}`} className="grid min-w-0 gap-3 rounded-[var(--radius-control)] border border-[var(--color-brand-cream)]/40 bg-[var(--color-surface-subtle)] p-4 min-[700px]:grid-cols-[auto_minmax(0,1fr)_auto] min-[700px]:items-center">
            <AlertTriangle aria-hidden="true" className="size-5 shrink-0 text-[var(--color-accent-cream-foreground)]" />
            <div className="min-w-0">
              <p className="font-bold text-[var(--color-text)]">{t(`blockers.${blocker.code}.title`)}</p>
              <p className="mt-1 break-words text-sm leading-6 text-[var(--color-text-muted)]">{t(`blockers.${blocker.code}.detail`, { subject: blocker.subject })}</p>
            </div>
            {blocker.repairTarget ? <button className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] px-3 text-sm font-extrabold text-[var(--color-accent-cyan-foreground)] miracle-focus-ring" data-repair-target={blocker.repairTarget} onClick={() => onRepairTarget?.("awards")} type="button">{t("blockers.repairAwards")}</button>
              : blocker.repairHref ? <Link className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] px-3 text-sm font-extrabold text-[var(--color-accent-cyan-foreground)] miracle-focus-ring" href={blocker.repairHref}>{t("blockers.repair")}</Link> : null}
          </li>)}
        </ul> : null}
  </section>;
}
