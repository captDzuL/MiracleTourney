import { describe, expect, it } from "vitest";
import { generateCompetitionGraph, type CompetitionGraph, type CompetitionMatch, type ParticipantSource } from "../competition";
import { TOURNAMENT_FORMAT_PRESETS } from "../formats/types";
import * as scheduling from "./index";

const graph = (): CompetitionGraph => generateCompetitionGraph({
  eventId: "cup", config: TOURNAMENT_FORMAT_PRESETS.singleElimination,
  teams: [{ id: "a", seed: 1 }, { id: "b", seed: 2 }, { id: "c", seed: 3 }, { id: "d", seed: 4 }],
});
const input = () => ({ graph: graph(), timezone: "Asia/Jakarta", eventWindow: {
  start: "2026-09-12T09:00:00+07:00", end: "2026-09-12T13:00:00+07:00",
}, matchDurationMinutes: 30, bufferMinutes: 5, minimumRestMinutes: 10, rooms: ["B", "A"] });
const rows = (draft: ReturnType<typeof scheduling.planSchedule>) => draft.assignments.map(a => [a.matchId, a.roomId, a.start, a.end]);
const team = (teamId: string): ParticipantSource => ({ kind: "team", teamId, seed: 1 });
const winner = (matchId: string): ParticipantSource => ({ kind: "match", matchId, outcome: "winner" });
const match = (id: string, home = team(id + "1"), away = team(id + "2")): CompetitionMatch => ({
  id, home, away, phaseId: "phase", groupId: null, bracket: "single", round: 1, slot: 1, leg: 1, bestOf: 1, status: "pending", advance: null,
});
const withMatches = (...matches: CompetitionMatch[]) => ({ ...input(), graph: { ...graph(), matches, dependencies: [], qualificationDependencies: [] } });
const assigned = (matchId: string, roomId: string, start: string, end: string) => ({ matchId, roomId, start: `2026-09-12T${start}:00.000Z`, end: `2026-09-12T${end}:00.000Z` });

