"use client";

import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { ClipboardCheck, FileBadge2, Globe2, RotateCcw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { completeTournamentAction, reopenTournamentAction, type CompletionActionResult } from "@/lib/actions/completion-v3-actions";
import type { AwardDecisionInput } from "@/lib/completion/complete";
import type { CompletionAwardStatistic, CompletionBlocker } from "@/lib/completion/readiness";
import type { CompletionWorkspaceBlocker, CompletionWorkspaceState } from "@/lib/completion/workspace";
import { AwardReview, type AwardReviewDecision } from "./AwardReview";
import { PodiumPreview } from "./PodiumPreview";
import { ReadinessChecklist } from "./ReadinessChecklist";

export type { CompletionWorkspaceState } from "@/lib/completion/workspace";

type CompletionTab = "readiness" | "awards" | "certificates" | "publication";
type AwardActionBlocker = "invalid_decisions" | "tie_reason_required";
type RefreshRequiredOutcome = AwardActionBlocker
  | "not_ready"
  | "source_incomplete"
  | "competitive_locked"
  | "not_completed"
  | "conflict"
  | "integration_required";
type RefreshRequiredAction = {
  readonly action: "complete" | "reopen";
  readonly message: string;
  readonly outcome: RefreshRequiredOutcome;
};

type CompletionWorkspaceProps = {
  state: CompletionWorkspaceState;
  completionIdempotencyKey: string;
  reopenIdempotencyKey: string;
  completeAction?: typeof completeTournamentAction;
  reopenAction?: typeof reopenTournamentAction;
};

const TABS: readonly CompletionTab[] = ["readiness", "awards", "certificates", "publication"];
const DECISION_BLOCKER_CODES = new Set(["MISSING_AWARD_DECISION", "TIE_REASON_REQUIRED"]);

type AwardDecisions = Record<CompletionAwardStatistic, AwardReviewDecision>;

function initialAwardDecisions(state: CompletionWorkspaceState): AwardDecisions {
  const decisions: AwardDecisions = {
    mvp: { playerId: null, reason: "" },
    top_scorer: { playerId: null, reason: "" },
    top_defender: { playerId: null, reason: "" },
    top_assist: { playerId: null, reason: "" },
  };
  if (state.status === "integration_required") return decisions;
  for (const award of state.awards) {
    decisions[award.award] = { playerId: award.selectedPlayerId, reason: award.decisionReason ?? "" };
  }
  return decisions;
}

function authoritativeStateKey(props: CompletionWorkspaceProps): string {
  return JSON.stringify({
    state: props.state,
    completionIdempotencyKey: props.completionIdempotencyKey,
    reopenIdempotencyKey: props.reopenIdempotencyKey,
  });
}

function refreshRequiredOutcome(result: CompletionActionResult): RefreshRequiredOutcome | null {
  if (result.status === "conflict" || result.status === "integration_required") return result.status;
  if (result.status !== "blocked") return null;
  switch (result.code) {
    case "not_ready":
    case "invalid_decisions":
    case "tie_reason_required":
    case "source_incomplete":
    case "competitive_locked":
    case "not_completed":
      return result.code;
    default:
      return null;
  }
}

export function CompletionWorkspace(props: CompletionWorkspaceProps) {
  return <CompletionWorkspaceForm key={authoritativeStateKey(props)} {...props} />;
}

function CompletionWorkspaceForm({
  state,
  completionIdempotencyKey,
  reopenIdempotencyKey,
  completeAction = completeTournamentAction,
  reopenAction = reopenTournamentAction,
}: CompletionWorkspaceProps) {
  const t = useTranslations("completionWorkspace");
  const router = useRouter();
  const integrationRequired = state.status === "integration_required";
  const [activeTab, setActiveTab] = useState<CompletionTab>("readiness");
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"complete" | "reopen" | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [awardDecisions, setAwardDecisions] = useState<AwardDecisions>(() => initialAwardDecisions(state));
  const [authoritativeBlockers, setAuthoritativeBlockers] = useState<readonly CompletionWorkspaceBlocker[]>(() => integrationRequired ? [] : state.blockers);
  const [refreshRequired, setRefreshRequired] = useState<RefreshRequiredAction | null>(null);
  const [terminalRefreshPending, setTerminalRefreshPending] = useState<"complete" | "reopen" | null>(null);
  const [isPending, startTransition] = useTransition();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const actionResultRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (actionResult) actionResultRef.current?.focus();
  }, [actionResult]);

  const decisions = integrationRequired ? [] : state.awards.flatMap<AwardDecisionInput>((award) => {
    const decision = awardDecisions[award.award];
    if (!decision.playerId) return [];
    return [{
      award: award.award,
      playerId: decision.playerId,
      ...(decision.reason.trim() ? { reason: decision.reason.trim() } : {}),
    }];
  });
  const serverBlockers = integrationRequired ? [] : authoritativeBlockers;
  const decisionBlockers = integrationRequired ? [] : state.awards.flatMap<CompletionWorkspaceBlocker>((award) => {
    const decision = awardDecisions[award.award];
    const subject = t(`awards.names.${award.award}`);
    if (!decision.playerId) return [{ code: "MISSING_AWARD_DECISION", subject, repairTarget: "awards" }];
    if (award.tied && !decision.reason.trim()) return [{ code: "TIE_REASON_REQUIRED", subject, repairTarget: "awards" }];
    return [];
  });
  const nonDecisionBlockers = serverBlockers.filter(({ code }) => !DECISION_BLOCKER_CODES.has(code));
  const visibleBlockers = [...nonDecisionBlockers, ...decisionBlockers];
  const awardActionBlocker = refreshRequired?.action === "complete"
    && (refreshRequired.outcome === "invalid_decisions" || refreshRequired.outcome === "tie_reason_required")
    ? refreshRequired.outcome
    : null;
  const readinessActionBlockerMessage = refreshRequired?.action === "complete" && !awardActionBlocker
    ? refreshRequired.message
    : null;
  const decisionRepairableState = state.status === "blocked"
    && authoritativeBlockers.length > 0
    && authoritativeBlockers.every(({ code }) => DECISION_BLOCKER_CODES.has(code));
  const canComplete = !integrationRequired
    && (state.status === "ready" || state.status === "reopened" || decisionRepairableState)
    && visibleBlockers.length === 0
    && refreshRequired?.action !== "complete"
    && terminalRefreshPending !== "complete"
    && decisions.length === 4;
  const canReopen = state.status === "completed"
    && refreshRequired?.action !== "reopen"
    && terminalRefreshPending !== "reopen";
  const terminalDisplayedStatus = terminalRefreshPending === "complete"
    ? "completed"
    : terminalRefreshPending === "reopen"
      ? "reopened"
      : null;
  const displayedStatus = terminalDisplayedStatus
    ?? (refreshRequired ? "blocked" : canComplete && state.status === "blocked" ? "ready" : state.status);

  function updateAwardDecision(award: CompletionAwardStatistic, decision: AwardReviewDecision) {
    setAwardDecisions((current) => ({ ...current, [award]: decision }));
  }

  function resultMessage(result: CompletionActionResult, action: "complete" | "reopen"): string {
    if (result.status === "completed") return t("feedback.completed");
    if (result.status === "reopened") return t("feedback.reopened");
    if (result.status === "already_applied") return t("feedback.alreadyApplied");
    if (result.status === "integration_required") return t("feedback.integrationRequired");
    if (result.status === "conflict") return t("feedback.conflict");
    if (result.code === "invalid_input") return action === "reopen" ? t("feedback.reasonRequired") : t("feedback.invalidInput");
    const messageByCode = {
      not_ready: "notReady",
      invalid_decisions: "invalidDecisions",
      tie_reason_required: "tieReasonRequired",
      source_incomplete: "sourceIncomplete",
      feature_disabled: "featureDisabled",
      unauthorized: "unauthorized",
      password_change_required: "passwordChangeRequired",
      forbidden: "forbidden",
      competitive_locked: "competitiveLocked",
      not_completed: "notCompleted",
    } as const;
    return t(`feedback.${messageByCode[result.code]}`);
  }

  function blockerFromResult(blocker: CompletionBlocker): CompletionWorkspaceBlocker {
    const repairHref = (query: string) => `${state.event.matchDayHref}?${query}`;
    switch (blocker.code) {
      case "UNOFFICIAL_REQUIRED_RESULT":
        return { code: blocker.code, subject: `${blocker.stage} · Match ${blocker.matchId}`, repairHref: repairHref(`match=${encodeURIComponent(blocker.matchId)}`) };
      case "ACTIVE_DISPUTE":
        return { code: blocker.code, subject: `Dispute ${blocker.disputeId}${blocker.matchId ? ` · Match ${blocker.matchId}` : ""}`, repairHref: repairHref(`dispute=${encodeURIComponent(blocker.disputeId)}`) };
      case "UNRESOLVED_FINAL_TIE":
        return { code: blocker.code, subject: blocker.teamIds.join(", "), repairHref: repairHref("view=standings") };
      case "MISSING_VALIDATED_AWARD_STATISTICS":
        return { code: blocker.code, subject: t(`awards.names.${blocker.award}`), repairHref: repairHref("view=statistics") };
      case "INSUFFICIENT_PODIUM_STRUCTURE": {
        const facts = [...(blocker.missingStages ?? []), ...(blocker.matchIds ?? []), ...(blocker.teamIds ?? [])];
        const prior = authoritativeBlockers.find(({ code }) => code === blocker.code);
        return { code: blocker.code, subject: facts.join(", ") || prior?.subject || t("blockers.unknownSubject"), repairHref: repairHref("view=results") };
      }
    }
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
        const message = resultMessage(result, "complete");
        if (result.status === "blocked" && result.code === "not_ready" && result.blockers) {
          setAuthoritativeBlockers(result.blockers.map(blockerFromResult));
          setActiveTab("readiness");
        } else if (result.status === "blocked" && (result.code === "invalid_decisions" || result.code === "tie_reason_required")) {
          setActiveTab("awards");
        } else if (result.status === "blocked" && (result.code === "source_incomplete" || result.code === "competitive_locked")) {
          setActiveTab("readiness");
        }
        const staleOutcome = refreshRequiredOutcome(result);
        if (staleOutcome) {
          setRefreshRequired({ action: "complete", message, outcome: staleOutcome });
          router.refresh();
        } else if (
          result.status === "completed"
          || (result.status === "already_applied" && result.result.status === "completed")
        ) {
          setTerminalRefreshPending("complete");
          router.refresh();
        }
        setActionResult(message);
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
        const message = resultMessage(result, "reopen");
        if (
          result.status === "reopened"
          || (result.status === "already_applied" && result.result.status === "reopened")
        ) {
          setTerminalRefreshPending("reopen");
          router.refresh();
        } else {
          const staleOutcome = refreshRequiredOutcome(result);
          if (staleOutcome) {
            setRefreshRequired({ action: "reopen", message, outcome: staleOutcome });
            router.refresh();
          }
        }
        setActionResult(message);
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
    if (tab === "readiness") return <ReadinessChecklist actionBlockerMessage={readinessActionBlockerMessage} blockers={visibleBlockers} onRepairTarget={(target) => setActiveTab(target)} state={state} />;
    if (integrationRequired) return <IntegrationUnavailablePanel title={t(`${tab}.title`)} waiting={t("integration.waiting")} />;
    if (tab === "awards") return <AwardReview
      actionBlockerMessage={awardActionBlocker ? refreshRequired?.message ?? null : null}
      awards={state.awards}
      decisions={awardDecisions}
      onDecisionChange={updateAwardDecision}
      readOnly={state.status === "completed" || awardActionBlocker !== null}
    />;
    if (tab === "certificates") return <section className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 min-[700px]:p-6">
      <FileBadge2 aria-hidden="true" className="size-7 text-[var(--color-accent-violet-foreground)]" />
      <h3 className="mt-4 text-lg font-extrabold">{t("certificates.title")}</h3>
      <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{t("certificates.summary", { generated: state.certificates.generated, total: state.certificates.total })}</p>
      <p className="mt-3 text-sm font-bold text-[var(--color-accent-cream-foreground)]">{t(`certificates.status.${state.certificates.status}`)}</p>
      <Link className="mt-5 inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-4 text-sm font-extrabold text-[var(--color-accent-cyan-foreground)] miracle-focus-ring" href={state.certificates.studioHref}>{t("certificates.openStudio")}</Link>
    </section>;
    return <section className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 min-[700px]:p-6">
      <Globe2 aria-hidden="true" className="size-7 text-[var(--color-accent-cyan-foreground)]" />
      <h3 className="mt-4 text-lg font-extrabold">{t("publication.title")}</h3>
      <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{t("publication.description")}</p>
      <p className="mt-3 text-sm font-bold text-[var(--color-accent-cream-foreground)]">{t(`publication.status.${state.publication.status}`)}</p>
      <Link className="mt-5 inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-4 text-sm font-extrabold text-[var(--color-accent-cyan-foreground)] miracle-focus-ring" href={state.publication.previewHref}>{t("publication.preview")}</Link>
    </section>;
  }

  const resolvedAwards = integrationRequired ? null : Object.values(awardDecisions).filter(({ playerId }) => playerId).length;
  const unavailable = t("integration.waiting");
  return <main data-completion-workspace className="min-w-0 max-w-full overflow-x-clip font-[family-name:var(--font-miracle-v3)] text-[var(--color-text)] [&_h1]:font-[family-name:var(--font-miracle-v3)] [&_h2]:font-[family-name:var(--font-miracle-v3)] [&_h3]:font-[family-name:var(--font-miracle-v3)] [&_h4]:font-[family-name:var(--font-miracle-v3)]">
    <header className="flex min-w-0 flex-col gap-4 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 min-[700px]:flex-row min-[700px]:items-end min-[700px]:justify-between min-[700px]:p-7">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-accent-cream-foreground)]">{state.event.formatLabel}</p>
        <h1 className="mt-2 break-words text-2xl font-extrabold min-[700px]:text-3xl">{t("title")}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--color-text-muted)]">{t("description", { event: state.event.name })}</p>
      </div>
      <span data-completion-status={displayedStatus} className="inline-flex min-h-11 w-fit items-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-subtle)] px-4 text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--color-accent-cyan-foreground)]">{t(`status.${displayedStatus}`)}</span>
    </header>

    <nav aria-label={t("tabs.label")} className="mt-4 min-w-0 overflow-x-auto rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface-subtle)] p-1">
      <div role="tablist" className="grid min-w-[34rem] grid-cols-4 gap-1 min-[700px]:min-w-0">
        {TABS.map((tab, index) => <button
          aria-controls={`completion-panel-${tab}`}
          aria-selected={activeTab === tab}
          className="min-h-11 rounded-[var(--radius-control)] px-3 text-sm font-bold text-[var(--color-text-muted)] transition-colors miracle-focus-ring hover:text-[var(--color-text)] aria-[selected=true]:bg-[var(--color-surface-selected)] aria-[selected=true]:text-[var(--color-text)]"
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
      <Kpi label={t("kpis.blockers")} value={integrationRequired ? unavailable : String(visibleBlockers.length + (refreshRequired ? 1 : 0))} />
      <Kpi label={t("kpis.awards")} value={integrationRequired ? unavailable : `${resolvedAwards} / 4`} />
      <Kpi label={t("kpis.certificates")} value={integrationRequired ? unavailable : `${state.certificates.generated} / ${state.certificates.total}`} />
      <Kpi label={t("kpis.version")} value={integrationRequired ? unavailable : String(state.version)} />
    </section>

    <div data-completion-layout className="mt-4 grid min-w-0 gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0">
        {TABS.map((tab) => <div aria-labelledby={`completion-tab-${tab}`} hidden={activeTab !== tab} id={`completion-panel-${tab}`} key={tab} role="tabpanel" tabIndex={0}>{panel(tab)}</div>)}
      </div>

      <aside className="grid min-w-0 content-start gap-4">
        <PodiumPreview podium={state.podium} />
        <section aria-labelledby="completion-audit-title" className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <ShieldCheck aria-hidden="true" className="size-5 text-[var(--color-accent-cyan-foreground)]" />
          <h3 id="completion-audit-title" className="mt-3 font-extrabold">{t("audit.title")}</h3>
          <p className="mt-2 break-words text-xs leading-5 text-[var(--color-text-muted)]">{integrationRequired ? unavailable : state.audit.summary || t("audit.none")}</p>
          {!integrationRequired && state.audit.actorLabel ? <p className="mt-3 text-xs font-bold text-[var(--color-text)]">{t("audit.actor", { actor: state.audit.actorLabel })}</p> : null}
        </section>
        <section aria-labelledby="completion-actions-title" className="rounded-[var(--radius-panel)] border border-[var(--color-brand-cream)]/35 bg-[var(--color-surface)] p-5">
          <ClipboardCheck aria-hidden="true" className="size-5 text-[var(--color-accent-cream-foreground)]" />
          <h3 id="completion-actions-title" className="mt-3 font-extrabold">{t("actions.title")}</h3>
          <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">{t("actions.description")}</p>
          <label className="mt-4 block text-xs font-bold text-[var(--color-text)]" htmlFor="completion-reopen-reason">{t("actions.reopenReason")}</label>
          <textarea className="mt-2 min-h-24 w-full resize-y rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface-subtle)] p-3 text-sm miracle-focus-ring disabled:cursor-not-allowed disabled:bg-[var(--color-surface-selected)] disabled:text-[var(--color-text-muted)]" disabled={!canReopen || isPending} id="completion-reopen-reason" name="reopenReason" onChange={(event) => setReopenReason(event.target.value)} value={reopenReason} />
          <div data-completion-actions className="mt-4 grid min-w-0 gap-3 min-[700px]:grid-cols-2 min-[1100px]:grid-cols-1">
            <button className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-brand-violet)] px-4 text-sm font-extrabold text-[var(--color-on-accent)] transition-colors miracle-focus-ring disabled:cursor-not-allowed disabled:bg-[var(--color-surface-selected)] disabled:text-[var(--color-text)]" data-complete-tournament disabled={!canComplete || isPending} onClick={runComplete} type="button">{isPending && pendingAction === "complete" ? t("actions.completing") : t("actions.complete")}</button>
            <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-4 text-sm font-extrabold text-[var(--color-text)] transition-colors miracle-focus-ring disabled:cursor-not-allowed disabled:bg-[var(--color-surface-selected)] disabled:text-[var(--color-text-muted)]" data-reopen-tournament disabled={!canReopen || isPending} onClick={runReopen} type="button"><RotateCcw aria-hidden="true" className="size-4" />{isPending && pendingAction === "reopen" ? t("actions.reopening") : t("actions.reopen")}</button>
          </div>
          {actionResult ? <p aria-live="polite" className="mt-4 rounded-[var(--radius-control)] bg-[var(--color-surface-subtle)] p-3 text-sm font-semibold text-[var(--color-text)] miracle-focus-ring" data-action-result ref={actionResultRef} role="status" tabIndex={-1}>{actionResult}</p> : null}
        </section>
      </aside>
    </div>
  </main>;
}

function IntegrationUnavailablePanel({ title, waiting }: { title: string; waiting: string }) {
  return <section className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 min-[700px]:p-6">
    <h3 className="text-lg font-extrabold text-[var(--color-text)]">{title}</h3>
    <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">{waiting}</p>
  </section>;
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <article className="min-w-0 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4">
    <p className="break-words text-xs font-semibold text-[var(--color-text-muted)]">{label}</p>
    <p className="mt-2 text-xl font-extrabold text-[var(--color-text)]">{value}</p>
  </article>;
}
