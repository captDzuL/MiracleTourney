import { expect, it, vi } from "vitest";
import { operationStore } from "../tournament/operations/test-store";
import { createCompetitionOperations } from "../tournament/operations";
import { TOURNAMENT_FORMAT_PRESETS } from "../tournament/formats/types";
const boundary = vi.hoisted(() => ({ db: null as ReturnType<typeof operationStore>["db"] | null }));
vi.mock("@/lib/platform/db", () => ({ prisma: new Proxy({}, { get: (_, key) => Reflect.get(boundary.db!, key) }) }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: () => true }));
import { getPublicOngoingEvent } from "./public-ongoing";

async function fixture() {
  const store = operationStore(); boundary.db = store.db;
  await store.db.$transaction(async tx => { await tx.event.update({ where: { id: "event" }, data: { slug: "cup", name: "Cup", status: "Ongoing", timezone: "Asia/Jakarta" } }); });
  const service = createCompetitionOperations(store.db, undefined, { allowInternalInitialize: true });
  let version = 0;
  const run = async (command: Parameters<typeof service.execute>[0]["command"]) => { const result = await service.execute({ eventId: "event", actor: { id: "owner", role: "organizer" }, expectedVersion: version, idempotencyKey: `change-${version}`, command }); version = result.version; return result; };
  await run({ kind: "initialize", config: TOURNAMENT_FORMAT_PRESETS.roundRobin, teams: [{ id: "a", seed: 1 }, { id: "b", seed: 2 }] });
  return { store, service, run, matchId: String(store.rows("match")[0].id) };
}
it("compares public revisions after a locked preview is regenerated with empty planner impact", async () => {
  const { service, run, matchId } = await fixture();
  const input = { timezone: "Asia/Jakarta", eventWindow: { start: "2026-09-12T09:00:00Z", end: "2026-09-12T15:00:00Z" }, matchDurationMinutes: 30, bufferMinutes: 0, minimumRestMinutes: 0, rooms: ["A", "B"] };
  const first = await run({ kind: "schedule_save", input }); await run({ kind: "schedule_publish", revisionId: first.resourceId! });
  expect((await getPublicOngoingEvent("cup"))?.schedule?.changes).toEqual([]);
  const preview = await run({ kind: "schedule_save", reason: "Move to B", input: { ...input, manualOverrides: [{ matchId, start: "2026-09-12T10:00:00Z", end: "2026-09-12T10:30:00Z", roomId: "B" }] } });
  expect((await getPublicOngoingEvent("cup"))?.schedule?.changes).toEqual([]);
  const final = await run({ kind: "schedule_save", input: { ...input, sourceRevision: { id: preview.resourceId!, version: preview.version, status: "draft" }, lockedMatchIds: [matchId] } });
  expect((await service.readScheduleDraft("event", final.resourceId!, { id: "owner", role: "organizer" }))?.draft.impact).toEqual([]);
  await run({ kind: "schedule_publish", revisionId: final.resourceId! });
  expect((await getPublicOngoingEvent("cup"))?.schedule?.changes).toEqual([{ matchId, before: { start: "2026-09-12T09:00:00.000Z", end: "2026-09-12T09:30:00.000Z", room: "A" }, after: { start: "2026-09-12T10:00:00.000Z", end: "2026-09-12T10:30:00.000Z", room: "B" } }]);
});
it("uses the immediately prior event-scoped publication and sanitizes added, removed and end-time changes in stable order", async () => {
  const { store } = await fixture();
  const a = { matchId: "a", start: "2026-09-12T09:00:00Z", end: "2026-09-12T09:30:00Z", roomId: "A", secret: "private" };
  const published = (eventId: string, version: number, assignments: unknown[]) => store.seed("scheduleRevision", { eventId, version, status: "published", snapshot: { draft: { assignments, impact: [{ private: "bad planner" }] } } });
  published("event", 2, [{ ...a, roomId: "OLD" }]);
  published("event", 4, [a, { ...a, matchId: "c" }]);
  published("other", 6, [{ ...a, roomId: "FOREIGN" }]);
  store.seed("scheduleRevision", { eventId: "event", version: 6, status: "draft", snapshot: { draft: { assignments: [{ ...a, roomId: "DRAFT" }] } } });
  published("event", 7, [{ ...a, matchId: "b" }, { ...a, end: "2026-09-12T10:00:00Z" }]);
  published("event", 9, [{ ...a, roomId: "FUTURE" }]);
  await store.db.$transaction(async tx => { await tx.event.update({ where: { id: "event" }, data: { publishedScheduleVersion: 7 } }); });
  const changes = (await getPublicOngoingEvent("cup"))?.schedule?.changes;
  expect(changes?.map(c => c.matchId)).toEqual(["a", "b", "c"]);
  expect(changes?.[0]).toMatchObject({ before: { end: "2026-09-12T09:30:00Z", room: "A" }, after: { end: "2026-09-12T10:00:00Z", room: "A" } });
  expect(changes?.[1].before).toBeNull(); expect(changes?.[2].after).toBeNull();
  expect(JSON.stringify(changes)).not.toMatch(/private|planner|OLD|FOREIGN|DRAFT|FUTURE/);
  store.reverseReadOrder(true); expect((await getPublicOngoingEvent("cup"))?.schedule?.changes).toEqual(changes);
});