describe("schedule planning", () => {
  it("places simultaneous independent matches then the final after both teams rest", () => {
    expect(scheduling.planSchedule).toBeTypeOf("function");
    const draft = scheduling.planSchedule(input());
    expect(rows(draft)).toEqual([
      ["cup:single:r1:m1", "A", "2026-09-12T02:00:00.000Z", "2026-09-12T02:30:00.000Z"],
      ["cup:single:r1:m2", "B", "2026-09-12T02:00:00.000Z", "2026-09-12T02:30:00.000Z"],
      ["cup:single:r2:m1", "A", "2026-09-12T02:40:00.000Z", "2026-09-12T03:10:00.000Z"],
    ]);
    expect(draft.conflicts).toEqual([]);
    expect(draft.kind).toBe("draft");
    expect(draft.timezone).toBe("Asia/Jakarta");
    const reordered = input();
    reordered.graph.matches.reverse(); reordered.graph.dependencies.reverse(); reordered.rooms.reverse();
    expect(scheduling.planSchedule(reordered)).toEqual(draft);
  });

  it("enforces team rest across unrelated round-robin matches and room turnaround", () => {
    const request = withMatches(match("a", team("shared")), match("b", team("shared")), match("c"));
    expect(rows(scheduling.planSchedule(request))).toEqual([
      ["a", "A", "2026-09-12T02:00:00.000Z", "2026-09-12T02:30:00.000Z"],
      ["b", "A", "2026-09-12T02:40:00.000Z", "2026-09-12T03:10:00.000Z"],
      ["c", "B", "2026-09-12T02:00:00.000Z", "2026-09-12T02:30:00.000Z"],
    ]);
    expect(rows(scheduling.planSchedule({ ...withMatches(match("a"), match("b")), rooms: ["A"] }))).toEqual([
      ["a", "A", "2026-09-12T02:00:00.000Z", "2026-09-12T02:30:00.000Z"],
      ["b", "A", "2026-09-12T02:35:00.000Z", "2026-09-12T03:05:00.000Z"],
    ]);
  });

  it("leaves impossible matches unscheduled with explicit event-window conflicts", () => {
    const request = { ...input(), eventWindow: { start: "2026-09-12T02:00:00Z", end: "2026-09-12T02:30:00Z" } };
    const draft = scheduling.planSchedule(request);
    expect(draft.assignments.map(a => a.matchId)).toEqual(["cup:single:r1:m1", "cup:single:r1:m2"]);
    expect(draft.conflicts.map(c => [c.code, c.matchIds])).toEqual([["NO_FEASIBLE_SLOT", ["cup:single:r2:m1"]]]);
  });

  it("infers missing dependency edges from participant sources and rests lower-bracket entrants", () => {
    const draft = scheduling.planSchedule(withMatches(
      match("a"), match("b", { kind: "match", matchId: "a", outcome: "loser" }), match("c", winner("b")),
    ));
    expect(rows(draft)).toEqual([
      ["a", "A", "2026-09-12T02:00:00.000Z", "2026-09-12T02:30:00.000Z"],
      ["b", "A", "2026-09-12T02:40:00.000Z", "2026-09-12T03:10:00.000Z"],
      ["c", "A", "2026-09-12T03:20:00.000Z", "2026-09-12T03:50:00.000Z"],
    ]);
  });

  it("schedules group-rank TBD participants after all group games and required rest", () => {
    const request = withMatches(match("a", team("x"), team("y")), match("b", team("z"), team("w")),
      match("c", { kind: "group_rank", groupId: "g", rank: 1 }, team("v")));
    request.graph.matches[0].groupId = "g";
    request.graph.matches[1].groupId = "g";
    request.graph.groups = [{ id: "g", phaseId: "phase", label: "G", sequence: 1, teams: ["x", "y", "z", "w"].map(id => ({ id, seed: 1 })), qualificationCutline: 1 }];
    const draft = scheduling.planSchedule(request);
    expect(rows(draft)).toEqual([
      ["a", "A", "2026-09-12T02:00:00.000Z", "2026-09-12T02:30:00.000Z"],
      ["b", "B", "2026-09-12T02:00:00.000Z", "2026-09-12T02:30:00.000Z"],
      ["c", "A", "2026-09-12T02:40:00.000Z", "2026-09-12T03:10:00.000Z"],
    ]);
    expect(draft.warnings.map(w => [w.code, w.matchIds])).toContainEqual(["TBD_PARTICIPANTS", ["c"]]);
  });

  it("reports missing and cyclic dependencies without assigning dependent games", () => {
    const draft = scheduling.planSchedule(withMatches(match("a", winner("b")), match("b", winner("a")), match("c", winner("missing"))));
    expect(draft.assignments).toEqual([]);
    expect(draft.conflicts.map(c => [c.code, c.matchIds])).toEqual([
      ["UNRESOLVED_DEPENDENCY", ["a"]], ["UNRESOLVED_DEPENDENCY", ["b"]], ["UNRESOLVED_DEPENDENCY", ["c"]],
    ]);
  });
});

