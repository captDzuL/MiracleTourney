import { describe, expect, it } from "vitest";
import { createCompetitionOperations, type OperationCommand } from "./index";
import { operationStore } from "./test-store";
import { TOURNAMENT_FORMAT_PRESETS } from "../formats/types";

const owner = { id: "owner", role: "organizer" };
const now = new Date("2026-09-12T10:00:00Z");
const initialize: OperationCommand = { kind: "initialize", config: TOURNAMENT_FORMAT_PRESETS.singleElimination, teams: [{ id: "a", seed: 1 }, { id: "b", seed: 2 }] };
const scheduling = { timezone: "Asia/Jakarta", eventWindow: { start: "2026-09-12T09:00:00Z", end: "2026-09-12T12:00:00Z" }, matchDurationMinutes: 30, bufferMinutes: 0, minimumRestMinutes: 0, rooms: ["room"] };
function fixture() {
  const store = operationStore();
  const service = createCompetitionOperations(store.db, () => now);
  let version = 0;
  let key = 0;
  const run = async (command: OperationCommand, actor = owner) => {
    const result = await service.execute({ eventId: "event", actor, expectedVersion: version, idempotencyKey: `key-${++key}`, command });
    version = result.version;
    return result;
  };
  const setup = async () => { await run(initialize); return String(store.rows("match")[0].id); };
  return { ...store, service, run, setup };
}

