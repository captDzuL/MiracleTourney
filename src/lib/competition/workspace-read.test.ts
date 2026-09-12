import { beforeEach, describe, expect, it, vi } from "vitest";
import { operationStore } from "../tournament/operations/test-store";
import { createCompetitionOperations } from "../tournament/operations";
import { TOURNAMENT_FORMAT_PRESETS } from "../tournament/formats/types";

const boundary = vi.hoisted(() => ({ user: { id: "owner", role: "organizer", mustChangePassword: false } as { id: string; role: string; mustChangePassword: boolean } | null, enabled: true, db: null as ReturnType<typeof operationStore>["db"] | null }));
vi.mock("@/lib/auth/session", () => ({ requireAnyRole: async () => boundary.user }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: () => boundary.enabled }));
vi.mock("@/lib/platform/db", () => ({ prisma: new Proxy({}, { get: (_, key) => Reflect.get(boundary.db!, key) }) }));
import { readCompetitionWorkspace } from "./workspace-read";

describe("private organizer read state", () => {
  it("exposes a safe compatibility diagnostic for result-bearing legacy data", async () => {
    await store.db.$transaction(async tx => { await tx.event.update({ where: { id: "event" }, data: { format: "League" } }); });
    store.seed("match", { id: "old", eventId: "event", homeTeamId: "a", awayTeamId: "b", homeScore: 2, awayScore: 1, status: "Completed", resultVersion: 0 });
    expect((await readCompetitionWorkspace("event")).compatibility).toMatchObject({ status: "blocked", reason: "existing_results" });
    expect(store.rows("competitionPhase")).toEqual([]);
  });
  it("includes explicit announcement urgency in organizer read state", async () => {
    store.seed("eventAnnouncement", { id: "notice", eventId: "event", title: "Notice", body: "Body", status: "draft", urgency: "important" });
    expect((await readCompetitionWorkspace("event")).announcements[0]).toMatchObject({ urgency: "important" });
  });
  let store: ReturnType<typeof operationStore>;
  beforeEach(() => { store = operationStore(); boundary.db = store.db; boundary.user = { id: "owner", role: "organizer", mustChangePassword: false }; boundary.enabled = true; });
  it("returns serializable format context, seeded teams, and official match state", async () => {
    await createCompetitionOperations(store.db).execute({ eventId: "event", actor: boundary.user!, expectedVersion: 0, idempotencyKey: "init", command: { kind: "initialize", config: TOURNAMENT_FORMAT_PRESETS.roundRobin, teams: [{ id: "a", seed: 1 }, { id: "b", seed: 2 }] } });
    const state = await readCompetitionWorkspace("event");
    expect(state.event.version).toBe(1);
    expect(state.graph?.config.kind).toBe("round_robin");
    expect(state.standings[0].rows).toHaveLength(2);
    expect(state.matches[0].bestOf).toBe(1);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
  it("blocks missing sessions, nonowners, password-change sessions, and rollout-off reads", async () => {
    boundary.user = null;
    await expect(readCompetitionWorkspace("event")).rejects.toThrow("Unauthorized");
    boundary.user = { id: "other", role: "organizer", mustChangePassword: false };
    await expect(readCompetitionWorkspace("event")).rejects.toThrow("Not authorized");
    boundary.user = { id: "owner", role: "organizer", mustChangePassword: true };
    await expect(readCompetitionWorkspace("event")).rejects.toThrow("Password change required");
    boundary.user.mustChangePassword = false; boundary.enabled = false;
    await expect(readCompetitionWorkspace("event")).rejects.toThrow("unavailable");
  });
  it("keeps core state available when an auxiliary section fails", async () => {
    const transact = store.db.$transaction.bind(store.db);
    vi.spyOn(store.db, "$transaction").mockImplementation(((read: (tx: unknown) => Promise<unknown>) => transact(async tx => {
      vi.spyOn(tx.competitionIncident, "findMany").mockRejectedValue(new Error("offline"));
      return read(tx);
    })) as typeof store.db.$transaction);
    const state = await readCompetitionWorkspace("event");
    expect(state.unavailableSections).toEqual(["incidents"]);
    expect(state.matches).toEqual([]);
  });
  it.each([false, true])("reopens published constraints without resurrecting superseded drafts (earlier draft: %s)", async earlierDraft => {
    const operations = createCompetitionOperations(store.db);
    let version = 0;
    const execute = async (command: Parameters<typeof operations.execute>[0]["command"]) => {
      const receipt = await operations.execute({ eventId: "event", actor: boundary.user!, expectedVersion: version, idempotencyKey: `read-${version}`, command });
      version = receipt.version; return receipt;
    };
    await execute({ kind: "initialize", config: TOURNAMENT_FORMAT_PRESETS.roundRobin, teams: [{ id: "a", seed: 1 }, { id: "b", seed: 2 }] });
    const input = { timezone: "Asia/Jakarta", eventWindow: { start: "2026-09-12T02:00:00.000Z", end: "2026-09-12T12:00:00.000Z" }, matchDurationMinutes: 60, bufferMinutes: 7, minimumRestMinutes: 20, rooms: ["Arena A", "Arena B"] };
    if (earlierDraft) await execute({ kind: "schedule_save", input: { ...input, matchDurationMinutes: 30 } });
    const selected = await execute({ kind: "schedule_save", input });
    await execute({ kind: "schedule_publish", revisionId: selected.resourceId! });
    const reopened = await readCompetitionWorkspace("event");
    expect(reopened.schedule).toBeNull();
    expect(reopened.publishedSchedule).toMatchObject({ id: selected.resourceId, version: selected.version, input });
    const next = await execute({ kind: "schedule_save", input: { ...input, matchDurationMinutes: 90 } });
    const withDraft = await readCompetitionWorkspace("event");
    expect(withDraft.schedule).toMatchObject({ id: next.resourceId, input: { matchDurationMinutes: 90 } });
    expect(withDraft.publishedSchedule).toMatchObject({ id: selected.resourceId, input: { matchDurationMinutes: 60 } });
  });
});