describe("existing schedules and fixed assignments", () => {
  it("preserves a feasible existing schedule and reserves it before placing new matches", () => {
    const request = { ...withMatches(match("a"), match("b")), rooms: ["A"], existingAssignments: [assigned("b", "A", "02:00", "02:30")] };
    const original = structuredClone(request);
    const draft = scheduling.planSchedule(request);
    expect(rows(draft)).toEqual([
      ["a", "A", "2026-09-12T02:35:00.000Z", "2026-09-12T03:05:00.000Z"],
      ["b", "A", "2026-09-12T02:00:00.000Z", "2026-09-12T02:30:00.000Z"],
    ]);
    expect(draft.affectedMatchIds).toEqual(["a"]);
    expect(request).toEqual(original);
  });

  it("keeps an existing later slot to minimize churn", () => {
    const draft = scheduling.planSchedule({ ...withMatches(match("a")), existingAssignments: [assigned("a", "B", "03:00", "03:30")] });
    expect(rows(draft)).toEqual([["a", "B", "2026-09-12T03:00:00.000Z", "2026-09-12T03:30:00.000Z"]]);
    expect(draft.affectedMatchIds).toEqual([]);
  });

  it("applies manual overrides exactly and drafts the dependent delay", () => {
    const draft = scheduling.planSchedule({ ...withMatches(match("a"), match("b", winner("a"))),
      existingAssignments: [assigned("a", "A", "02:00", "02:30"), assigned("b", "A", "02:40", "03:10")],
      manualOverrides: [assigned("a", "B", "02:20", "02:50")],
    });
    expect(rows(draft)).toEqual([
      ["a", "B", "2026-09-12T02:20:00.000Z", "2026-09-12T02:50:00.000Z"],
      ["b", "B", "2026-09-12T03:00:00.000Z", "2026-09-12T03:30:00.000Z"],
    ]);
    expect(draft.impact.map(i => [i.matchId, i.delayMinutes])).toEqual([["a", 20], ["b", 20]]);
  });

  it.each(["locked", "live", "completed"] as const)("never moves a %s match, including an attempted override", state => {
    const draft = scheduling.planSchedule({ ...withMatches(match("a")),
      existingAssignments: [assigned("a", "B", "03:00", "03:30")],
      manualOverrides: [assigned("a", "A", "02:00", "02:30")],
      lockedMatchIds: state === "locked" ? ["a"] : [],
      matchStates: state === "locked" ? {} : { a: state },
    });
    expect(rows(draft)).toEqual([["a", "B", "2026-09-12T03:00:00.000Z", "2026-09-12T03:30:00.000Z"]]);
    expect(draft.conflicts.map(c => c.code)).toEqual(["IMMUTABLE_OVERRIDE"]);
  });

  it("reports contradictory locks without moving either or marking the draft feasible", () => {
    const draft = scheduling.planSchedule({ ...withMatches(match("a", team("x")), match("b", team("x"))),
      existingAssignments: [assigned("a", "A", "02:00", "02:30"), assigned("b", "A", "02:10", "02:40")], lockedMatchIds: ["a", "b"],
    });
    expect(rows(draft)).toEqual([
      ["a", "A", "2026-09-12T02:00:00.000Z", "2026-09-12T02:30:00.000Z"],
      ["b", "A", "2026-09-12T02:10:00.000Z", "2026-09-12T02:40:00.000Z"],
    ]);
    expect(draft.feasible).toBe(false);
    expect(draft.conflicts.map(c => c.code)).toEqual(["ROOM_OVERLAP", "TEAM_REST"]);
  });

  it("does not place a predecessor too late for its locked successor", () => {
    const draft = scheduling.planSchedule({ ...withMatches(match("a"), match("b", winner("a"))),
      existingAssignments: [assigned("b", "A", "02:20", "02:50")], lockedMatchIds: ["b"],
    });
    expect(draft.assignments.map(a => a.matchId)).toEqual(["b"]);
    expect(draft.conflicts.map(c => c.code)).toContain("NO_FEASIBLE_SLOT");
  });
});

