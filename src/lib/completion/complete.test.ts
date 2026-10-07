import { describe, expect, it } from "vitest";
import {
  completeTournament, guardCompetitiveEdit, reopenTournament,
  type AwardDecisionInput, type CompletionActor, type CompletionDependencies,
  type CompletionMutation, type CompletionSnapshot, type CompletionSource,
  type CompletionState, type CompletionTransaction,
} from "./complete";

const key = "11111111-1111-4111-8111-111111111111";
const nextKey = "22222222-2222-4222-8222-222222222222";
const awards = ["mvp", "top_scorer", "top_defender", "top_assist"] as const;
const decisions: AwardDecisionInput[] = awards.map((award) => ({ award, playerId: "player-a" }));
function source(): CompletionSource {
  return {
    facts: {
      formatKind: "single_elimination",
      matches: [
        { id: "final", stage: "final", official: true, winnerTeamId: "team-a", loserTeamId: "team-b", revision: 1 },
        { id: "third", stage: "third_place", official: true, winnerTeamId: "team-c", loserTeamId: "team-d", revision: 1 },
      ], standings: [], activeDisputes: [], validatedAwardStatistics: [...awards],
    },
    statistics: awards.map((award) => ({ award, playerId: "player-a", playerName: "Ari", teamId: "team-a", teamName: "Alpha", value: 5, validated: true, status: "published" })),
    teams: [{ id: "team-a", name: "Alpha" }, { id: "team-b", name: "Beta" }, { id: "team-c", name: "Gamma" }],
  };
}

// Real state/transaction behavior: isolated drafts, serialized calls, commit and rollback.
// Removing the service's commit, replay, validation or version checks changes observable data.
class MemoryCompletionStore implements CompletionDependencies {
  state: CompletionState = { status: "editable", version: 0 };
  source = source();
  actor: CompletionActor | null = { id: "organizer-1", role: "organizer" };
  snapshots: CompletionSnapshot[] = [];
  mutations: CompletionMutation[] = [];
  failCommit = false;
  onTransaction?: () => void;
  private queue: Promise<unknown> = Promise.resolve();

