import { beforeEach, describe, expect, it, vi } from "vitest";
import { operationStore } from "../tournament/operations/test-store";

const boundary = vi.hoisted(() => ({
  session: { user: null as { id: string; role: string; mustChangePassword?: boolean } | null },
  enabled: true,
  db: null as ReturnType<typeof operationStore>["db"] | null,
}));
vi.mock("@/lib/auth/session", () => ({ requireAnyRole: async () => boundary.session.user }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: () => boundary.enabled }));
vi.mock("@/lib/platform/db", () => ({ prisma: { $transaction: (...args: unknown[]) => Reflect.apply(boundary.db!.$transaction, boundary.db, args) } }));
vi.mock("next/cache", () => ({ revalidateTag: () => {}, revalidatePath: () => {} }));
import { executeCompetitionOperationAction } from "./competition-v3-actions";

describe("authenticated competition actions", () => {
  let store: ReturnType<typeof operationStore>;
  const request = { eventId: "event", expectedVersion: 0, idempotencyKey: "action", command: { kind: "announcement_save", title: "Hello", body: "Welcome" } };
  beforeEach(() => { store = operationStore(); boundary.db = store.db; boundary.session.user = { id: "owner", role: "organizer" }; boundary.enabled = true; });
  it("uses the authenticated owner to execute the real transaction", async () => {
    expect(await executeCompetitionOperationAction(request)).toMatchObject({ version: 1 });
    expect(store.rows("competitionAuditLog")[0]).toMatchObject({ actorUserId: "owner", action: "announcement_save" });
    expect(store.rows("eventAnnouncement")[0]).toMatchObject({ title: "Hello", status: "draft" });
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
