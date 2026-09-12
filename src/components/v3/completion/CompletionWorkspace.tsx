"use client";

import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { ClipboardCheck, FileBadge2, Globe2, RotateCcw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { completeTournamentAction, reopenTournamentAction, type CompletionActionResult } from "@/lib/actions/completion-v3-actions";
import type { AwardDecisionInput } from "@/lib/completion/complete";
import type { CompletionWorkspaceState } from "@/lib/completion/workspace";
import { AwardReview } from "./AwardReview";
import { PodiumPreview } from "./PodiumPreview";
import { ReadinessChecklist } from "./ReadinessChecklist";

export type { CompletionWorkspaceState } from "@/lib/completion/workspace";

type CompletionTab = "readiness" | "awards" | "certificates" | "publication";

type CompletionWorkspaceProps = {
  state: CompletionWorkspaceState;
  completionIdempotencyKey: string;
  reopenIdempotencyKey: string;
  completeAction?: typeof completeTournamentAction;
  reopenAction?: typeof reopenTournamentAction;
};

const TABS: readonly CompletionTab[] = ["readiness", "awards", "certificates", "publication"];

export function CompletionWorkspace({
  state,
  completionIdempotencyKey,
  reopenIdempotencyKey,
  completeAction = completeTournamentAction,
  reopenAction = reopenTournamentAction,
}: CompletionWorkspaceProps) {
  const t = useTranslations("completionWorkspace");
  const [activeTab, setActiveTab] = useState<CompletionTab>("readiness");
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"complete" | "reopen" | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const actionResultRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (actionResult) actionResultRef.current?.focus();
  }, [actionResult]);

  const decisions = state.awards.flatMap<AwardDecisionInput>((award) => {
    if (!award.selectedPlayerId) return [];
    return [{
      award: award.award,
      playerId: award.selectedPlayerId,
      ...(award.decisionReason ? { reason: award.decisionReason } : {}),
    }];
  });
  const canComplete = (state.status === "ready" || state.status === "reopened")
    && state.blockers.length === 0
    && decisions.length === 4;
  const canReopen = state.status === "completed";

  function resultMessage(result: CompletionActionResult, action: "complete" | "reopen"): string {
    if (result.status === "completed") return t("feedback.completed");
    if (result.status === "reopened") return t("feedback.reopened");
    if (result.status === "already_applied") return t("feedback.alreadyApplied");
    if (result.status === "integration_required") return t("feedback.integrationRequired");
    if (result.status === "conflict") return t("feedback.conflict");
    if (result.code === "invalid_input" && action === "reopen") return t("feedback.reasonRequired");
    return t("feedback.blocked");
  }

  function runComplete() {
    if (!canComplete || isPending) return;
    setActionResult(null);
    setPendingAction("complete");
    startTransition(async () => {
      try {
        const result = await completeAction({
          eventId: state.event.id,
          decisions,
          expectedVersion: state.version,
          idempotencyKey: completionIdempotencyKey,
        });
        setActionResult(resultMessage(result, "complete"));
      } catch {
        setActionResult(t("feedback.failed"));
      } finally {
        setPendingAction(null);
      }
    });
  }

  function runReopen() {
    if (!canReopen || isPending) return;
    if (!reopenReason.trim()) {
      setActionResult(t("feedback.reasonRequired"));
      return;
    }
    setActionResult(null);
    setPendingAction("reopen");
    startTransition(async () => {
      try {
        const result = await reopenAction({
          eventId: state.event.id,
          expectedVersion: state.version,
          idempotencyKey: reopenIdempotencyKey,
          reason: reopenReason.trim(),
        });
        setActionResult(resultMessage(result, "reopen"));
      } catch {
        setActionResult(t("feedback.failed"));
      } finally {
        setPendingAction(null);
      }
    });
  }

  function moveTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % TABS.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + TABS.length) % TABS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = TABS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    setActiveTab(TABS[nextIndex]);
    tabRefs.current[nextIndex]?.focus();
  }

  function panel(tab: CompletionTab) {
    if (tab === "readiness") return <ReadinessChecklist state={state} />;
    if (tab === "awards") return <AwardReview awards={state.awards} />;
    if (tab === "certificates") return <section className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 min-[700px]:p-6">
      <FileBadge2 aria-hidden="true" className="size-7 text-[var(--color-brand-violet)]" />
      <h3 className="mt-4 text-lg font-extrabold">{t("certificates.title")}</h3>
      <p className="mt-2 text-sm leading-6 text-[var(--color-text-subtle)]">{t("certificates.summary", { generated: state.certificates.generated, total: state.certificates.total })}</p>
      <p className="mt-3 text-sm font-bold text-[var(--color-brand-cream)]">{t(`certificates.status.${state.certificates.status}`)}</p>
      <Link className="mt-5 inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-4 text-sm font-extrabold text-[var(--color-brand-cyan)] miracle-focus-ring" href={state.certificates.studioHref}>{t("certificates.openStudio")}</Link>
    </section>;
    return <section className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 min-[700px]:p-6">
      <Globe2 aria-hidden="true" className="size-7 text-[var(--color-brand-cyan)]" />
      <h3 className="mt-4 text-lg font-extrabold">{t("publication.title")}</h3>
      <p className="mt-2 text-sm leading-6 text-[var(--color-text-subtle)]">{t("publication.description")}</p>
      <p className="mt-3 text-sm font-bold text-[var(--color-brand-cream)]">{t(`publication.status.${state.publication.status}`)}</p>
      <Link className="mt-5 inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-4 text-sm font-extrabold text-[var(--color-brand-cyan)] miracle-focus-ring" href={state.publication.previewHref}>{t("publication.preview")}</Link>
    </section>;
  }

  const resolvedAwards = state.awards.filter(({ selectedPlayerId }) => selectedPlayerId).length;
  return <main data-completion-workspace className="min-w-0 max-w-full overflow-x-clip font-[family-name:var(--font-miracle-v3)] text-[var(--color-text)] [&_h1]:font-[family-name:var(--font-miracle-v3)] [&_h2]:font-[family-name:var(--font-miracle-v3)] [&_h3]:font-[family-name:var(--font-miracle-v3)] [&_h4]:font-[family-name:var(--font-miracle-v3)]">
    <header className="flex min-w-0 flex-col gap-4 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 min-[700px]:flex-row min-[700px]:items-end min-[700px]:justify-between min-[700px]:p-7">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-brand-cream)]">{state.event.formatLabel}</p>
        <h1 className="mt-2 break-words text-2xl font-extrabold min-[700px]:text-3xl">{t("title")}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--color-text-subtle)]">{t("description", { event: state.event.name })}</p>
      </div>
      <span data-completion-status={state.status} className="inline-flex min-h-11 w-fit items-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-subtle)] px-4 text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--color-brand-cyan)]">{t(`status.${state.status}`)}</span>
    </header>

    <nav aria-label={t("tabs.label")} className="mt-4 min-w-0 overflow-x-auto rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-1">
      <div role="tablist" className="grid min-w-[34rem] grid-cols-4 gap-1 min-[700px]:min-w-0">
        {TABS.map((tab, index) => <button
          aria-controls={`completion-panel-${tab}`}
          aria-selected={activeTab === tab}
          className="min-h-11 rounded-[var(--radius-control)] px-3 text-sm font-bold text-[var(--color-text-subtle)] transition-colors miracle-focus-ring hover:text-[var(--color-text)] aria-[selected=true]:bg-[var(--color-surface-strong)] aria-[selected=true]:text-[var(--color-text)]"
          id={`completion-tab-${tab}`}
          key={tab}
          onClick={() => setActiveTab(tab)}
          onKeyDown={(event) => moveTab(event, index)}
          ref={(node) => { tabRefs.current[index] = node; }}
          role="tab"
          tabIndex={activeTab === tab ? 0 : -1}
          type="button"
        >{t(`tabs.${tab}`)}</button>)}
      </div>
    </nav>

    <section aria-label={t("kpis.label")} data-completion-kpis className="mt-4 grid min-w-0 grid-cols-2 gap-3 min-[700px]:grid-cols-4">
      <Kpi label={t("kpis.blockers")} value={String(state.blockers.length)} />
      <Kpi label={t("kpis.awards")} value={`${resolvedAwards} / 4`} />
      <Kpi label={t("kpis.certificates")} value={`${state.certificates.generated} / ${state.certificates.total}`} />
      <Kpi label={t("kpis.version")} value={String(state.version)} />
    </section>

    <div data-completion-layout className="mt-4 grid min-w-0 gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0">
        {TABS.map((tab) => <div aria-labelledby={`completion-tab-${tab}`} hidden={activeTab !== tab} id={`completion-panel-${tab}`} key={tab} role="tabpanel" tabIndex={0}>{panel(tab)}</div>)}
      </div>

      <aside className="grid min-w-0 content-start gap-4">
        <PodiumPreview podium={state.podium} />
        <section aria-labelledby="completion-audit-title" className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <ShieldCheck aria-hidden="true" className="size-5 text-[var(--color-brand-cyan)]" />
          <h3 id="completion-audit-title" className="mt-3 font-extrabold">{t("audit.title")}</h3>
          <p className="mt-2 break-words text-xs leading-5 text-[var(--color-text-subtle)]">{state.audit.summary || t("audit.none")}</p>
          {state.audit.actorLabel ? <p className="mt-3 text-xs font-bold text-[var(--color-text)]">{t("audit.actor", { actor: state.audit.actorLabel })}</p> : null}
        </section>
        <section aria-labelledby="completion-actions-title" className="rounded-[var(--radius-panel)] border border-[var(--color-brand-cream)]/35 bg-[var(--color-surface)] p-5">
          <ClipboardCheck aria-hidden="true" className="size-5 text-[var(--color-brand-cream)]" />
          <h3 id="completion-actions-title" className="mt-3 font-extrabold">{t("actions.title")}</h3>
          <p className="mt-2 text-xs leading-5 text-[var(--color-text-subtle)]">{t("actions.description")}</p>
          <label className="mt-4 block text-xs font-bold text-[var(--color-text)]" htmlFor="completion-reopen-reason">{t("actions.reopenReason")}</label>
          <textarea className="mt-2 min-h-24 w-full resize-y rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-3 text-sm miracle-focus-ring disabled:cursor-not-allowed disabled:opacity-50" disabled={!canReopen || isPending} id="completion-reopen-reason" name="reopenReason" onChange={(event) => setReopenReason(event.target.value)} value={reopenReason} />
          <div data-completion-actions className="mt-4 grid min-w-0 gap-3 min-[700px]:grid-cols-2 min-[1100px]:grid-cols-1">
            <button className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-brand-violet)] px-4 text-sm font-extrabold text-white transition-colors miracle-focus-ring disabled:cursor-not-allowed disabled:opacity-45" data-complete-tournament disabled={!canComplete || isPending} onClick={runComplete} type="button">{isPending && pendingAction === "complete" ? t("actions.completing") : t("actions.complete")}</button>
            <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-4 text-sm font-extrabold text-[var(--color-text)] transition-colors miracle-focus-ring disabled:cursor-not-allowed disabled:opacity-45" data-reopen-tournament disabled={!canReopen || isPending} onClick={runReopen} type="button"><RotateCcw aria-hidden="true" className="size-4" />{isPending && pendingAction === "reopen" ? t("actions.reopening") : t("actions.reopen")}</button>
          </div>
          {actionResult ? <p aria-live="polite" className="mt-4 rounded-[var(--radius-control)] bg-[var(--color-surface-subtle)] p-3 text-sm font-semibold text-[var(--color-text)] miracle-focus-ring" data-action-result ref={actionResultRef} role="status" tabIndex={-1}>{actionResult}</p> : null}
        </section>
      </aside>
    </div>
  </main>;
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <article className="min-w-0 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4">
    <p className="break-words text-xs font-semibold text-[var(--color-text-subtle)]">{label}</p>
    <p className="mt-2 text-xl font-extrabold text-[var(--color-text)]">{value}</p>
  </article>;
}