describe("downstream recalculation", () => {
  it("recalculates a real three-team double-elimination graph without adding bye nodes to scope", () => {
    const competition = generateCompetitionGraph({ eventId: "cup", config: TOURNAMENT_FORMAT_PRESETS.doubleElimination,
      teams: [{ id: "a", seed: 1 }, { id: "b", seed: 2 }, { id: "c", seed: 3 }],
    });
    const draft = scheduling.recalculateSchedule({ ...input(), graph: competition, changedMatchIds: ["cup:upper:r1:m2"] });
    expect(draft.conflicts).toEqual([]);
    expect(draft.recalculatedMatchIds).toEqual(["cup:grand_final:r1:m1", "cup:lower:r2:m1", "cup:upper:r1:m2", "cup:upper:r2:m1"]);
    expect(rows(draft)).toEqual([
      ["cup:grand_final:r1:m1", "A", "2026-09-12T04:00:00.000Z", "2026-09-12T04:30:00.000Z"],
      ["cup:lower:r2:m1", "A", "2026-09-12T03:20:00.000Z", "2026-09-12T03:50:00.000Z"],
      ["cup:upper:r1:m2", "A", "2026-09-12T02:00:00.000Z", "2026-09-12T02:30:00.000Z"],
      ["cup:upper:r2:m1", "A", "2026-09-12T02:40:00.000Z", "2026-09-12T03:10:00.000Z"],
    ]);
  });

  it.each(["locked", "live", "completed"] as const)("traverses an overlapping %s changed root even after reaching it as a descendant", state => {
    const draft = scheduling.recalculateSchedule({ ...withMatches(match("a"), match("b", winner("a")), match("c", winner("b"))),
      existingAssignments: [assigned("a", "A", "02:00", "02:30"), assigned("b", "A", "02:40", "03:30"), assigned("c", "A", "03:20", "03:50")],
      changedMatchIds: ["a", "b"], lockedMatchIds: state === "locked" ? ["b"] : [], matchStates: state === "locked" ? {} : { b: state },
    });
    expect(draft.recalculatedMatchIds).toEqual(["a", "c"]);
    expect(draft.conflicts).toEqual([]);
    expect(draft.affectedMatchIds).toEqual(["c"]);
    expect(rows(draft)).toEqual([
      ["a", "A", "2026-09-12T02:00:00.000Z", "2026-09-12T02:30:00.000Z"],
      ["b", "A", "2026-09-12T02:40:00.000Z", "2026-09-12T03:30:00.000Z"],
      ["c", "A", "2026-09-12T03:40:00.000Z", "2026-09-12T04:10:00.000Z"],
    ]);
  });

  it("moves only the changed match and its downstream games, preserving unrelated and upstream slots", () => {
    expect(scheduling.recalculateSchedule).toBeTypeOf("function");
    const request = { ...withMatches(match("a"), match("b", winner("a")), match("c", winner("b")), match("z")),
      existingAssignments: [assigned("a", "A", "02:00", "02:30"), assigned("b", "A", "02:40", "03:10"), assigned("c", "A", "03:20", "03:50"), assigned("z", "B", "02:00", "02:30")],
      manualOverrides: [assigned("b", "A", "03:00", "03:30")], changedMatchIds: ["b"],
    };
    const original = structuredClone(request);
    const draft = scheduling.recalculateSchedule(request);
    expect(rows(draft)).toEqual([
      ["a", "A", "2026-09-12T02:00:00.000Z", "2026-09-12T02:30:00.000Z"],
      ["b", "A", "2026-09-12T03:00:00.000Z", "2026-09-12T03:30:00.000Z"],
      ["c", "A", "2026-09-12T03:40:00.000Z", "2026-09-12T04:10:00.000Z"],
      ["z", "B", "2026-09-12T02:00:00.000Z", "2026-09-12T02:30:00.000Z"],
    ]);
    expect(draft.affectedMatchIds).toEqual(["b", "c"]);
    expect(draft.recalculatedMatchIds).toEqual(["b", "c"]);
    expect(draft.impact.map(i => [i.matchId, i.delayMinutes])).toEqual([["b", 20], ["c", 20]]);
    expect(request).toEqual(original);
  });

  it.each(["locked", "live", "completed"] as const)("stops traversal at a %s descendant and reports the blocked delay", state => {
    const draft = scheduling.recalculateSchedule({ ...withMatches(match("a"), match("b", winner("a")), match("c", winner("b"))),
      existingAssignments: [assigned("a", "A", "02:00", "02:30"), assigned("b", "A", "02:40", "03:10"), assigned("c", "A", "03:20", "03:50")],
      manualOverrides: [assigned("a", "A", "02:20", "02:50")], changedMatchIds: ["a"],
      lockedMatchIds: state === "locked" ? ["b"] : [], matchStates: state === "locked" ? {} : { b: state },
    });
    expect(draft.recalculatedMatchIds).toEqual(["a"]);
    expect(draft.assignments.filter(a => a.matchId !== "a")).toEqual([
      assigned("b", "A", "02:40", "03:10"), assigned("c", "A", "03:20", "03:50"),
    ]);
    expect(draft.feasible).toBe(false);
    expect(draft.conflicts.map(c => c.code)).toContain("DEPENDENCY_ORDER");
  });

  it("leaves unrelated unassigned games unassigned and rejects overrides outside the requested scope", () => {
    const draft = scheduling.recalculateSchedule({ ...withMatches(match("a"), match("z")), changedMatchIds: ["a"], manualOverrides: [assigned("z", "A", "03:00", "03:30")] });
    expect(draft.assignments.map(a => a.matchId)).toEqual(["a"]);
    expect(draft.conflicts.map(c => c.code)).toEqual(["OVERRIDE_OUTSIDE_SCOPE"]);
  });
});

