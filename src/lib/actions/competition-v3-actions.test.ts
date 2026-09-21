import { beforeEach, describe, expect, it, vi } from "vitest";
import { operationStore } from "../tournament/operations/test-store";
import { TOURNAMENT_FORMAT_PRESETS } from "../tournament/formats/types";

const boundary = vi.hoisted(() => ({
  session: { user: null as { id: string; role: string; mustChangePassword?: boolean } | null },
  enabled: true,
  db: null as ReturnType<typeof operationStore>["db"] | null,
}));
vi.mock("@/lib/auth/session", () => ({ requireAnyRole: async () => boundary.session.user }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: () => boundary.enabled }));
vi.mock("@/lib/platform/db", () => ({ prisma: { $transaction: (...args: unknown[]) => Reflect.apply(boundary.db!.$transaction, boundary.db, args) } }));
vi.mock("next/cache", () => ({ revalidateTag: () => {}, revalidatePath: () => {} }));
import { executeCompetitionOperationAction, previewCompetitionResultCorrectionAction, mutateCompetitionWorkspaceAction } from "./competition-v3-actions";

describe("authenticated competition actions", () => {
  let store: ReturnType<typeof operationStore>;
  const request = { eventId: "event", expectedVersion: 0, idempotencyKey: "action", command: { kind: "announcement_save", title: "Hello", body: "Welcome" } };
  beforeEach(() => { store = operationStore(); boundary.db = store.db; boundary.session.user = { id: "owner", role: "organizer" }; boundary.enabled = true; });
  it("previews an official correction through the authenticated owner without writing", async () => {
    const call = (version: number, command: unknown) => executeCompetitionOperationAction({ eventId: "event", expectedVersion: version, idempotencyKey: `k${version}`, command });
    await call(0, { kind: "drawing_save", config: TOURNAMENT_FORMAT_PRESETS.roundRobin, teams: [{ id: "a", seed: 1 }, { id: "b", seed: 2 }] });
    await call(1, { kind: "drawing_publish" });
    const matchId = String(store.rows("match")[0].id);
    await store.db.$transaction(async tx => tx.match.update({ where: { id: matchId }, data: { status: "Live", scheduleStatus: "live", actualStartedAt: new Date("2026-09-12T09:00:00Z") } }));
    await call(2, { kind: "result_submit", matchId, games: [{ gameNumber: 1, homeScore: 2, awayScore: 0 }] });
    const input = { eventId: "event", matchId, games: [{ gameNumber: 1, homeScore: 0, awayScore: 2 }] };
    const preview = await previewCompetitionResultCorrectionAction(input);
    expect(preview).toMatchObject({ competitionVersion: 3, score: { winnerTeamId: "b" }, blockedMatchIds: [] });
    expect(store.rows("event")[0].competitionVersion).toBe(3);
    await call(3, { kind: "result_correct", matchId, games: input.games, reason: "Correction confirmed", previewToken: preview.token });
    expect(store.rows("matchResultRevision")).toHaveLength(2);
    boundary.enabled = false;
    await expect(previewCompetitionResultCorrectionAction(input)).rejects.toThrow("unavailable");
    boundary.enabled = true; boundary.session.user = { id: "other", role: "organizer" };
    await expect(previewCompetitionResultCorrectionAction(input)).rejects.toThrow("Not authorized");
    boundary.session.user = { id: "owner", role: "organizer", mustChangePassword: true };
    await expect(previewCompetitionResultCorrectionAction(input)).rejects.toThrow("Password change required");
  });
  it("uses the authenticated owner to execute the real transaction", async () => {
    expect(await executeCompetitionOperationAction(request)).toMatchObject({ version: 1 });
    expect(store.rows("competitionAuditLog")[0]).toMatchObject({ actorUserId: "owner", action: "announcement_save" });
    expect(store.rows("eventAnnouncement")[0]).toMatchObject({ title: "Hello", status: "draft" });
  });
  it("passes reviewed draft locks to generation and exposes stale source conflicts", async () => {
    const call = (version: number, command: unknown) => executeCompetitionOperationAction({ eventId: "event", expectedVersion: version, idempotencyKey: `lock-${version}`, command });
    await call(0, { kind: "drawing_save", config: TOURNAMENT_FORMAT_PRESETS.singleElimination, teams: [{ id: "a", seed: 1 }, { id: "b", seed: 2 }] });
    await call(1, { kind: "drawing_publish" });
    const input = { timezone: "Asia/Jakarta", eventWindow: { start: "2026-09-12T09:00:00Z", end: "2026-09-12T12:00:00Z" }, matchDurationMinutes: 30, bufferMinutes: 0, minimumRestMinutes: 0, rooms: ["room"] };
    const first = await call(2, { kind: "schedule_save", input });
    const command = { kind: "schedule_save", input: { ...input, sourceRevision: { id: first.resourceId, version: first.version, status: "draft" }, lockedMatchIds: [store.rows("match")[0].id] } };
    expect(await mutateCompetitionWorkspaceAction({ eventId: "event", expectedVersion: 3, idempotencyKey: "locked", command })).toMatchObject({ status: "saved", receipt: { version: 4 } });
    expect(store.rows("scheduleRevision")[1].snapshot).toMatchObject({ draft: { feasible: true }, input: command.input });
    expect(await mutateCompetitionWorkspaceAction({ eventId: "event", expectedVersion: 4, idempotencyKey: "stale-source", command })).toEqual({ status: "conflict" });
    expect(store.rows("event")[0].competitionVersion).toBe(4);
  });

  it("rejects the internal initialize command at the public action schema", async () => {
    await expect(executeCompetitionOperationAction({
      eventId: "event",
      expectedVersion: 0,
      idempotencyKey: "initialize-bypass",
      command: { kind: "initialize", config: TOURNAMENT_FORMAT_PRESETS.singleElimination, teams: [{ id: "a", seed: 1 }, { id: "b", seed: 2 }] },
    })).rejects.toThrow("initialize is internal");
  });

  it("rejects traversal event ids before opening an operation transaction", async () => {
    await expect(executeCompetitionOperationAction({ ...request, eventId: "../secrets" })).rejects.toThrow();
    expect(store.rows("competitionAuditLog")).toEqual([]);
  });
  it.each([
    ["matchId", { kind: "result_submit", matchId: "../secrets", games: [{ gameNumber: 1, homeScore: 1, awayScore: 0 }] }],
    ["teamId", { kind: "readiness_update", matchId: "match-1", teamId: "team' OR 1=1--", status: "ready" }],
    ["revisionId", { kind: "schedule_publish", revisionId: "../../revision" }],
    ["incidentId", { kind: "incident_resolve", incidentId: "incident%2Fsecret", reason: "resolved" }],
    ["actionId", { kind: "action_resolve", actionId: "action;DROP", reason: "resolved" }],
    ["announcementId", { kind: "announcement_publish", announcementId: "announcement<script>", urgency: "info" }],
  ] as const)("rejects unsafe nested %s before opening a transaction", async (_field, command) => {
    const transaction = vi.spyOn(store.db, "$transaction");
    await expect(executeCompetitionOperationAction({ ...request, command })).rejects.toThrow();
    expect(transaction).not.toHaveBeenCalled();
    transaction.mockRestore();
  });
  it("returns serializable conflict and authorization outcomes for production client rendering", async () => {
    expect(await mutateCompetitionWorkspaceAction(request)).toMatchObject({ status: "saved", receipt: { version: 1 } });
    expect(await mutateCompetitionWorkspaceAction({ ...request, idempotencyKey: "stale" })).toEqual({ status: "conflict" });
    boundary.session.user = null;
    expect(await mutateCompetitionWorkspaceAction(request)).toEqual({ status: "unauthorized" });
  });
  it("blocks absent sessions, password-change sessions and nonowners", async () => {
    boundary.session.user = null;
    await expect(executeCompetitionOperationAction(request)).rejects.toThrow("Unauthorized");
    boundary.session.user = { id: "owner", role: "organizer", mustChangePassword: true };
    await expect(executeCompetitionOperationAction(request)).rejects.toThrow("Password change required");
    boundary.session.user = { id: "other", role: "organizer" };
    await expect(executeCompetitionOperationAction(request)).rejects.toThrow("Not authorized");
    expect(store.rows("eventAnnouncement")).toEqual([]);
  });
  it("rejects submitted actor claims and honors the rollout flag", async () => {
    await expect(executeCompetitionOperationAction({ ...request, actor: { id: "admin", role: "platform_admin" } })).rejects.toThrow();
    boundary.enabled = false;
    await expect(executeCompetitionOperationAction(request)).rejects.toThrow("unavailable");
    expect(store.rows("eventAnnouncement")).toEqual([]);
  });
});