  transaction<T>(eventId: string, work: (tx: CompletionTransaction) => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      if (eventId !== "event-1") throw new Error("Unexpected event scope");
      this.onTransaction?.();
      const draft = structuredClone({ state: this.state, snapshots: this.snapshots, mutations: this.mutations });
      const tx: CompletionTransaction = {
        authorize: async () => this.actor,
        loadState: async () => structuredClone(draft.state),
        loadSource: async () => this.source,
        findMutation: async (mutationKey) => draft.mutations.find((row) => row.idempotencyKey === mutationKey) ?? null,
        commit: async (mutation) => {
          if (mutation.result.version !== draft.state.version + 1) throw new Error("Invalid version write");
          draft.mutations.push(structuredClone(mutation));
          if (mutation.result.status === "completed") draft.snapshots.push(structuredClone(mutation.result.snapshot));
          if (this.failCommit) throw new Error("Storage failed after snapshot/audit writes");
          draft.state = { status: mutation.result.status === "completed" ? "completed" : "editable", version: mutation.result.version };
        },
      };
      const result = await work(tx);
      this.state = draft.state;
      this.snapshots = draft.snapshots;
      this.mutations = draft.mutations;
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}

describe("completion transaction", () => {
  it("atomically snapshots the server podium, four awards, source, actor and next version", async () => {
    const store = new MemoryCompletionStore();
    const result = await completeTournament("event-1", decisions, 0, key, store);
    expect(result).toMatchObject({ status: "completed", eventId: "event-1", version: 1 });
    expect(store.state).toEqual({ status: "completed", version: 1 });
    expect(store.snapshots).toHaveLength(1);
    expect(store.snapshots[0]).toMatchObject({
      eventId: "event-1", version: 1, actor: { id: "organizer-1", role: "organizer" },
      podium: [{ rank: 1, teamId: "team-a", teamName: "Alpha" }, { rank: 2, teamId: "team-b", teamName: "Beta" }, { rank: 3, teamId: "team-c", teamName: "Gamma" }],
      awards: [
        { award: "mvp", recipient: { playerId: "player-a", playerName: "Ari", teamName: "Alpha", value: 5 }, reason: null },
        { award: "top_scorer", recipient: { playerId: "player-a", value: 5 } },
        { award: "top_defender", recipient: { playerId: "player-a", value: 5 } },
        { award: "top_assist", recipient: { playerId: "player-a", value: 5 } },
      ], source: { facts: { matches: [{ id: "final", revision: 1 }, { id: "third", revision: 1 }] } },
    });
    expect(store.snapshots[0].source.statistics).toHaveLength(4);
    expect(store.mutations).toMatchObject([{ idempotencyKey: key, actor: { id: "organizer-1" }, result: { status: "completed", version: 1 } }]);
  });

  it("re-runs readiness against facts changed on entering the transaction", async () => {
    const store = new MemoryCompletionStore();
    store.onTransaction = () => { store.source = { ...store.source, facts: { ...store.source.facts, activeDisputes: [{ id: "late-dispute" }] } }; };
    expect(await completeTournament("event-1", decisions, 0, key, store)).toEqual({ status: "blocked", code: "not_ready", blockers: [{ code: "ACTIVE_DISPUTE", disputeId: "late-dispute" }] });
    expect(store.mutations).toEqual([]);
    expect(store.state.version).toBe(0);
  });

  it("does not trust an award-ready fact when the published metric is missing", async () => {
    const store = new MemoryCompletionStore();
    store.source = { ...store.source, statistics: store.source.statistics.map((row) => row.award === "mvp" ? { ...row, status: "draft" } : row) };
    expect(await completeTournament("event-1", decisions, 0, key, store)).toEqual({ status: "blocked", code: "not_ready", blockers: [{ code: "MISSING_VALIDATED_AWARD_STATISTICS", award: "mvp" }] });
    expect(store.snapshots).toEqual([]);
  });

  it.each([
    { name: "missing award", value: decisions.slice(1) },
    { name: "duplicate award", value: [decisions[0], decisions[0], decisions[2], decisions[3]] },
    { name: "outside candidate", value: decisions.map((row) => row.award === "mvp" ? { ...row, playerId: "outsider" } : row) },
  ])("rejects $name without partial writes", async ({ value }) => {
    const store = new MemoryCompletionStore();
    expect(await completeTournament("event-1", value, 0, key, store)).toMatchObject({ status: "blocked" });
    expect(store.state).toEqual({ status: "editable", version: 0 });
    expect(store.snapshots).toEqual([]);
    expect(store.mutations).toEqual([]);
  });

  it("requires a trimmed audit reason to choose a tied leader", async () => {
    const store = new MemoryCompletionStore();
    store.source = { ...store.source, statistics: [...store.source.statistics, { ...store.source.statistics[0], playerId: "player-b", playerName: "Bima" }] };
    const tied = decisions.map((row) => row.award === "mvp" ? { ...row, playerId: "player-b", reason: "  " } : row);
    expect(await completeTournament("event-1", tied, 0, key, store)).toMatchObject({ status: "blocked", code: "tie_reason_required" });
    expect(store.mutations).toEqual([]);
    const reasoned = tied.map((row) => row.award === "mvp" ? { ...row, reason: "  Deciding final performance  " } : row);
    expect(await completeTournament("event-1", reasoned, 0, key, store)).toMatchObject({ status: "completed" });
    expect(store.snapshots[0].awards[0]).toMatchObject({ reason: "Deciding final performance", recipient: { playerId: "player-b" }, candidates: [{ playerId: "player-a" }, { playerId: "player-b" }] });
  });

  it("returns the original result for concurrent retries without duplicate records", async () => {
    const store = new MemoryCompletionStore();
    const [first, retry] = await Promise.all([completeTournament("event-1", decisions, 0, key, store), completeTournament("event-1", [...decisions].reverse(), 0, key, store)]);
    expect(first.status).toBe("completed");
    expect(retry).toEqual({ status: "already_applied", eventId: "event-1", version: 1, result: first });
    expect(store.snapshots).toHaveLength(1);
    expect(store.mutations).toHaveLength(1);
  });

  it("conflicts on stale versions or reuse of a key for another mutation", async () => {
    const store = new MemoryCompletionStore();
    await completeTournament("event-1", decisions, 0, key, store);
    expect(await completeTournament("event-1", decisions, 0, nextKey, store)).toEqual({ status: "conflict", version: 1, code: "stale_version" });
    expect(await reopenTournament("event-1", "Fix final", 1, key, store)).toEqual({ status: "conflict", version: 1, code: "idempotency_key_reused" });
    expect(store.mutations).toHaveLength(1);
  });

  it("rolls back snapshot, audit, idempotency and state on storage failure", async () => {
    const store = new MemoryCompletionStore();
    store.failCommit = true;
    await expect(completeTournament("event-1", decisions, 0, key, store)).rejects.toThrow("Storage failed");
    expect(store.snapshots).toEqual([]);
    expect(store.mutations).toEqual([]);
    expect(store.state).toEqual({ status: "editable", version: 0 });
    store.failCommit = false;
    expect(await completeTournament("event-1", decisions, 0, key, store)).toMatchObject({ status: "completed", version: 1 });
  });

  it("authorizes inside the transaction before returning any saved result", async () => {
    const store = new MemoryCompletionStore();
    await completeTournament("event-1", decisions, 0, key, store);
    store.actor = null;
    expect(await completeTournament("event-1", decisions, 0, key, store)).toEqual({ status: "blocked", code: "unauthorized" });
    expect(await reopenTournament("event-1", "Fix final", 1, nextKey, store)).toEqual({ status: "blocked", code: "unauthorized" });
    expect(store.mutations).toHaveLength(1);
  });

  it("locks competitive edits until audited reopen increments the version", async () => {
    const store = new MemoryCompletionStore();
    expect(guardCompetitiveEdit(store.state)).toEqual({ allowed: true });
    await completeTournament("event-1", decisions, 0, key, store);
    expect(guardCompetitiveEdit(store.state)).toEqual({ allowed: false, code: "competitive_locked" });
    expect(await completeTournament("event-1", decisions, 1, nextKey, store)).toEqual({ status: "blocked", code: "competitive_locked" });
    expect(await reopenTournament("event-1", "  ", 1, nextKey, store)).toMatchObject({ status: "blocked", code: "invalid_input" });
    expect(store.mutations).toHaveLength(1);
    const result = await reopenTournament("event-1", "  Correct published score  ", 1, nextKey, store);
    expect(result).toEqual({ status: "reopened", eventId: "event-1", version: 2 });
    expect(store.state).toEqual({ status: "editable", version: 2 });
    expect(guardCompetitiveEdit(store.state)).toEqual({ allowed: true });
    expect(store.mutations[1]).toMatchObject({ actor: { id: "organizer-1" }, reason: "Correct published score", idempotencyKey: nextKey });
    expect(await reopenTournament("event-1", "Correct published score", 1, nextKey, store)).toEqual({ status: "already_applied", eventId: "event-1", version: 2, result });
    expect(store.mutations).toHaveLength(2);
  });

  it("keeps old snapshots immutable when stats change and a reopened event completes again", async () => {
    const store = new MemoryCompletionStore();
    const first = await completeTournament("event-1", decisions, 0, key, store);
    store.source = { ...store.source, statistics: store.source.statistics.map((row) => ({ ...row, value: 99, playerName: "Changed" })) };
    const retry = await completeTournament("event-1", decisions, 0, key, store);
    expect(retry).toMatchObject({ status: "already_applied", result: first });
    expect(store.snapshots[0].source.statistics[0]).toMatchObject({ value: 5, playerName: "Ari" });
    await reopenTournament("event-1", "Stat correction", 1, nextKey, store);
    expect(await completeTournament("event-1", decisions, 2, "33333333-3333-4333-8333-333333333333", store)).toMatchObject({ status: "completed", version: 3 });
    expect(store.snapshots).toHaveLength(2);
    expect(store.snapshots[0].awards[0].recipient).toMatchObject({ value: 5, playerName: "Ari" });
    expect(store.snapshots[1].awards[0].recipient).toMatchObject({ value: 99, playerName: "Changed" });
  });

  it("reports the missing Match Day integration through the public four-argument API", async () => {
    expect(await completeTournament("event-1", decisions, 0, key)).toEqual({ status: "integration_required" });
    expect(await reopenTournament("event-1", "Correction", 0, key)).toEqual({ status: "integration_required" });
  });
});
