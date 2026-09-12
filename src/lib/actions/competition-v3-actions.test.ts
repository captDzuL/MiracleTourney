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
    await call(0, { kind: "initialize", config: TOURNAMENT_FORMAT_PRESETS.roundRobin, teams: [{ id: "a", seed: 1 }, { id: "b", seed: 2 }] });
    const matchId = String(store.rows("match")[0].id);
    await call(1, { kind: "result_submit", matchId, games: [{ gameNumber: 1, homeScore: 2, awayScore: 0 }] });
    const input = { eventId: "event", matchId, games: [{ gameNumber: 1, homeScore: 0, awayScore: 2 }] };
    const preview = await previewCompetitionResultCorrectionAction(input);
    expect(preview).toMatchObject({ competitionVersion: 2, score: { winnerTeamId: "b" }, blockedMatchIds: [] });
    expect(store.rows("event")[0].competitionVersion).toBe(2);
    await call(2, { kind: "result_correct", matchId, games: input.games, reason: "Correction confirmed", previewToken: preview.token });
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