describe("competition operation transactions", () => {
  it("returns saved review details only to the event owner or an administrator", async () => {
    const f = fixture(); await f.setup();
    const saved = await f.run({ kind: "schedule_save", input: scheduling });
    const review = await f.service.readScheduleDraft("event", saved.resourceId!, owner);
    expect(review).toMatchObject({ competitionVersion: 2, revisionId: saved.resourceId, draft: { feasible: true, kind: "draft", affectedMatchIds: ["event:single:r1:m1"] } });
    await expect(f.service.readScheduleDraft("event", saved.resourceId!, { id: "other", role: "organizer" })).rejects.toThrow("Not authorized");
    expect(await f.service.readScheduleDraft("event", "foreign", owner)).toBeNull();
  });
  it("requires a fresh review after a match changes and rolls back a failed publish", async () => {
    const f = fixture(); const matchId = await f.setup();
    const draft = await f.run({ kind: "schedule_save", input: scheduling });
    await f.run({ kind: "match_timing", matchId, status: "delayed", reason: "Room unavailable" });
    await expect(f.run({ kind: "schedule_publish", revisionId: draft.resourceId! })).rejects.toThrow("stale");
    expect(await f.service.readPublishedSchedule("event")).toBeNull();
    const fresh = await f.run({ kind: "schedule_save", input: scheduling });
    f.failWrites("scheduleRevision");
    await expect(f.run({ kind: "schedule_publish", revisionId: fresh.resourceId! })).rejects.toThrow("storage failure");
    expect(f.rows("match")[0].scheduledAt).toBeUndefined();
    expect(f.rows("event")[0].competitionVersion).toBe(4);
  });

  it("does not allow unresolved participants to start even with a reason", async () => {
    const f = fixture();
    for (const id of ["c", "d"]) f.seed("team", { id, eventId: "event" });
    await f.run({ ...initialize, teams: ["a", "b", "c", "d"].map((id, i) => ({ id, seed: i + 1 })) });
    const final = f.rows("match").find(m => !m.homeTeamId)!;
    await expect(f.run({ kind: "match_start", matchId: String(final.id), reason: "Force" })).rejects.toThrow("unresolved");
    expect(f.rows("matchDependency")).toHaveLength(2);
  });

  it("keeps live slots fixed during schedule saves", async () => {
    const f = fixture(); const matchId = await f.setup();
    const draft = await f.run({ kind: "schedule_save", input: scheduling });
    await f.run({ kind: "schedule_publish", revisionId: draft.resourceId! });
    await f.run({ kind: "match_start", matchId, reason: "Verified ready at desk" });
    const saved = await f.run({ kind: "schedule_save", input: { ...scheduling, manualOverrides: [{ matchId, roomId: "room", start: "2026-09-12T11:00:00Z", end: "2026-09-12T11:30:00Z" }] }, reason: "Move attempted" });
    await expect(f.run({ kind: "schedule_publish", revisionId: saved.resourceId! })).rejects.toThrow("conflicts");
    expect((await f.service.readPublishedSchedule("event"))?.assignments[0].start).toBe("2026-09-12T09:00:00.000Z");
  });

  it("does not create readiness actions before the published deadline", async () => {
    const f = fixture(); const matchId = await f.setup();
    const draft = await f.run({ kind: "schedule_save", input: { ...scheduling, eventWindow: { ...scheduling.eventWindow, start: "2026-09-12T11:00:00Z" } } });
    await f.run({ kind: "schedule_publish", revisionId: draft.resourceId! });
    await f.run({ kind: "readiness_deadline", matchId });
    expect(f.rows("competitionActionItem")).toEqual([]);
  });

  it("recovers a PostgreSQL serialization failure by re-running the whole transaction", async () => {
    const store = operationStore(); let failed = false;
    const db = { $transaction: (...args: unknown[]) => {
      if (!failed) { failed = true; return Promise.reject({ code: "P2034" }); }
      return Reflect.apply(store.db.$transaction, store.db, args);
    } } as typeof store.db;
    const service = createCompetitionOperations(db, () => now);
    expect(await service.execute({ eventId: "event", actor: owner, expectedVersion: 0, idempotencyKey: "retry", command: initialize })).toMatchObject({ version: 1 });
    expect(store.rows("competitionAuditLog")).toHaveLength(1);
    expect(store.rows("match")).toHaveLength(1);
  });

  it("rejects other organizers and captains before any mutation, but permits Platform Admin", async () => {
    const f = fixture();
    for (const actor of [{ id: "other", role: "organizer" }, { id: "owner", role: "captain" }])
      await expect(f.run(initialize, actor)).rejects.toThrow("Not authorized");
    expect(f.rows("competitionAuditLog")).toHaveLength(0);
    expect(f.rows("event")[0].competitionVersion).toBe(0);
    await f.run(initialize, { id: "admin", role: "platform_admin" });
    expect(f.rows("match")).toHaveLength(1);
  });

  it("replays exactly the original receipt and rejects changed payload reuse, even after later writes", async () => {
    const f = fixture();
    const input = { eventId: "event", actor: owner, expectedVersion: 0, idempotencyKey: "once", command: initialize };
    const first = await f.service.execute(input);
    await f.service.execute({ ...input, expectedVersion: 1, idempotencyKey: "second", command: { kind: "announcement_save", title: "Welcome", body: "Ready" } });
    expect(await f.service.execute(input)).toEqual(first);
    await expect(f.service.execute({ ...input, command: { kind: "announcement_save", title: "Changed", body: "Ready" } })).rejects.toThrow("Idempotency key");
    await expect(f.service.execute({ ...input, actor: { id: "other", role: "organizer" } })).rejects.toThrow("Not authorized");
    expect(f.rows("competitionAuditLog")).toHaveLength(2);
  });

  it("allows only one concurrent command with the same expected version", async () => {
    const f = fixture();
    const results = await Promise.allSettled(["one", "two"].map(idempotencyKey => f.service.execute({ eventId: "event", actor: owner, expectedVersion: 0, idempotencyKey, command: initialize })));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(String((results.find(r => r.status === "rejected") as PromiseRejectedResult).reason)).toContain("Version conflict");
    expect(f.rows("match")).toHaveLength(1);
  });

  it("rolls back graph creation and version if the final audit write fails", async () => {
    const f = fixture(); f.failWrites("competitionAuditLog");
    await expect(f.run(initialize)).rejects.toThrow("storage failure");
    expect(f.rows("competitionPhase")).toEqual([]);
    expect(f.rows("match")).toEqual([]);
    expect(f.rows("event")[0].competitionVersion).toBe(0);
  });

  it("persists graph metadata and refuses foreign teams or replacing existing competition", async () => {
    const f = fixture();
    await expect(f.run({ ...initialize, teams: [{ id: "a", seed: 1 }, { id: "foreign", seed: 2 }] })).rejects.toThrow("Teams");
    await f.setup();
    expect(f.rows("match")[0]).toMatchObject({ homeTeamId: "a", awayTeamId: "b", status: "Scheduled", resultVersion: 0 });
    expect(f.rows("competitionPhase")[0].configuration).toMatchObject({ graph: { config: { kind: "single_elimination" } } });
    await expect(f.run(initialize)).rejects.toThrow("already initialized");
  });

  it("keeps saved drafts private and publishes only the explicitly selected revision", async () => {
    const f = fixture(); const matchId = await f.setup();
    const first = await f.run({ kind: "schedule_save", input: scheduling });
    const second = await f.run({ kind: "schedule_save", input: { ...scheduling, eventWindow: { ...scheduling.eventWindow, start: "2026-09-12T11:00:00Z" } } });
    expect(first.resourceId).not.toBe(second.resourceId);
    expect(await f.service.readPublishedSchedule("event")).toBeNull();
    expect(f.rows("match")[0].scheduledAt).toBeUndefined();
    await f.run({ kind: "schedule_publish", revisionId: first.resourceId! });
    expect((await f.service.readPublishedSchedule("event"))?.assignments).toEqual([{ matchId, roomId: "room", start: "2026-09-12T09:00:00.000Z", end: "2026-09-12T09:30:00.000Z" }]);
    expect(f.rows("match")[0].scheduledAt).toEqual(new Date("2026-09-12T09:00:00Z"));
    expect(f.rows("scheduleRevision").find(r => r.id === second.resourceId)?.status).toBe("draft");
  });

  it("rejects infeasible drafts for publishing and requires an audit reason for manual overrides", async () => {
    const f = fixture(); const matchId = await f.setup();
    await expect(f.run({ kind: "schedule_save", input: { ...scheduling, manualOverrides: [{ matchId, roomId: "room", start: "2026-09-12T09:00:00Z", end: "2026-09-12T09:30:00Z" }] } })).rejects.toThrow("reason");
    const result = await f.run({ kind: "schedule_save", input: { ...scheduling, rooms: [] } });
    await expect(f.run({ kind: "schedule_publish", revisionId: result.resourceId! })).rejects.toThrow("conflicts");
    expect(await f.service.readPublishedSchedule("event")).toBeNull();
  });

  it("deduplicates overdue readiness actions without writing results or walkovers", async () => {
    const f = fixture(); const matchId = await f.setup();
    const draft = await f.run({ kind: "schedule_save", input: scheduling });
    await f.run({ kind: "schedule_publish", revisionId: draft.resourceId! });
    await f.run({ kind: "readiness_deadline", matchId });
    await f.run({ kind: "readiness_deadline", matchId });
    expect(f.rows("competitionActionItem")).toHaveLength(2);
    expect(f.rows("competitionActionItem")).toEqual(expect.arrayContaining([expect.objectContaining({ teamId: "a", priority: "critical", resolvedAt: null })]));
    expect(f.rows("match")[0]).toMatchObject({ status: "Scheduled", resultVersion: 0 });
    expect(f.rows("matchResultRevision")).toEqual([]);
    await f.run({ kind: "readiness_update", matchId, teamId: "a", status: "ready" });
    expect(f.rows("competitionActionItem").find(r => r.teamId === "a")?.resolvedAt).toEqual(now);
    expect(f.rows("matchReadiness")[0]).toMatchObject({ actor: "organizer", actorUserId: "owner", readyAt: now });
  });

  it("requires two ready participants to start, or an explicit audited override", async () => {
    const f = fixture(); const matchId = await f.setup();
    await expect(f.run({ kind: "match_start", matchId })).rejects.toThrow("ready");
    await expect(f.run({ kind: "readiness_update", matchId, teamId: "foreign", status: "ready" })).rejects.toThrow("participant");
    await f.run({ kind: "match_start", matchId, reason: "Both captains confirmed verbally" });
    expect(f.rows("match")[0]).toMatchObject({ status: "Live", scheduleStatus: "live", resultVersion: 0 });
    expect(f.rows("competitionAuditLog").at(-1)).toMatchObject({ action: "match_start", reason: "Both captains confirmed verbally", actorUserId: "owner" });
    await expect(f.run({ kind: "match_timing", matchId, status: "postponed", reason: "Power failure" })).rejects.toThrow("live or completed");
  });

  it("starts a ready match and tracks delay and postponement reasons without touching results", async () => {
    const f = fixture(); const matchId = await f.setup();
    await expect(f.run({ kind: "match_timing", matchId, status: "delayed", reason: " " })).rejects.toThrow("reason");
    await f.run({ kind: "match_timing", matchId, status: "delayed", reason: "Room unavailable" });
    await f.run({ kind: "match_timing", matchId, status: "postponed", reason: "Move to tomorrow" });
    expect(f.rows("match")[0].scheduleStatus).toBe("postponed");
    for (const teamId of ["a", "b"]) await f.run({ kind: "readiness_update", matchId, teamId, status: "ready" });
    await f.run({ kind: "match_start", matchId });
    expect(f.rows("match")[0].status).toBe("Live");
  });

  it("records and resolves event-scoped incidents and action items with an audit", async () => {
    const f = fixture(); const matchId = await f.setup();
    const incident = await f.run({ kind: "incident_report", matchId, incidentKind: "disconnect", description: "Connection lost" });
    expect(f.rows("competitionIncident")[0]).toMatchObject({ reportedById: "owner", kind: "disconnect", resolvedAt: null });
    await expect(f.run({ kind: "incident_resolve", incidentId: incident.resourceId!, reason: "" })).rejects.toThrow("reason");
    await f.run({ kind: "incident_resolve", incidentId: incident.resourceId!, reason: "Connection restored" });
    expect(f.rows("competitionIncident")[0].resolvedAt).toEqual(now);
    f.seed("competitionActionItem", { id: "action", eventId: "event", resolvedAt: null });
    await f.run({ kind: "action_resolve", actionId: "action", reason: "Organizer reviewed" });
    expect(f.rows("competitionActionItem")[0].resolvedAt).toEqual(now);
    await expect(f.run({ kind: "incident_report", matchId: "foreign", incidentKind: "disconnect", description: "No" })).rejects.toThrow("Match not found");
  });

  it("saves announcements privately and explicitly publishes and unpublishes them", async () => {
    const f = fixture();
    const draft = await f.run({ kind: "announcement_save", title: "Next round", body: "Starts shortly" });
    expect(f.rows("eventAnnouncement")[0]).toMatchObject({ status: "draft", title: "Next round" });
    await f.run({ kind: "announcement_publish", announcementId: draft.resourceId! });
    expect(f.rows("eventAnnouncement")[0]).toMatchObject({ status: "published", publishedById: "owner", publishedAt: now });
    await f.run({ kind: "announcement_unpublish", announcementId: draft.resourceId! });
    expect(f.rows("eventAnnouncement")[0]).toMatchObject({ status: "draft", publishedAt: null });
    f.seed("eventAnnouncement", { id: "foreign", eventId: "elsewhere", status: "draft" });
    await expect(f.run({ kind: "announcement_publish", announcementId: "foreign" })).rejects.toThrow("Announcement not found");
  });
});
