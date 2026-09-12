import { z } from "zod";
import { deriveAwardCandidates, type AwardCandidate, type CompletionStatistic } from "./awards";
import { evaluateCompletionReadiness, type CompletionAwardStatistic, type CompletionBlocker, type CompletionFacts } from "./readiness";

const awardNames = ["mvp", "top_scorer", "top_defender", "top_assist"] as const;
const mutationFields = {
  eventId: z.string().trim().min(1).max(200),
  expectedVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1),
  idempotencyKey: z.string().uuid(),
};
export const completeTournamentInputSchema = z.object({
  ...mutationFields,
  decisions: z.array(z.object({
    award: z.enum(awardNames), playerId: z.string().trim().min(1).max(200),
    reason: z.string().trim().max(2000).optional(),
  }).strict()).length(4).refine((rows) => new Set(rows.map((row) => row.award)).size === 4),
}).strict();
export const reopenTournamentInputSchema = z.object({
  ...mutationFields, reason: z.string().trim().min(1).max(2000),
}).strict();

export interface AwardDecisionInput {
  readonly award: CompletionAwardStatistic;
  readonly playerId: string;
  readonly reason?: string;
}
export interface CompletionActor {
  readonly id: string;
  readonly role: "organizer" | "platform_admin" | "admin";
}
export interface CompletionState {
  readonly status: "editable" | "completed";
  readonly version: number;
}
export interface CompletionSource {
  readonly facts: CompletionFacts;
  readonly statistics: readonly CompletionStatistic[];
  readonly teams: readonly { readonly id: string; readonly name: string }[];
}
export interface CompletionSnapshot {
  readonly eventId: string;
  readonly version: number;
  readonly actor: CompletionActor;
  readonly podium: readonly { readonly rank: 1 | 2 | 3; readonly teamId: string; readonly teamName: string }[];
  readonly awards: readonly { readonly award: CompletionAwardStatistic; readonly recipient: AwardCandidate; readonly candidates: readonly AwardCandidate[]; readonly reason: string | null }[];
  readonly source: CompletionSource;
}
export type CommittedCompletionResult =
  | { readonly status: "completed"; readonly eventId: string; readonly version: number; readonly snapshot: CompletionSnapshot }
  | { readonly status: "reopened"; readonly eventId: string; readonly version: number };
export type CompletionResult = CommittedCompletionResult
  | { readonly status: "already_applied"; readonly eventId: string; readonly version: number; readonly result: CommittedCompletionResult }
  | { readonly status: "blocked"; readonly code: "unauthorized" | "invalid_input" | "not_ready" | "invalid_decisions" | "tie_reason_required" | "competitive_locked" | "not_completed" | "source_incomplete"; readonly blockers?: readonly CompletionBlocker[] }
  | { readonly status: "conflict"; readonly version: number; readonly code: "stale_version" | "idempotency_key_reused" }
  | { readonly status: "integration_required" };
export interface CompletionMutation {
  readonly idempotencyKey: string;
  readonly fingerprint: string;
  readonly actor: CompletionActor;
  readonly reason: string | null;
  readonly result: CommittedCompletionResult;
}

/** Every method is scoped to the event locked by transaction(). */
export interface CompletionTransaction {
  /** Re-check the current session, manager role, password gate and event ownership. */
  authorize(): Promise<CompletionActor | null>;
  loadState(): Promise<CompletionState>;
  loadSource(): Promise<CompletionSource>;
  findMutation(idempotencyKey: string): Promise<CompletionMutation | null>;
  /** Append immutable snapshot/audit/idempotency records and change state/version atomically. */
  commit(mutation: CompletionMutation): Promise<void>;
}

/**
 * Match Day installs this server-only adapter without changing the four-argument API.
 * Serialize mutations and competitive source edits per event (including first completion),
 * read authoritative facts/stats inside the transaction, and roll back ALL writes on failure.
 * commit must retain historical snapshots after reopen; never overwrite a committed snapshot.
 * Authorization and idempotency lookup run within this same transaction.
 */
export interface CompletionDependencies {
  transaction<T>(eventId: string, work: (tx: CompletionTransaction) => Promise<T>): Promise<T>;
}

