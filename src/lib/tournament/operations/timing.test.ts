import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { createCompetitionOperations, type OperationCommand } from "./index";
import { operationStore } from "./test-store";
const actor = { id: "owner", role: "organizer" };
const input = { timezone: "Asia/Jakarta", eventWindow: { start: "2026-01-01T02:00:00Z", end: "2026-01-02T02:00:00Z" }, rooms: ["A", "B"], matchDurationMinutes: 30, bufferMinutes: 0, minimumRestMinutes: 0 };
async function fixture() {
  const store = operationStore(); ["c", "d"].forEach(id => store.seed("team", { id, eventId: "event" }));
  let time = new Date("2026-01-01T02:00:00Z"); let key = 0;
  const service = createCompetitionOperations(store.db, () => time);
  const run = (command: OperationCommand) => {
    const latest = store.rows("scheduleRevision").sort((a, b) => Number(b.version) - Number(a.version))[0];
    if (command.kind === "delay_preview" && !command.sourceRevision && latest) command = { ...command, sourceRevision: { id: String(latest.id), version: Number(latest.version), status: latest.status as "draft" | "published" } };
    return service.execute({ eventId: "event", actor, expectedVersion: Number(store.rows("event")[0].competitionVersion), idempotencyKey: `t-${++key}`, command });
  };
  await run({ kind: "initialize", config: { version: 1, kind: "single_elimination", thirdPlace: "none", bestOf: { earlyRounds: 1, semifinals: 1, final: 1, thirdPlace: 1 } }, teams: ["a", "b", "c", "d"].map((id, i) => ({ id, seed: i + 1 })) });
  const draft = await run({ kind: "schedule_save", input }); await run({ kind: "schedule_publish", revisionId: draft.resourceId! });
  return { ...store, run, service, setTime: (value: string) => { time = new Date(value); } };
}
describe("actual timing and delay review", () => {
  it("does not invent an actual end when correcting a pre-migration official result", async () => {
    const f = await fixture(); const id = String(f.rows("match")[0].id);
    await f.run({ kind: "result_submit", matchId: id, games: [{ gameNumber: 1, homeScore: 2, awayScore: 0 }] });
    await f.db.$transaction(async tx => { await tx.match.update({ where: { id }, data: { actualEndedAt: null } }); });
    const games = [{ gameNumber: 1, homeScore: 0, awayScore: 2 }];
    const preview = await f.service.previewResultCorrection({ eventId: "event", actor, matchId: id, games });
    await f.run({ kind: "result_correct", matchId: id, games, reason: "Historical score review", previewToken: preview.token });
    expect(f.rows("match")[0].actualEndedAt).toBeNull();
  });
  it.each(["Completed", "locked"])("rejects a delay of an immutable %s match without partial writes", async status => {
    const f = await fixture(); const id = String(f.rows("match")[0].id);
    await f.db.$transaction(async tx => { await tx.match.update({ where: { id }, data: status === "locked" ? { scheduleStatus: "locked" } : { status } }); });
    const before = f.rows("event")[0].competitionVersion;
    await expect(f.run({ kind: "delay_preview", matchId: id, estimatedEnd: "2026-01-01T03:30:00Z", reason: "Late" })).rejects.toThrow("Cannot move");
    expect(f.rows("event")[0].competitionVersion).toBe(before);
    expect(f.rows("scheduleRevision")).toHaveLength(1);
  });
  it("reports a locked downstream conflict and refuses publication", async () => {
    const f = await fixture(); const root = String(f.rows("match")[0].id); const final = String(f.rows("match")[2].id);
    await f.db.$transaction(async tx => { await tx.match.update({ where: { id: final }, data: { scheduleStatus: "locked" } }); });
    const before = await f.service.readPublishedSchedule("event");
    const receipt = await f.run({ kind: "delay_preview", matchId: root, estimatedEnd: "2026-01-01T03:30:00Z", reason: "Late" });
    expect((await f.service.readScheduleDraft("event", receipt.resourceId!, actor))?.draft.feasible).toBe(false);
    await expect(f.run({ kind: "schedule_publish", revisionId: receipt.resourceId! })).rejects.toThrow("unresolved conflicts");
    expect(await f.service.readPublishedSchedule("event")).toEqual(before);
  });
  it("has nullable actual timing fields", () => {
    const fields = Prisma.dmmf.datamodel.models.find(m => m.name === "Match")!.fields;
    expect(fields.find(f => f.name === "actualStartedAt")).toMatchObject({ type: "DateTime", isRequired: false });
    expect(fields.find(f => f.name === "actualEndedAt")).toMatchObject({ type: "DateTime", isRequired: false });
  });
  it("records actual start/end once and preserves end through a correction", async () => {
    const f = await fixture(); const id = String(f.rows("match")[0].id);
    await f.run({ kind: "match_start", matchId: id, reason: "Desk override" });
    expect(f.rows("match")[0].actualStartedAt).toEqual(new Date("2026-01-01T02:00:00Z"));
    f.setTime("2026-01-01T02:40:00Z");
    await f.run({ kind: "result_submit", matchId: id, games: [{ gameNumber: 1, homeScore: 2, awayScore: 0 }] });
    expect(f.rows("match")[0].actualEndedAt).toEqual(new Date("2026-01-01T02:40:00Z"));
    f.setTime("2026-01-01T03:00:00Z");
    const games = [{ gameNumber: 1, homeScore: 0, awayScore: 2 }];
    const preview = await f.service.previewResultCorrection({ eventId: "event", actor, matchId: id, games });
    await f.run({ kind: "result_correct", matchId: id, games, reason: "Corrected score", previewToken: preview.token });
    expect(f.rows("match")[0].actualEndedAt).toEqual(new Date("2026-01-01T02:40:00Z"));
  });
  it("creates a downstream delay draft without changing published assignments", async () => {
    const f = await fixture(); const id = String(f.rows("match")[0].id);
    const before = await f.service.readPublishedSchedule("event");
    const receipt = await f.run({ kind: "delay_preview", matchId: id, estimatedEnd: "2026-01-01T03:30:00Z", reason: "Room problem" });
    const draft = await f.service.readScheduleDraft("event", receipt.resourceId!, actor);
    expect(draft?.draft.feasible).toBe(true);
    expect(draft?.draft.impact.find(i => i.matchId !== id)?.after?.start).toBe("2026-01-01T03:30:00.000Z");
    expect(await f.service.readPublishedSchedule("event")).toEqual(before);
    expect(f.rows("match")[0].scheduleStatus).toBe("delayed");
    await f.run({ kind: "schedule_publish", revisionId: receipt.resourceId! });
    expect((await f.service.readPublishedSchedule("event"))?.assignments.find(a => a.matchId === id)?.end).toBe("2026-01-01T03:30:00.000Z");
  });
});