describe("input safety", () => {
  it.each(["participant", "edge"] as const)("rejects an exact override with a self-dependency from a %s and its descendants", kind => {
    const request = withMatches(match("a", kind === "participant" ? winner("a") : team("x")), match("b", winner("a")));
    const draft = scheduling.planSchedule({ ...request,
      graph: { ...request.graph, dependencies: kind === "edge" ? [{ id: "self", sourceMatchId: "a", targetMatchId: "a", outcome: "winner", targetSlot: "home" }] : [] },
      manualOverrides: [assigned("a", "A", "02:00", "02:30")],
    });
    expect(draft.assignments).toEqual([]);
    expect(draft.feasible).toBe(false);
    expect(draft.conflicts.map(c => [c.code, c.matchIds])).toEqual([
      ["UNRESOLVED_DEPENDENCY", ["a"]], ["UNRESOLVED_DEPENDENCY", ["b"]],
    ]);
  });

  it.each([
    { timezone: "Mars/Olympus" }, { rooms: [] }, { rooms: ["A", "A"] }, { rooms: [""] },
    { matchDurationMinutes: 0 }, { matchDurationMinutes: Number.NaN }, { bufferMinutes: -1 }, { minimumRestMinutes: -1 },
    { eventWindow: { start: "2026-09-12T09:00:00", end: "2026-09-12T10:00:00" } },
    { eventWindow: { start: "2026-09-12T04:00:00Z", end: "2026-09-12T02:00:00Z" } },
    { existingAssignments: [assigned("unknown", "A", "02:00", "02:30")] },
    { existingAssignments: [assigned("a", "A", "02:30", "02:00")] },
    { existingAssignments: [assigned("a", "A", "02:00", "02:30"), assigned("a", "B", "02:00", "02:30")] },
  ])("returns an explicit invalid-input conflict without throwing for %j", invalid => {
    const draft = scheduling.planSchedule({ ...withMatches(match("a")), ...invalid });
    expect(draft.assignments).toEqual([]);
    expect(draft.feasible).toBe(false);
    expect(draft.conflicts.map(c => c.code)).toEqual(["INVALID_INPUT"]);
  });

  it("rejects contradictory manual overrides instead of proposing double-bookings", () => {
    const draft = scheduling.planSchedule({ ...withMatches(match("a"), match("b")),
      manualOverrides: [assigned("a", "A", "02:00", "02:30"), assigned("b", "A", "02:00", "02:30")],
    });
    expect(draft.assignments).toEqual([]);
    expect(draft.conflicts.map(c => c.code)).toEqual(["ROOM_OVERLAP"]);
  });

  it("rejects an override outside the event window", () => {
    const draft = scheduling.planSchedule({ ...withMatches(match("a")), manualOverrides: [assigned("a", "A", "01:00", "01:30")] });
    expect(draft.assignments).toEqual([]);
    expect(draft.conflicts.map(c => c.code)).toEqual(["OUTSIDE_WINDOW_OR_ROOM"]);
  });
});

