import { describe, expect, it } from "vitest";
import { createCompetitionOperations, type OperationCommand } from "./index";
import { operationStore } from "./test-store";
import { TOURNAMENT_FORMAT_PRESETS } from "../formats/types";
import type { CompetitionGraph } from "../competition";
const actor = { id: "owner", role: "organizer" };
const scheduling = { timezone: "Asia/Jakarta", eventWindow: { start: "2026-01-01T02:00:00Z", end: "2026-01-02T02:00:00Z" }, rooms: ["A", "B"], matchDurationMinutes: 30, bufferMinutes: 0, minimumRestMinutes: 0 };
async function fixture(count = 4, double = false) {
  const store = operationStore(); const teams = ["a", "b", ...Array.from({ length: count - 2 }, (_, i) => `team-${i}`)];
  teams.slice(2).forEach(id => store.seed("team", { id, eventId: "event" }));
  const service = createCompetitionOperations(store.db, () => new Date("2026-01-01T02:00:00Z")); let key = 0;
  const execute = (command: OperationCommand) => service.execute({ eventId: "event", actor, expectedVersion: Number(store.rows("event")[0].competitionVersion), idempotencyKey: `d-${++key}`, command });
  await execute({ kind: "initialize", config: double ? TOURNAMENT_FORMAT_PRESETS.doubleElimination : TOURNAMENT_FORMAT_PRESETS.singleElimination, teams: teams.map((id, i) => ({ id, seed: i + 1 })) });
  const first = await execute({ kind: "schedule_save", input: scheduling }); await execute({ kind: "schedule_publish", revisionId: first.resourceId! });
  const source = () => { const revisions = store.rows("scheduleRevision").sort((a, b) => Number(b.version) - Number(a.version)); const r = revisions[0]; return { id: String(r.id), version: Number(r.version), status: r.status as "draft" | "published" }; };
  const graph = (store.rows("competitionPhase")[0].configuration as { graph: CompetitionGraph }).graph;
  const delay = (matchId: string, estimatedEnd: string, sourceRevision = source()) => execute({ kind: "delay_preview", matchId, estimatedEnd, sourceRevision, reason: "Room delay" } as OperationCommand);
  return { ...store, service, execute, source, delay, graph };
}
describe("reviewed delay revisions", () => {
  it("retains a scheduled semifinal delay across regeneration and resolves it only on represented publication", async () => {
    const f = await fixture(); const root = f.graph.matches[0];
    await f.delay(root.id, "2026-01-01T03:30:00Z");
    const saved = await f.execute({ kind: "schedule_save", input: { ...scheduling, sourceRevision: f.source() } });
    expect(f.rows("match")[0].scheduleStatus).toBe("delayed");
    const draft = await f.service.readScheduleDraft("event", saved.resourceId!, actor);
    expect(draft?.draft.assignments.find(a => a.matchId === root.id)?.end).toBe("2026-01-01T03:30:00.000Z");
    expect(f.rows("competitionActionItem")[0].resolvedAt).toBeNull();
    await f.execute({ kind: "schedule_publish", revisionId: saved.resourceId! });
    expect((await f.service.readPublishedSchedule("event"))?.assignments.find(a => a.matchId === root.id)?.end).toBe("2026-01-01T03:30:00.000Z");
    expect(f.rows("competitionActionItem")[0].resolvedAt).toBeInstanceOf(Date);
  });
  it("rejects publication that truncates an active delay until organizer explicitly resolves it", async () => {
    const f = await fixture(); const root = f.graph.matches[0];
    await f.delay(root.id, "2026-01-01T03:30:00Z");
    const saved = await f.execute({ kind: "schedule_save", reason: "Attempt shorter estimate", input: { ...scheduling, sourceRevision: f.source(), manualOverrides: [{ matchId: root.id, roomId: "A", start: "2026-01-01T02:00:00Z", end: "2026-01-01T02:30:00Z" }] } });
    const before = await f.service.readPublishedSchedule("event");
    await expect(f.execute({ kind: "schedule_publish", revisionId: saved.resourceId! })).rejects.toThrow(/delay.*estimate/i);
    expect(await f.service.readPublishedSchedule("event")).toEqual(before);
    expect(f.rows("competitionActionItem")[0].resolvedAt).toBeNull();
    await f.execute({ kind: "action_resolve", actionId: String(f.rows("competitionActionItem")[0].id), reason: "Organizer verified delay cleared" });
    await expect(f.execute({ kind: "schedule_publish", revisionId: saved.resourceId! })).resolves.toBeDefined();
  });
  it("rejects an older malformed snapshot that silently drops source delay metadata", async () => {
    const f = await fixture(); const root = f.graph.matches[0];
    await f.delay(root.id, "2026-01-01T03:30:00Z");
    const saved = await f.execute({ kind: "schedule_save", input: { ...scheduling, sourceRevision: f.source() } });
    await f.db.$transaction(async tx => {
      const revision = await tx.scheduleRevision.findUniqueOrThrow({ where: { id: saved.resourceId! } });
      const snapshot = revision.snapshot as unknown as import("./state").StoredSchedule;
      delete snapshot.delayEstimates;
      snapshot.draft.assignments.find(a => a.matchId === root.id)!.end = "2026-01-01T02:30:00.000Z";
      await tx.scheduleRevision.update({ where: { id: revision.id }, data: { snapshot: JSON.parse(JSON.stringify(snapshot)) } });
    });
    await expect(f.execute({ kind: "schedule_publish", revisionId: saved.resourceId! })).rejects.toThrow(/delay.*estimate/i);
  });
  it("aggregates two unpublished delays and only resolves represented action items", async () => {
    const f = await fixture(); const [a, b] = f.graph.matches;
    await f.delay(a.id, "2026-01-01T03:00:00Z");
    const last = await f.delay(b.id, "2026-01-01T03:30:00Z");
    f.seed("competitionActionItem", { id: "unrelated", eventId: "event", conditionKey: `delay:${f.graph.matches[2].id}`, resolvedAt: null });
    await f.execute({ kind: "schedule_publish", revisionId: last.resourceId! });
    const schedule = await f.service.readPublishedSchedule("event");
    expect(schedule?.assignments.find(m => m.matchId === a.id)?.end).toBe("2026-01-01T03:00:00.000Z");
    expect(schedule?.assignments.find(m => m.matchId === b.id)?.end).toBe("2026-01-01T03:30:00.000Z");
    expect(f.rows("competitionActionItem").find(a => a.id === "unrelated")?.resolvedAt).toBeNull();
    expect(f.rows("competitionActionItem").filter(a => a.id !== "unrelated").every(a => a.resolvedAt instanceof Date)).toBe(true);
  });
  it("rejects stale sources and publication of a superseded delay draft", async () => {
    const f = await fixture(); const source = f.source(); const [a, b] = f.graph.matches;
    const first = await f.delay(a.id, "2026-01-01T03:00:00Z");
    await expect(f.delay(b.id, "2026-01-01T03:30:00Z", source)).rejects.toThrow(/source.*stale/i);
    const second = await f.delay(b.id, "2026-01-01T03:30:00Z");
    await expect(f.execute({ kind: "schedule_publish", revisionId: first.resourceId! })).rejects.toThrow(/stale|superseded/i);
    expect((await f.service.readScheduleDraft("event", second.resourceId!, actor))?.draft.feasible).toBe(true);
  });
  it("retries exactly once and rejects a competing request at the same version without partial writes", async () => {
    const f = await fixture(); const [a, b] = f.graph.matches;
    const request = { eventId: "event", actor, expectedVersion: Number(f.rows("event")[0].competitionVersion), idempotencyKey: "delay-retry", command: { kind: "delay_preview", matchId: a.id, estimatedEnd: "2026-01-01T03:00:00Z", sourceRevision: f.source(), reason: "Room problem" } as OperationCommand };
    const receipt = await f.service.execute(request);
    expect(await f.service.execute(request)).toEqual(receipt);
    const before = f.rows("scheduleRevision");
    await expect(f.service.execute({ ...request, idempotencyKey: "competing-delay", command: { ...request.command, matchId: b.id } as OperationCommand })).rejects.toThrow(/Version conflict/);
    expect(f.rows("scheduleRevision")).toEqual(before);
    expect(f.rows("match").find(m => m.id === b.id)?.scheduleStatus).toBe("confirmed");
  });
  it("preserves reviewed manual room assignments and locks while aggregating delays", async () => {
    const f = await fixture(); const [a, b, final] = f.graph.matches;
    await f.execute({ kind: "schedule_save", reason: "Organizer review", input: { ...scheduling, sourceRevision: f.source(), manualOverrides: [{ matchId: final.id, roomId: "B", start: "2026-01-01T04:00:00Z", end: "2026-01-01T04:30:00Z" }] } });
    await f.execute({ kind: "schedule_save", reason: "Lock reviewed final", input: { ...scheduling, sourceRevision: f.source(), lockedMatchIds: [final.id] } });
    await f.delay(a.id, "2026-01-01T03:00:00Z"); const last = await f.delay(b.id, "2026-01-01T03:30:00Z");
    await f.execute({ kind: "schedule_publish", revisionId: last.resourceId! });
    expect((await f.service.readPublishedSchedule("event"))?.assignments.find(m => m.matchId === final.id)).toMatchObject({ roomId: "B", start: "2026-01-01T04:00:00.000Z" });
  });
  it("retains a reviewed live estimate when organizer regenerates the draft before publication", async () => {
    const f = await fixture(); const root = f.graph.matches[0];
    await f.execute({ kind: "match_start", matchId: root.id, reason: "Desk ready" });
    await f.delay(root.id, "2026-01-01T03:30:00Z");
    const draft = await f.execute({ kind: "schedule_save", input: { ...scheduling, sourceRevision: f.source() } });
    await f.execute({ kind: "schedule_publish", revisionId: draft.resourceId! });
    expect((await f.service.readPublishedSchedule("event"))?.assignments.find(m => m.matchId === root.id)?.end).toBe("2026-01-01T03:30:00.000Z");
  });
  it("requires an explicit source when rebuilding a pending delay review", async () => {
    const f = await fixture(); await f.delay(f.graph.matches[0].id, "2026-01-01T03:00:00Z");
    await expect(f.execute({ kind: "schedule_save", input: scheduling })).rejects.toThrow(/source.*required/i);
  });
  it("preserves pending live delay in the automatic result impact draft", async () => {
    const f = await fixture(); const [a, b] = f.graph.matches;
    await f.execute({ kind: "match_start", matchId: a.id, reason: "Desk ready" });
    await f.delay(a.id, "2026-01-01T03:30:00Z");
    await f.execute({ kind: "match_start", matchId: b.id, reason: "Desk ready" });
    await f.execute({ kind: "result_submit", matchId: b.id, games: [{ gameNumber: 1, homeScore: 2, awayScore: 0 }, { gameNumber: 2, homeScore: 2, awayScore: 0 }] });
    await f.execute({ kind: "schedule_publish", revisionId: f.source().id });
    expect((await f.service.readPublishedSchedule("event"))?.assignments.find(m => m.matchId === a.id)?.end).toBe("2026-01-01T03:30:00.000Z");
    expect(f.rows("competitionActionItem").find(i => i.conditionKey === `delay:${a.id}`)?.resolvedAt).toBeInstanceOf(Date);
  });
  it.each([[3, false], [5, true]] as const)("supports playable-only delay with %i teams (double=%s)", async (count, double) => {
    const f = await fixture(count, double); const root = f.graph.matches.find(m => m.status === "pending" && m.home.kind === "team" && m.away.kind === "team")!;
    const receipt = await f.delay(root.id, "2026-01-01T02:45:00Z");
    expect((await f.service.readScheduleDraft("event", receipt.resourceId!, actor))?.draft.feasible).toBe(true);
    await expect(f.execute({ kind: "schedule_publish", revisionId: receipt.resourceId! })).resolves.toBeDefined();
  });
  it("reviews a live overrun without moving start/room/actual start or publishing the estimate", async () => {
    const f = await fixture(); const root = f.graph.matches[0];
    await f.execute({ kind: "match_start", matchId: root.id, reason: "Both teams at desk" });
    const before = f.rows("match")[0]; const published = await f.service.readPublishedSchedule("event");
    const receipt = await f.delay(root.id, "2026-01-01T03:30:00Z");
    expect(f.rows("match")[0]).toMatchObject({ status: "Live", scheduleStatus: "delayed", scheduledAt: before.scheduledAt, scheduleRoom: before.scheduleRoom, actualStartedAt: before.actualStartedAt, scheduledEndsAt: before.scheduledEndsAt });
    expect(await f.service.readPublishedSchedule("event")).toEqual(published);
    const draft = await f.service.readScheduleDraft("event", receipt.resourceId!, actor);
    expect(draft?.draft.feasible).toBe(true);
    expect(draft?.draft.assignments.find(a => a.matchId === f.graph.matches[2].id)?.start).toBe("2026-01-01T03:30:00.000Z");
    await f.execute({ kind: "schedule_publish", revisionId: receipt.resourceId! });
    expect(f.rows("match")[0]).toMatchObject({ status: "Live", scheduleStatus: "delayed", scheduledAt: before.scheduledAt, scheduleRoom: before.scheduleRoom, actualStartedAt: before.actualStartedAt });
    expect((await f.service.readPublishedSchedule("event"))?.assignments.find(a => a.matchId === root.id)?.end).toBe("2026-01-01T03:30:00.000Z");
    const update = await f.delay(root.id, "2026-01-01T04:00:00Z");
    expect((await f.service.readPublishedSchedule("event"))?.assignments.find(a => a.matchId === root.id)?.end).toBe("2026-01-01T03:30:00.000Z");
    await f.execute({ kind: "schedule_publish", revisionId: update.resourceId! });
    expect(f.rows("match")[0]).toMatchObject({ status: "Live", scheduledAt: before.scheduledAt, scheduleRoom: before.scheduleRoom, actualStartedAt: before.actualStartedAt, scheduledEndsAt: new Date("2026-01-01T04:00:00Z") });
  });
});