async function applyMutation(
  input: { eventId: string; expectedVersion: number; idempotencyKey: string },
  fingerprint: string,
  reason: string | null,
  dependencies: CompletionDependencies | undefined,
  createResult: (tx: CompletionTransaction, state: CompletionState, actor: CompletionActor) => Promise<CompletionResult>,
): Promise<CompletionResult> {
  // No Match Day persistence adapter is installed on this branch.
  if (!dependencies) return { status: "integration_required" };
  return dependencies.transaction(input.eventId, async (tx) => {
    const actor = await tx.authorize();
    if (!actor) return { status: "blocked", code: "unauthorized" };
    const state = await tx.loadState();
    const existing = await tx.findMutation(input.idempotencyKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint || existing.actor.id !== actor.id) {
        return { status: "conflict", version: state.version, code: "idempotency_key_reused" };
      }
      return { status: "already_applied", eventId: input.eventId, version: existing.result.version, result: structuredClone(existing.result) };
    }
    if (state.version !== input.expectedVersion) {
      return { status: "conflict", version: state.version, code: "stale_version" };
    }
    const result = await createResult(tx, state, actor);
    if (result.status === "completed" || result.status === "reopened") {
      await tx.commit(structuredClone({ idempotencyKey: input.idempotencyKey, fingerprint, actor, reason, result }));
    }
    return result;
  });
}

export async function completeTournament(
  eventId: string, decisions: readonly AwardDecisionInput[], expectedVersion: number,
  idempotencyKey: string, dependencies?: CompletionDependencies,
): Promise<CompletionResult> {
  const parsed = completeTournamentInputSchema.safeParse({ eventId, decisions, expectedVersion, idempotencyKey });
  if (!parsed.success) return { status: "blocked", code: "invalid_input" };
  const input = parsed.data;
  const orderedDecisions = awardNames.map((award) => {
    const decision = input.decisions.find((row) => row.award === award)!;
    return { award, playerId: decision.playerId, reason: decision.reason || null };
  });
  const fingerprint = JSON.stringify({ action: "complete", expectedVersion, decisions: orderedDecisions });
  return applyMutation(input, fingerprint, null, dependencies, async (tx, state, actor) => {
    if (!guardCompetitiveEdit(state).allowed) return { status: "blocked", code: "competitive_locked" };
    const loaded = await tx.loadSource();
    // Keep the audit JSON finite and detached from mutable repository objects.
    const source = structuredClone({ ...loaded, statistics: loaded.statistics.filter((row) =>
      row.status === "published" && row.validated && Number.isFinite(row.value) && row.value >= 0) });
    const candidates = deriveAwardCandidates(source.statistics);
    const readiness = evaluateCompletionReadiness({
      ...source.facts,
      validatedAwardStatistics: source.facts.validatedAwardStatistics.filter((award) => candidates[award].length > 0),
    });
    if (!readiness.ready || !readiness.podium) return { status: "blocked", code: "not_ready", blockers: readiness.blockers };
    const selectedAwards: CompletionSnapshot["awards"][number][] = [];
    for (const decision of orderedDecisions) {
      const top = candidates[decision.award];
      const recipient = top.find((candidate) => candidate.playerId === decision.playerId);
      if (!recipient) return { status: "blocked", code: "invalid_decisions" };
      if (top.length > 1 && !decision.reason) return { status: "blocked", code: "tie_reason_required" };
      selectedAwards.push({ award: decision.award, recipient, candidates: top, reason: decision.reason });
    }
    const teamIds = [readiness.podium.championTeamId, readiness.podium.runnerUpTeamId, readiness.podium.thirdPlaceTeamId];
    const podium: CompletionSnapshot["podium"][number][] = [];
    for (const [index, teamId] of teamIds.entries()) {
      const team = source.teams.find((row) => row.id === teamId);
      if (!team?.name.trim()) return { status: "blocked", code: "source_incomplete" };
      podium.push({ rank: (index + 1) as 1 | 2 | 3, teamId, teamName: team.name });
    }
    const version = state.version + 1;
    const snapshot: CompletionSnapshot = { eventId: input.eventId, version, actor: { ...actor }, podium, awards: selectedAwards, source };
    return { status: "completed", eventId: input.eventId, version, snapshot };
  });
}

export async function reopenTournament(
  eventId: string, reason: string, expectedVersion: number,
  idempotencyKey: string, dependencies?: CompletionDependencies,
): Promise<CompletionResult> {
  const parsed = reopenTournamentInputSchema.safeParse({ eventId, reason, expectedVersion, idempotencyKey });
  if (!parsed.success) return { status: "blocked", code: "invalid_input" };
  const input = parsed.data;
  const fingerprint = JSON.stringify({ action: "reopen", expectedVersion, reason: input.reason });
  return applyMutation(input, fingerprint, input.reason, dependencies, async (_tx, state) => {
    if (state.status !== "completed") return { status: "blocked", code: "not_completed" };
    return { status: "reopened", eventId: input.eventId, version: state.version + 1 };
  });
}

/** Match Day must call this using state read under its competitive-edit transaction lock. */
export function guardCompetitiveEdit(state: CompletionState): { allowed: true } | { allowed: false; code: "competitive_locked" } {
  return state.status === "completed" ? { allowed: false, code: "competitive_locked" } : { allowed: true };
}
