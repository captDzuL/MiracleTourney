import { beforeEach, describe, expect, it, vi } from "vitest";
import { operationStore } from "../tournament/operations/test-store";
import { createCompetitionOperations } from "../tournament/operations";
import { TOURNAMENT_FORMAT_PRESETS } from "../tournament/formats/types";
const boundary = vi.hoisted(() => ({ db: null as ReturnType<typeof operationStore>["db"] | null, flags: true }));
vi.mock("@/lib/platform/db", () => ({ prisma: new Proxy({}, { get: (_, key) => Reflect.get(boundary.db!, key) }) }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: () => boundary.flags }));
import { getPublicOngoingEvent } from "./public-ongoing";

describe("sanitized ongoing public state", () => {
  let store: ReturnType<typeof operationStore>;
  const now = new Date("2026-09-12T03:00:00Z");
  beforeEach(async () => {
    store = operationStore(); boundary.db = store.db; boundary.flags = true;
    await store.db.$transaction(async tx => { await tx.event.update({ where: { id: "event" }, data: { slug: "cup", name: "Cup", status: "Ongoing", timezone: "Asia/Jakarta", updatedAt: now } }); });
    await createCompetitionOperations(store.db).execute({ eventId: "event", actor: { id: "owner", role: "organizer" }, expectedVersion: 0, idempotencyKey: "init", command: { kind: "initialize", config: TOURNAMENT_FORMAT_PRESETS.roundRobin, teams: [{ id: "a", seed: 1 }, { id: "b", seed: 2 }] } });
  });
  it("does not infer LIVE from the clock or expose draft schedules or private fields", async () => {
    store.seed("scheduleRevision", { eventId: "event", version: 2, status: "draft", snapshot: { private: "draft secret" } });
    store.seed("competitionIncident", { eventId: "event", description: "private incident" });
    const view = await getPublicOngoingEvent("cup", now);
    expect(view?.mode).toBe("ongoing");
    expect(view?.liveMatches).toEqual([]);
    expect(view?.schedule).toBeNull();
    expect(view?.standings[0].rows).toHaveLength(2);
    const serialized = JSON.stringify(view);
    for (const secret of ["private incident", "draft secret", "readiness", "audit", "resultSnapshot", "actorUserId"]) expect(serialized).not.toContain(secret);
  });
  it.each(["singleElimination", "doubleElimination", "roundRobin", "groupPlayoffs"] as const)("projects initialized %s competition with simultaneous rooms and TBD playoff context", async format => {
    store = operationStore(); boundary.db = store.db;
    for (const id of ["c", "d", "e", "f", "g", "h"]) store.seed("team", { id, eventId: "event", name: id.toUpperCase() });
    await store.db.$transaction(async tx => { await tx.event.update({ where: { id: "event" }, data: { slug: "cup", name: "Cup", status: "Ongoing", timezone: "Asia/Jakarta", updatedAt: now } }); });
    const service = createCompetitionOperations(store.db, () => now);
    const initialized = await service.execute({ eventId: "event", actor: { id: "owner", role: "organizer" }, expectedVersion: 0, idempotencyKey: "init", command: { kind: "initialize", config: TOURNAMENT_FORMAT_PRESETS[format], teams: ["a", "b", "c", "d", "e", "f", "g", "h"].map((id, index) => ({ id, seed: index + 1 })) } });
    const draft = await service.execute({ eventId: "event", actor: { id: "owner", role: "organizer" }, expectedVersion: initialized.version, idempotencyKey: "draft", command: { kind: "schedule_save", input: { timezone: "Asia/Jakarta", eventWindow: { start: "2026-09-12T02:00:00Z", end: "2026-09-13T02:00:00Z" }, matchDurationMinutes: 20, bufferMinutes: 0, minimumRestMinutes: 5, rooms: ["A", "B"] } } });
    await service.execute({ eventId: "event", actor: { id: "owner", role: "organizer" }, expectedVersion: draft.version, idempotencyKey: "publish", command: { kind: "schedule_publish", revisionId: draft.resourceId! } });
    const before = await getPublicOngoingEvent("cup", now);
    expect(before?.event.format).toBe(TOURNAMENT_FORMAT_PRESETS[format].kind);
    expect(before?.nextMatches.every(m => m.start && m.room)).toBe(true);
    const earliest = before!.nextMatches[0].start;
    const simultaneous = before!.nextMatches.filter(m => m.start === earliest);
    expect(simultaneous).toHaveLength(2);
    await store.db.$transaction(async tx => { for (const m of simultaneous) await tx.match.update({ where: { id: m.id }, data: { status: "Live", scheduleStatus: "live" } }); });
    const live = await getPublicOngoingEvent("cup", now);
    expect(live?.liveMatches.map(m => m.room).sort()).toEqual(["A", "B"]);
    if (format === "groupPlayoffs") {
      expect(live?.standings).toHaveLength(4); expect(live?.standings.every(s => s.qualificationCutline === 2)).toBe(true);
      expect(live?.nextMatches.some(m => m.bracket === "single" && m.home === null && m.away === null)).toBe(true);
    }
    if (format === "doubleElimination") expect(live?.matches.some(m => m.bracket === "lower")).toBe(true);
  });
  it("exposes only the approved revision's schedule impact and keeps unapproved changes hidden", async () => {
    const matchId = String(store.rows("match")[0].id);
    const before = { matchId, roomId: "A", start: "2026-09-12T02:00:00Z", end: "2026-09-12T03:00:00Z" };
    const after = { ...before, roomId: "B", start: "2026-09-12T04:00:00Z", end: "2026-09-12T05:00:00Z" };
    store.seed("scheduleRevision", { eventId: "event", status: "published", version: 2, publishedAt: now, snapshot: { draft: { assignments: [before] } } });
    store.seed("scheduleRevision", { eventId: "event", status: "published", version: 3, publishedAt: now, snapshot: { draft: { assignments: [after], impact: [{ matchId, before, after, delayMinutes: 120 }] } } });
    await store.db.$transaction(async tx => { await tx.event.update({ where: { id: "event" }, data: { publishedScheduleVersion: 3 } }); await tx.match.update({ where: { id: matchId }, data: { scheduleStatus: "delayed" } }); });
    const view = await getPublicOngoingEvent("cup", now);
    expect(view?.nextMatches[0]).toMatchObject({ status: "delayed", start: "2026-09-12T04:00:00Z", room: "B" });
    expect(view?.schedule?.changes).toEqual([{ matchId, before: { start: "2026-09-12T02:00:00Z", end: "2026-09-12T03:00:00Z", room: "A" }, after: { start: "2026-09-12T04:00:00Z", end: "2026-09-12T05:00:00Z", room: "B" } }]);
  });
  it("shows only selected published assignments, with authoritative live and corrected official scores", async () => {
    const matchId = String(store.rows("match")[0].id);
    const assignment = { matchId, start: "2026-09-12T02:00:00.000Z", end: "2026-09-12T03:00:00.000Z", roomId: "Arena A" };
    store.seed("scheduleRevision", { eventId: "event", version: 2, status: "published", publishedAt: now, snapshot: { draft: { assignments: [assignment], changes: [] } } });
    store.seed("scheduleRevision", { eventId: "event", version: 99, status: "draft", snapshot: { draft: { assignments: [{ ...assignment, roomId: "SECRET ROOM" }] } } });
    await store.db.$transaction(async tx => {
      await tx.event.update({ where: { id: "event" }, data: { publishedScheduleVersion: 2 } });
      await tx.match.update({ where: { id: matchId }, data: { status: "Live", scheduleStatus: "live" } });
    });
    const live = await getPublicOngoingEvent("cup", now);
    expect(live?.liveMatches[0]).toMatchObject({ id: matchId, room: "Arena A", status: "live" });
    expect(JSON.stringify(live)).not.toContain("SECRET ROOM");
    await store.db.$transaction(async tx => { await tx.match.update({ where: { id: matchId }, data: { status: "Completed", scheduleStatus: "completed", resultVersion: 2, homeScore: 2, awayScore: 0, winnerTeamId: "a", resultConfirmedAt: now, resultSnapshot: { secretPlayerStats: 42 } } }); });
    const corrected = await getPublicOngoingEvent("cup", now);
    expect(corrected?.recentResults[0]).toMatchObject({ homeScore: 2, awayScore: 0, resultVersion: 2 });
    expect(corrected?.stateVersion).not.toBe(live?.stateVersion);
    expect(JSON.stringify(corrected)).not.toContain("secretPlayerStats");
  });
  it("keeps a live overrun estimate private until explicit schedule publication", async () => {
    const service = createCompetitionOperations(store.db, () => now); let sequence = 0;
    const execute = (command: import("../tournament/operations").OperationCommand) => service.execute({ eventId: "event", actor: { id: "owner", role: "organizer" }, expectedVersion: Number(store.rows("event")[0].competitionVersion), idempotencyKey: `overrun-${++sequence}`, command });
    const first = await execute({ kind: "schedule_save", input: { timezone: "Asia/Jakarta", eventWindow: { start: "2026-09-12T02:00:00Z", end: "2026-09-12T12:00:00Z" }, matchDurationMinutes: 30, bufferMinutes: 0, minimumRestMinutes: 0, rooms: ["A"] } });
    await execute({ kind: "schedule_publish", revisionId: first.resourceId! });
    const matchId = String(store.rows("match")[0].id);
    await execute({ kind: "match_start", matchId, reason: "Desk ready" });
    const before = await getPublicOngoingEvent("cup", now);
    const delayed = await execute({ kind: "delay_preview", matchId, estimatedEnd: "2026-09-12T04:00:00Z", reason: "Private desk reason", sourceRevision: { id: first.resourceId!, version: first.version, status: "published" } });
    const pending = await getPublicOngoingEvent("cup", now);
    expect(pending?.liveMatches[0]).toMatchObject({ id: matchId, status: "live", end: before?.liveMatches[0].end });
    expect(JSON.stringify(pending)).not.toContain("Private desk reason");
    await execute({ kind: "schedule_publish", revisionId: delayed.resourceId! });
    expect((await getPublicOngoingEvent("cup", now))?.liveMatches[0]).toMatchObject({ id: matchId, status: "live", end: "2026-09-12T04:00:00.000Z", start: before?.liveMatches[0].start, room: "A" });
  });
  it("filters announcement status and time windows and changes version when one expires", async () => {
    for (const [id, status, endsAt] of [["active", "published", new Date("2026-09-12T04:00:00Z")], ["expired", "published", now], ["draft", "draft", null]] as const) store.seed("eventAnnouncement", { id, eventId: "event", status, title: id, body: "Body", publishedAt: new Date("2026-09-12T02:00:00Z"), startsAt: null, endsAt });
    const before = await getPublicOngoingEvent("cup", now);
    expect(before?.announcements[0].urgency).toBe("info");
    expect(before?.announcements.map(a => a.title)).toEqual(["active"]);
    const after = await getPublicOngoingEvent("cup", new Date("2026-09-12T04:00:00Z"));
    expect(after?.announcements).toEqual([]);
    expect(after?.stateVersion).not.toBe(before?.stateVersion);
  });
  it("carries explicit urgency without inferring it from announcement copy", async () => {
    store.seed("eventAnnouncement", { id: "urgent", eventId: "event", status: "published", urgency: "urgent", title: "Room notice", body: "Body", publishedAt: now });
    const view = await getPublicOngoingEvent("cup", now);
    expect(view?.announcements[0]).toMatchObject({ urgency: "urgent", title: "Room notice" });
  });
  it("falls back for disabled rollout, Finished and uninitialized legacy events", async () => {
    boundary.flags = false;
    expect(await getPublicOngoingEvent("cup", now)).toBeNull(); boundary.flags = true;
    await store.db.$transaction(async tx => { await tx.event.update({ where: { id: "event" }, data: { status: "Finished" } }); });
    expect(await getPublicOngoingEvent("cup", now)).toBeNull();
    expect(await getPublicOngoingEvent("missing", now)).toBeNull();
  });
});
