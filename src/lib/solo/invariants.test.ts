import { describe, expect, it } from "vitest";

import { drawTeams } from "./draw";
import { FLASHPEAK_RULES, buildPool } from "./fixtures";
import { checkDrawInvariants } from "./invariants";
import type { SoloAssignment, SoloDrawResult } from "./types";

const valid = drawTeams({
  candidates: buildPool({ keepers: 3, emergency: 0, field: 14 }),
  participantCap: 3,
  rules: FLASHPEAK_RULES,
  seed: "invariants",
});

function tamper(change: (assignments: SoloAssignment[]) => SoloAssignment[], overrides: Partial<SoloDrawResult> = {}): SoloDrawResult {
  return { ...valid, assignments: change([...valid.assignments]), ...overrides };
}

const team = (assignments: readonly SoloAssignment[], index: number) =>
  assignments.filter((assignment) => assignment.teamIndex === index);

describe("checkDrawInvariants", () => {
  it("accepts a real draw", () => {
    expect(checkDrawInvariants(valid, FLASHPEAK_RULES)).toEqual([]);
  });

  it("accepts an empty draw", () => {
    const empty: SoloDrawResult = { assignments: [], teamCount: 0, unplacedCount: 0, warnings: [], canLock: false };
    expect(checkDrawInvariants(empty, FLASHPEAK_RULES)).toEqual([]);
  });

  it("flags a team with the wrong number of players", () => {
    const broken = tamper((assignments) => assignments.filter((assignment) => assignment.registrationId !== team(valid.assignments, 1)[1].registrationId));
    expect(checkDrawInvariants(broken, FLASHPEAK_RULES)).toContain("team:1:size");
  });

  it("flags a team without the required position", () => {
    const keeper = team(valid.assignments, 2).find((assignment) => assignment.assignedPosition === "Goalkeeper");
    const broken = tamper((assignments) => assignments.map((assignment) => (assignment === keeper ? { ...assignment, assignedPosition: "Forward" } : assignment)));
    expect(checkDrawInvariants(broken, FLASHPEAK_RULES)).toContain("team:2:required_position");
  });

  it("flags a team with two players in the required position", () => {
    const other = team(valid.assignments, 2).find((assignment) => assignment.assignedPosition !== "Goalkeeper")!;
    const broken = tamper((assignments) => assignments.map((assignment) => (assignment === other ? { ...assignment, assignedPosition: "goalkeeper" } : assignment)));
    expect(checkDrawInvariants(broken, FLASHPEAK_RULES)).toContain("team:2:required_position");
  });

  it("flags a team with no captain or with two captains", () => {
    const captain = team(valid.assignments, 3).find((assignment) => assignment.isCaptain)!;
    const noCaptain = tamper((assignments) => assignments.map((assignment) => (assignment === captain ? { ...assignment, isCaptain: false } : assignment)));
    expect(checkDrawInvariants(noCaptain, FLASHPEAK_RULES)).toContain("team:3:captain");

    const second = team(valid.assignments, 3).find((assignment) => !assignment.isCaptain)!;
    const twoCaptains = tamper((assignments) => assignments.map((assignment) => (assignment === second ? { ...assignment, isCaptain: true } : assignment)));
    expect(checkDrawInvariants(twoCaptains, FLASHPEAK_RULES)).toContain("team:3:captain");
  });

  it("flags a player placed twice", () => {
    const first = valid.assignments[0];
    const broken = tamper((assignments) => [...assignments, { ...first, teamIndex: 2, isCaptain: false }]);
    expect(checkDrawInvariants(broken, FLASHPEAK_RULES)).toContain("duplicate_registration");
  });

  it("flags a starter without a team and an unplaced player with a team", () => {
    const starter = valid.assignments.find((assignment) => assignment.role === "starter" && !assignment.isCaptain)!;
    const noTeam = tamper((assignments) => assignments.map((assignment) => (assignment === starter ? { ...assignment, teamIndex: null } : assignment)));
    expect(checkDrawInvariants(noTeam, FLASHPEAK_RULES)).toContain("starter_without_team");

    const unplaced = valid.assignments.find((assignment) => assignment.role === "unplaced")!;
    const withTeam = tamper((assignments) => assignments.map((assignment) => (assignment === unplaced ? { ...assignment, teamIndex: 1 } : assignment)));
    expect(checkDrawInvariants(withTeam, FLASHPEAK_RULES)).toContain("unplaced_with_team");
  });

  it("flags an unplaced captain", () => {
    const unplaced = valid.assignments.find((assignment) => assignment.role === "unplaced")!;
    const broken = tamper((assignments) => assignments.map((assignment) => (assignment === unplaced ? { ...assignment, isCaptain: true } : assignment)));
    expect(checkDrawInvariants(broken, FLASHPEAK_RULES)).toContain("unplaced_captain");
  });

  it("flags counts that do not match the assignments", () => {
    expect(checkDrawInvariants({ ...valid, teamCount: valid.teamCount + 1 }, FLASHPEAK_RULES)).toContain("team_count_mismatch");
    expect(checkDrawInvariants({ ...valid, unplacedCount: valid.unplacedCount + 1 }, FLASHPEAK_RULES)).toContain("unplaced_count_mismatch");
  });

  it("flags a gap in the team numbers", () => {
    const broken = tamper((assignments) => assignments.map((assignment) => (assignment.teamIndex === 3 ? { ...assignment, teamIndex: 5 } : assignment)));
    expect(checkDrawInvariants(broken, FLASHPEAK_RULES)).toContain("team_index_gap");
  });
});
