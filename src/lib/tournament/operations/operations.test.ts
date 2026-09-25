import { describe, expect, it } from "vitest";
import { createCompetitionOperations, type OperationCommand, type OperationStageEvent } from "./index";
import { operationStore } from "./test-store";
import { TOURNAMENT_FORMAT_PRESETS } from "../formats/types";

const owner = { id: "owner", role: "organizer" };
const now = new Date("2026-09-12T10:00:00Z");
const initialize: OperationCommand = { kind: "initialize", config: TOURNAMENT_FORMAT_PRESETS.singleElimination, teams: [{ id: "a", seed: 1 }, { id: "b", seed: 2 }] };
const scheduling = { timezone: "Asia/Jakarta", eventWindow: { start: "2026-09-12T09:00:00Z", end: "2026-09-12T12:00:00Z" }, matchDurationMinutes: 30, bufferMinutes: 0, minimumRestMinutes: 0, rooms: ["room"] };
function fixture() {
  const store = operationStore();
  const service = createCompetitionOperations(store.db, () => now, { allowInternalInitialize: true });
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
  it("keeps initialize unavailable at the public service boundary", async () => {
    const store = operationStore();
    const service = createCompetitionOperations(store.db, () => now);
    await expect(service.execute({
      eventId: "event",
      actor: owner,
      expectedVersion: 0,
      idempotencyKey: "public-initialize-bypass",
      command: initialize,
    })).rejects.toThrow("initialize is internal");
  });

  it("keeps drawing drafts private, invalidates dependent schedule drafts, and locks after publish", async () => {
    const f = fixture();
    const first = await f.run({
      kind: "drawing_save",
      config: TOURNAMENT_FORMAT_PRESETS.singleElimination,
      teams: [{ id: "b", seed: 1 }, { id: "a", seed: 2 }],
    });
    expect(first.resourceId).toBeTruthy();
    expect(f.rows("competitionPhase")).toEqual([
      expect.objectContaining({ status: "draft" }),
    ]);
    expect(f.rows("match")[0]).toMatchObject({ homeTeamId: "b", awayTeamId: "a" });

    await f.run({ kind: "schedule_save", input: scheduling });
    expect(f.rows("scheduleRevision")).toHaveLength(1);
    await expect(f.run({
      kind: "schedule_publish",
      revisionId: String(f.rows("scheduleRevision")[0].id),
    })).rejects.toThrow(/drawing.*published/i);

    await f.run({
      kind: "drawing_save",
      config: TOURNAMENT_FORMAT_PRESETS.singleElimination,
      teams: [{ id: "a", seed: 1 }, { id: "b", seed: 2 }],
    });
    expect(f.rows("scheduleRevision")).toEqual([]);
    expect(f.rows("match")[0]).toMatchObject({ homeTeamId: "a", awayTeamId: "b" });

    await f.run({ kind: "drawing_publish" });
    expect(f.rows("competitionPhase")).toEqual([
      expect.objectContaining({ status: "active" }),
    ]);
    await expect(f.run({
      kind: "drawing_save",
      config: TOURNAMENT_FORMAT_PRESETS.singleElimination,
      teams: [{ id: "b", seed: 1 }, { id: "a", seed: 2 }],
    })).rejects.toThrow(/drawing.*locked/i);
    expect(f.rows("competitionAuditLog").map((row) => row.action)).toEqual(
      expect.arrayContaining(["drawing_save", "drawing_publish"]),
    );
  });

  it("resets only an unpublished drawing", async () => {
    const f = fixture();
    await f.run({
      kind: "drawing_save",
      config: TOURNAMENT_FORMAT_PRESETS.singleElimination,
      teams: [{ id: "a", seed: 1 }, { id: "b", seed: 2 }],
    });
    await f.run({ kind: "drawing_reset" });
    expect(f.rows("competitionPhase")).toEqual([]);
    expect(f.rows("match")).toEqual([]);
    expect(f.rows("matchDependency")).toEqual([]);
  });

  it("validates explicit unique drawing seeds instead of inferring registration order", async () => {
    const f = fixture();
    await expect(f.run({
      kind: "drawing_save",
      config: TOURNAMENT_FORMAT_PRESETS.singleElimination,
      teams: [{ id: "a", seed: 1 }, { id: "b", seed: 1 }],
    })).rejects.toThrow();
    expect(f.rows("competitionPhase")).toEqual([]);
  });

  it("requires a drawing draft to contain the complete authoritative event roster", async () => {
    const f = fixture();
    f.seed("team", { id: "c", eventId: "event" });
    await expect(f.run({
      kind: "drawing_save",
      config: TOURNAMENT_FORMAT_PRESETS.singleElimination,
      teams: [{ id: "a", seed: 1 }, { id: "b", seed: 2 }],
    })).rejects.toThrow("complete authoritative roster");
    expect(f.rows("competitionPhase")).toEqual([]);
  });

  it("rejects publishing after the authoritative roster changes", async () => {
    const f = fixture();
    await f.run({
      kind: "drawing_save",
      config: TOURNAMENT_FORMAT_PRESETS.singleElimination,
      teams: [{ id: "a", seed: 1 }, { id: "b", seed: 2 }],
    });
    f.seed("team", { id: "late-team", eventId: "event" });
    await expect(f.run({ kind: "drawing_publish" })).rejects.toThrow("roster changed");
    expect(f.rows("competitionPhase")).toEqual([expect.objectContaining({ status: "draft" })]);
  });

  it("rejects drawing publication while registration remains open", async () => {
    const f = fixture();
    await f.run({
      kind: "drawing_save",
      config: TOURNAMENT_FORMAT_PRESETS.singleElimination,
      teams: [{ id: "a", seed: 1 }, { id: "b", seed: 2 }],
    });
    f.updateRow("event", "event", { status: "Published" });
    await expect(f.run({ kind: "drawing_publish" })).rejects.toThrow("registration is closed");
  });

  it("rejects every new competitive write while tournament completion is locked", async () => {
    const f = fixture();
    f.seed("tournamentCompletion", { id: "completion-1", eventId: "event", status: "completed" });
    await expect(f.run(initialize)).rejects.toThrow("Tournament completion locks competitive writes");
    expect(f.rows("event")[0].competitionVersion).toBe(0);
    expect(f.rows("competitionAuditLog")).toEqual([]);
  });

  it("allows announcement utility writes after completion while retaining the competitive lock", async () => {
    const f = fixture();
    f.seed("tournamentCompletion", { id: "completion-1", eventId: "event", status: "completed" });

    const saved = await f.run({ kind: "announcement_save", title: "Final update", body: "The tournament is complete." });

    expect(saved.resourceId).toBeTruthy();
    expect(f.rows("eventAnnouncement")).toHaveLength(1);
    await expect(f.run(initialize)).rejects.toThrow("Tournament completion locks competitive writes");
  });

  it("defaults legacy announcements to info and lets an organizer review urgency before publishing", async () => {
    const f = fixture();
    const draft = await f.run({ kind: "announcement_save", title: "Urgent title is just text", body: "Message" });
    expect(f.rows("eventAnnouncement")[0]).toMatchObject({ urgency: "info", status: "draft" });
    await f.run({ kind: "announcement_save", announcementId: draft.resourceId!, title: "Notice", body: "Message", urgency: "important" });
    expect(f.rows("eventAnnouncement")).toHaveLength(1);
    expect(f.rows("eventAnnouncement")[0]).toMatchObject({ urgency: "important", status: "draft" });
    await f.run({ kind: "announcement_publish", announcementId: draft.resourceId!, urgency: "urgent" });
    expect(f.rows("eventAnnouncement")[0]).toMatchObject({ urgency: "urgent", status: "published" });
    await expect(f.run({ kind: "announcement_save", announcementId: draft.resourceId!, title: "Changed", body: "Message", urgency: "info" })).rejects.toThrow("Unpublish");
    await expect(f.run({ kind: "announcement_save", announcementId: "foreign", title: "Changed", body: "Message" })).rejects.toThrow("Announcement not found");
    await expect(f.run({ kind: "announcement_publish", announcementId: draft.resourceId!, urgency: "invented" } as unknown as OperationCommand)).rejects.toThrow();
  });
  it.each([false, true])("locks the reviewed draft assignment through regeneration and publication (previously published: %s)", async previouslyPublished => {
    const f = fixture(); const matchId = await f.setup();
    const first = await f.run({ kind: "schedule_save", input: scheduling });
    if (previouslyPublished) await f.run({ kind: "schedule_publish", revisionId: first.resourceId! });
    const reviewed = previouslyPublished ? await f.run({ kind: "schedule_save", input: { ...scheduling, eventWindow: { ...scheduling.eventWindow, start: "2026-09-12T11:00:00Z" } } }) : first;
    const assignment = { matchId, roomId: "room", start: previouslyPublished ? "2026-09-12T11:00:00.000Z" : "2026-09-12T09:00:00.000Z", end: previouslyPublished ? "2026-09-12T11:30:00.000Z" : "2026-09-12T09:30:00.000Z" };
    const next = await f.run({ kind: "schedule_save", input: { ...scheduling, sourceRevision: { id: reviewed.resourceId!, version: reviewed.version, status: "draft" }, lockedMatchIds: [matchId] } });
    expect((await f.service.readScheduleDraft("event", next.resourceId!, owner))?.draft).toMatchObject({ feasible: true, conflicts: [], assignments: [assignment] });
    await f.run({ kind: "schedule_publish", revisionId: next.resourceId! });
    expect((await f.service.readPublishedSchedule("event"))?.assignments).toEqual([assignment]);
  });

  it.each(["missing", "foreign", "version", "status", "superseded", "old_published", "published_with_draft", "missing_assignment", "foreign_match"])("rejects %s lock sources without writing a draft or consuming a version", async invalid => {
    const f = fixture(); const matchId = await f.setup();
    const first = await f.run({ kind: "schedule_save", input: scheduling });
    let source = { id: first.resourceId!, version: first.version, status: "draft" as "draft" | "published" };
    if (invalid === "foreign") {
      f.seed("scheduleRevision", { id: "foreign", eventId: "other-event", version: first.version, status: "draft", snapshot: f.rows("scheduleRevision")[0].snapshot });
      source = { ...source, id: "foreign" };
    }
    if (invalid === "version") source = { ...source, version: 999 };
    if (invalid === "status") source = { ...source, status: "published" };
    if (invalid === "superseded") await f.run({ kind: "schedule_save", input: scheduling });
    if (invalid === "old_published" || invalid === "published_with_draft") {
      await f.run({ kind: "schedule_publish", revisionId: first.resourceId! });
      source = { ...source, status: "published" };
      const second = await f.run({ kind: "schedule_save", input: scheduling });
      if (invalid === "old_published") await f.run({ kind: "schedule_publish", revisionId: second.resourceId! });
    }
    if (invalid === "missing_assignment") await f.db.$transaction(async tx => { await tx.scheduleRevision.update({ where: { id: first.resourceId! }, data: { snapshot: { draft: { assignments: [] } } } }); });
    const before = f.rows("event")[0].competitionVersion;
    const drafts = f.rows("scheduleRevision").length;
    await expect(f.run({ kind: "schedule_save", input: { ...scheduling, ...(invalid === "missing" ? {} : { sourceRevision: source }), lockedMatchIds: [invalid === "foreign_match" ? "other-event-match" : matchId] } })).rejects.toThrow(/source revision/i);
    expect(f.rows("event")[0].competitionVersion).toBe(before);
    expect(f.rows("scheduleRevision")).toHaveLength(drafts);
  });

  it("uses the selected published source and keeps live assignments immutable", async () => {
    const f = fixture(); const matchId = await f.setup();
    const first = await f.run({ kind: "schedule_save", input: scheduling });
    await f.run({ kind: "schedule_publish", revisionId: first.resourceId! });
    await f.run({ kind: "match_start", matchId, reason: "Ready at desk" });
    const next = await f.run({ kind: "schedule_save", input: { ...scheduling, sourceRevision: { id: first.resourceId!, version: first.version, status: "published" }, lockedMatchIds: [matchId], manualOverrides: [{ matchId, roomId: "room", start: "2026-09-12T11:00:00Z", end: "2026-09-12T11:30:00Z" }] }, reason: "Attempted change" });
    const review = await f.service.readScheduleDraft("event", next.resourceId!, owner);
    expect(review?.draft.feasible).toBe(false);
    expect(review?.draft.conflicts.some(c => c.code === "IMMUTABLE_OVERRIDE")).toBe(true);
    expect(f.rows("match")[0].scheduledAt).toEqual(new Date("2026-09-12T09:00:00Z"));
  });
  it.each(["live", "completed", "locked"] as const)("prefers persisted %s protection over an earlier reviewed preview", async status => {
    const f = fixture(); const matchId = await f.setup();
    const first = await f.run({ kind: "schedule_save", input: scheduling });
    await f.run({ kind: "schedule_publish", revisionId: first.resourceId! });
    const preview = await f.run({ kind: "schedule_save", input: { ...scheduling, eventWindow: { ...scheduling.eventWindow, start: "2026-09-12T11:00:00Z" } } });
    if (status === "live") await f.run({ kind: "match_start", matchId, reason: "Ready at desk" });
    else await f.db.$transaction(async tx => { await tx.match.update({ where: { id: matchId }, data: { scheduleStatus: status, ...(status === "completed" ? { status: "Completed", resultVersion: 1 } : {}) } }); });
    const next = await f.run({ kind: "schedule_save", input: { ...scheduling, sourceRevision: { id: preview.resourceId!, version: preview.version, status: "draft" }, lockedMatchIds: [matchId] } });
    const review = await f.service.readScheduleDraft("event", next.resourceId!, owner);
    expect(review?.draft).toMatchObject({ feasible: true, conflicts: [], assignments: [{ matchId, roomId: "room", start: "2026-09-12T09:00:00.000Z", end: "2026-09-12T09:30:00.000Z" }] });
    await f.run({ kind: "schedule_publish", revisionId: next.resourceId! });
    expect(f.rows("match")[0]).toMatchObject({ scheduleStatus: status, scheduledAt: new Date("2026-09-12T09:00:00Z") });
  });
  it.each([false, true])("rejects start before a published assignment even with readiness override=%s", async override => {
    const f = fixture(); const matchId = await f.setup();
    if (!override) for (const teamId of ["a", "b"]) await f.run({ kind: "readiness_update", matchId, teamId, status: "ready" });
    const command: OperationCommand = { kind: "match_start", matchId, ...(override ? { reason: "Ready at desk" } : {}) };
    await expect(f.run(command)).rejects.toThrow("published schedule assignment");
    await f.run({ kind: "schedule_save", input: scheduling });
    await expect(f.run(command)).rejects.toThrow("published schedule assignment");
    expect(f.rows("match")[0]).toMatchObject({ status: "Scheduled", scheduleStatus: "estimated" });
    expect(f.rows("competitionAuditLog").some(row => row.action === "match_start")).toBe(false);
  });

  it.each([false, true])("publishes, starts, and republishes around a live match with override=%s", async override => {
    const f = fixture(); const matchId = await f.setup();
    const draft = await f.run({ kind: "schedule_save", input: scheduling });
    await f.run({ kind: "schedule_publish", revisionId: draft.resourceId! });
    if (!override) for (const teamId of ["a", "b"]) await f.run({ kind: "readiness_update", matchId, teamId, status: "ready" });
    await f.run({ kind: "match_start", matchId, ...(override ? { reason: "Ready at desk" } : {}) });
    const next = await f.run({ kind: "schedule_save", input: scheduling });
    expect((await f.service.readScheduleDraft("event", next.resourceId!, owner))?.draft).toMatchObject({ feasible: true, conflicts: [] });
    await f.run({ kind: "schedule_publish", revisionId: next.resourceId! });
    expect(f.rows("match")[0]).toMatchObject({ status: "Live", scheduleStatus: "live", scheduleRoom: "room", scheduledAt: new Date("2026-09-12T09:00:00Z"), scheduledEndsAt: new Date("2026-09-12T09:30:00Z") });
  });

  it.each(["unselected", "draft", "missing_revision", "missing_assignment", "missing_room", "missing_start", "missing_end", "zero_duration", "wrong_room", "wrong_version"])("rejects start when the selected published assignment is %s", async invalid => {
    const f = fixture(); const matchId = await f.setup();
    const saved = await f.run({ kind: "schedule_save", input: scheduling });
    await f.run({ kind: "schedule_publish", revisionId: saved.resourceId! });
    await f.db.$transaction(async tx => {
      if (invalid === "unselected" || invalid === "missing_revision") await tx.event.update({ where: { id: "event" }, data: { publishedScheduleVersion: invalid === "unselected" ? null : 999 } });
      if (invalid === "draft") await tx.scheduleRevision.update({ where: { id: saved.resourceId! }, data: { status: "draft" } });
      if (invalid === "missing_assignment") await tx.scheduleRevision.update({ where: { id: saved.resourceId! }, data: { snapshot: { draft: { assignments: [] } } } });
      if (invalid === "missing_room") await tx.match.update({ where: { id: matchId }, data: { scheduleRoom: null } });
      if (invalid === "missing_start") await tx.match.update({ where: { id: matchId }, data: { scheduledAt: null } });
      if (invalid === "missing_end") await tx.match.update({ where: { id: matchId }, data: { scheduledEndsAt: null } });
      if (invalid === "zero_duration") await tx.match.update({ where: { id: matchId }, data: { scheduledEndsAt: new Date("2026-09-12T09:00:00Z") } });
      if (invalid === "wrong_room") await tx.match.update({ where: { id: matchId }, data: { scheduleRoom: "elsewhere" } });
      if (invalid === "wrong_version") await tx.match.update({ where: { id: matchId }, data: { scheduleVersion: 999 } });
    });
    await expect(f.run({ kind: "match_start", matchId, reason: "Ready at desk" })).rejects.toThrow("published schedule assignment");
    expect(f.rows("match")[0].status).toBe("Scheduled");
  });

  it.each([
    ["singleElimination", 15, 1, 0, 0],
    ["doubleElimination", 30, 1, 0, 0],
    ["roundRobin", 120, 1, 0, 0],
    ["groupPlayoffs", 31, 2, 4, 16],
  ] as const)("persists %s phases, fixtures and group membership", async (format, matches, phases, groups, members) => {
    const f = fixture();
    const teams = ["a", "b", ...Array.from({ length: 14 }, (_, i) => `team-${i + 3}`)];
    teams.slice(2).forEach(id => f.seed("team", { id, eventId: "event" }));
    await f.run({ kind: "initialize", config: TOURNAMENT_FORMAT_PRESETS[format], teams: teams.map((id, i) => ({ id, seed: i + 1 })) });
    expect(f.rows("match")).toHaveLength(matches);
    expect(f.rows("competitionPhase")).toHaveLength(phases);
    expect(f.rows("competitionGroup")).toHaveLength(groups);
    expect(f.rows("competitionGroupMember")).toHaveLength(members);
    expect(new Set(f.rows("match").map(row => `${row.round}:${row.slot}`)).size).toBe(matches);
    for (const dependency of f.rows("matchDependency")) {
      expect(f.rows("match").some(row => row.id === dependency.sourceMatchId)).toBe(true);
      expect(f.rows("match").some(row => row.id === dependency.targetMatchId)).toBe(true);
    }
  });

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
    const service = createCompetitionOperations(db, () => now, { allowInternalInitialize: true });
    expect(await service.execute({ eventId: "event", actor: owner, expectedVersion: 0, idempotencyKey: "retry", command: initialize })).toMatchObject({ version: 1 });
    expect(store.rows("competitionAuditLog")).toHaveLength(1);
    expect(store.rows("match")).toHaveLength(1);
  });

  it("fails a stale CAS immediately without retrying the same expected version", async () => {
    const store = operationStore();
    let transactionCalls = 0;
    const db = {
      $transaction: (...args: unknown[]) => {
        transactionCalls += 1;
        return Reflect.apply(store.db.$transaction, store.db, args);
      },
    } as typeof store.db;
    const service = createCompetitionOperations(db, () => now, { allowInternalInitialize: true });

    await expect(service.execute({
      eventId: "event",
      actor: owner,
      expectedVersion: 1,
      idempotencyKey: "stale-cas",
      command: initialize,
    })).rejects.toThrow("refresh competition state");

    expect(transactionCalls).toBe(1);
    expect(store.rows("event")[0].competitionVersion).toBe(0);
    expect(store.rows("match")).toEqual([]);
    expect(store.rows("competitionAuditLog")).toEqual([]);
  });

  it("rejects other organizers and captain commands outside readiness, but permits Platform Admin", async () => {
    const f = fixture();
    for (const actor of [{ id: "other", role: "organizer" }, { id: "owner", role: "captain" }])
      await expect(f.run(initialize, actor)).rejects.toThrow("Not authorized");
    expect(f.rows("competitionAuditLog")).toHaveLength(0);
    expect(f.rows("event")[0].competitionVersion).toBe(0);
    await f.run(initialize, { id: "admin", role: "platform_admin" });
    expect(f.rows("match")).toHaveLength(1);
  });

  it("lets a captain update only their own participating team's readiness", async () => {
    const f = fixture(); const matchId = await f.setup();
    await f.db.$transaction(async tx => {
      await tx.team.update({ where: { id: "a" }, data: { captainId: "captain-a" } });
      await tx.team.update({ where: { id: "b" }, data: { captainId: "captain-b" } });
    });
    await f.run({ kind: "readiness_update", matchId, teamId: "a", status: "checked_in" }, { id: "captain-a", role: "captain" });
    expect(f.rows("matchReadiness")[0]).toMatchObject({ teamId: "a", status: "checked_in", actor: "captain", actorUserId: "captain-a" });
    await expect(f.run({ kind: "readiness_update", matchId, teamId: "b", status: "ready" }, { id: "captain-a", role: "captain" })).rejects.toThrow("Not authorized");
    await expect(f.run({ kind: "announcement_save", title: "No", body: "No" }, { id: "captain-a", role: "captain" })).rejects.toThrow("Not authorized");
    expect(f.rows("event")[0].competitionVersion).toBe(2);
    expect(f.rows("competitionAuditLog")).toHaveLength(2);
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

  it("reports bounded 24-team drawing stages and preserves rollback on a match write failure", async () => {
    const store = operationStore();
    const teams = Array.from({ length: 24 }, (_, index) => ({
      id: index === 0 ? "a" : index === 1 ? "b" : `team-${String(index + 1).padStart(2, "0")}`,
      seed: index + 1,
    }));
    for (const team of teams.slice(2)) store.seed("team", { id: team.id, eventId: "event" });
    const stages: OperationStageEvent[] = [];
    const service = createCompetitionOperations(store.db, () => now, {
      allowInternalInitialize: true,
      onStage: (event) => stages.push(event),
    });
    store.failWritesAfter("match", 1);

    await expect(service.execute({
      eventId: "event",
      actor: owner,
      expectedVersion: 0,
      idempotencyKey: "drawing-stage-failure",
      command: { kind: "drawing_save", config: TOURNAMENT_FORMAT_PRESETS.singleElimination, teams },
    })).rejects.toThrow("storage failure");

    expect(stages.find((stage) => stage.stage === "drawing_matches" && stage.phase === "failed")).toMatchObject({
      errorCode: "internal_error",
      counts: { matchCount: 31 },
    });
    expect(stages.find((stage) => stage.stage === "competition_transaction" && stage.phase === "failed")).toMatchObject({
      errorCode: "internal_error",
    });
    expect(stages.every((stage) => stage.durationMs >= 0)).toBe(true);
    expect(store.rows("event")[0]).toMatchObject({ competitionVersion: 0 });
    expect(store.rows("competitionPhase")).toEqual([]);
    expect(store.rows("match")).toEqual([]);
    expect(store.rows("matchDependency")).toEqual([]);
    expect(store.rows("competitionAuditLog")).toEqual([]);
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
    const draft = await f.run({ kind: "schedule_save", input: scheduling });
    await f.run({ kind: "schedule_publish", revisionId: draft.resourceId! });
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
    const draft = await f.run({ kind: "schedule_save", input: scheduling });
    await f.run({ kind: "schedule_publish", revisionId: draft.resourceId! });
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