describe("soft preferences and constraint boundaries", () => {
  it("prefers extra rest when feasible and warns when only minimum rest fits", () => {
    const request = { ...withMatches(match("a"), match("b", winner("a"))), preferredRestMinutes: 20 };
    expect(rows(scheduling.planSchedule(request))).toEqual([
      ["a", "A", "2026-09-12T02:00:00.000Z", "2026-09-12T02:30:00.000Z"],
      ["b", "A", "2026-09-12T02:50:00.000Z", "2026-09-12T03:20:00.000Z"],
    ]);
    const tight = scheduling.planSchedule({ ...request, eventWindow: { start: "2026-09-12T02:00:00Z", end: "2026-09-12T03:10:00Z" } });
    expect(rows(tight)).toEqual([
      ["a", "A", "2026-09-12T02:00:00.000Z", "2026-09-12T02:30:00.000Z"],
      ["b", "A", "2026-09-12T02:40:00.000Z", "2026-09-12T03:10:00.000Z"],
    ]);
    expect(tight.feasible).toBe(true);
    expect(tight.warnings.map(w => [w.code, w.matchIds])).toContainEqual(["PREFERRED_REST_UNMET", ["b"]]);
  });

  it("relaxes preservation when an existing slot fragments the only room", () => {
    const draft = scheduling.planSchedule({ ...withMatches(match("a"), match("b")), rooms: ["A"],
      eventWindow: { start: "2026-09-12T02:00:00Z", end: "2026-09-12T03:05:00Z" },
      existingAssignments: [assigned("b", "A", "02:20", "02:50")],
    });
    expect(rows(draft)).toEqual([
      ["a", "A", "2026-09-12T02:00:00.000Z", "2026-09-12T02:30:00.000Z"],
      ["b", "A", "2026-09-12T02:35:00.000Z", "2026-09-12T03:05:00.000Z"],
    ]);
    expect(draft.feasible).toBe(true);
  });

  it("removes a requested override and its descendants when its prerequisite cannot be scheduled", () => {
    const draft = scheduling.planSchedule({ ...withMatches(match("a", winner("missing")), match("b", winner("a")), match("c", winner("b"))),
      manualOverrides: [assigned("a", "A", "02:00", "02:30")],
    });
    expect(draft.assignments).toEqual([]);
    expect(draft.conflicts.map(c => [c.code, c.matchIds])).toEqual([
      ["UNRESOLVED_DEPENDENCY", ["a"]], ["UNRESOLVED_DEPENDENCY", ["b"]], ["UNRESOLVED_DEPENDENCY", ["c"]],
    ]);
  });

  it("rejects calendar rollover instead of normalizing a nonexistent event day", () => {
    const draft = scheduling.planSchedule({ ...withMatches(match("a")), eventWindow: { start: "2026-02-30T02:00:00Z", end: "2026-03-03T02:00:00Z" } });
    expect(draft.conflicts.map(c => c.code)).toEqual(["INVALID_INPUT"]);
  });

  it("keeps elapsed-time scheduling correct across a daylight-saving fold", () => {
    const draft = scheduling.planSchedule({ ...withMatches(match("a"), match("b", winner("a"))), timezone: "America/New_York",
      eventWindow: { start: "2026-11-01T01:30:00-04:00", end: "2026-11-01T03:00:00-05:00" },
    });
    expect(rows(draft)).toEqual([
      ["a", "A", "2026-11-01T05:30:00.000Z", "2026-11-01T06:00:00.000Z"],
      ["b", "A", "2026-11-01T06:10:00.000Z", "2026-11-01T06:40:00.000Z"],
    ]);
  });

  it("omits nonplayable bye nodes from assignments", () => {
    const request = withMatches(match("a"), { ...match("b"), status: "bye" }, { ...match("c"), status: "empty" });
    expect(scheduling.planSchedule(request).assignments.map(a => a.matchId)).toEqual(["a"]);
  });
});
