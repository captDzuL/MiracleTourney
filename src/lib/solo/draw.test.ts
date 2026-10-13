import { describe, expect, it } from "vitest";

import { drawTeams, swapPlayers } from "./draw";
import { FLASHPEAK_RULES, KUROKO_RULES, buildPool, makeCandidate } from "./fixtures";
import { checkDrawInvariants } from "./invariants";
import { planTeams } from "./plan";
import type { SoloAssignment, SoloCandidate, SoloDrawResult, SoloRules } from "./types";

function draw(candidates: readonly SoloCandidate[], seed = "seed", participantCap = 8, rules: SoloRules = FLASHPEAK_RULES) {
  return drawTeams({ candidates, participantCap, rules, seed });
}

const teamsOf = (result: SoloDrawResult) => {
  const teams = new Map<number, SoloAssignment[]>();
  for (const assignment of result.assignments) {
    if (assignment.teamIndex === null) continue;
    teams.set(assignment.teamIndex, [...(teams.get(assignment.teamIndex) ?? []), assignment]);
  }
  return teams;
};

const byId = (candidates: readonly SoloCandidate[]) => new Map(candidates.map((candidate) => [candidate.registrationId, candidate]));

describe("drawTeams", () => {
  const fullPool = buildPool({ keepers: 8, emergency: 0, field: 32 });

  it("builds eight valid teams from a full pool", () => {
    const result = draw(fullPool);
    expect(result.teamCount).toBe(8);
    expect(result.unplacedCount).toBe(0);
    expect(result.canLock).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(checkDrawInvariants(result, FLASHPEAK_RULES)).toEqual([]);
    for (const members of teamsOf(result).values()) expect(members).toHaveLength(5);
  });

  it("gives every team exactly one keeper, and only real keepers play there when enough exist", () => {
    const result = draw(fullPool);
    const keeperIds = new Set(fullPool.filter((candidate) => candidate.primaryPosition === "Goalkeeper").map((candidate) => candidate.registrationId));
    for (const members of teamsOf(result).values()) {
      const keepers = members.filter((member) => member.assignedPosition === "Goalkeeper");
      expect(keepers).toHaveLength(1);
      expect(keeperIds.has(keepers[0].registrationId)).toBe(true);
    }
  });

  it("keeps each field player in their own position", () => {
    const pool = byId(fullPool);
    for (const assignment of draw(fullPool).assignments) {
      if (assignment.assignedPosition === "Goalkeeper") continue;
      expect(assignment.assignedPosition).toBe(pool.get(assignment.registrationId)!.primaryPosition);
    }
  });

  it("is repeatable for the same seed and input", () => {
    expect(draw(fullPool, "same-seed")).toEqual(draw(fullPool, "same-seed"));
  });

  it("gives the same result no matter how the input is ordered", () => {
    expect(draw([...fullPool].reverse(), "order")).toEqual(draw(fullPool, "order"));
    const rotated = [...fullPool.slice(17), ...fullPool.slice(0, 17)];
    expect(draw(rotated, "order")).toEqual(draw(fullPool, "order"));
  });

  it("gives a different arrangement for a different seed", () => {
    const first = JSON.stringify(draw(fullPool, "seed-a").assignments);
    const second = JSON.stringify(draw(fullPool, "seed-b").assignments);
    expect(first).not.toBe(second);
  });

  it("does not change its input", () => {
    const copy = structuredClone(fullPool);
    draw(fullPool);
    expect(fullPool).toEqual(copy);
  });

  it("mixes players: a player does not land in the same team for every seed", () => {
    const teamsOfFirstField = new Set<number>();
    for (let run = 0; run < 40; run += 1) {
      const result = draw(fullPool, `mix-${run}`);
      teamsOfFirstField.add(result.assignments.find((assignment) => assignment.registrationId === "r-009")!.teamIndex!);
    }
    expect(teamsOfFirstField.size).toBeGreaterThan(4);
  });

  it("mixes keepers too: the first keeper does not always get the first team", () => {
    const teamsOfFirstKeeper = new Set<number>();
    for (let run = 0; run < 40; run += 1) {
      const result = draw(fullPool, `keeper-mix-${run}`);
      teamsOfFirstKeeper.add(result.assignments.find((assignment) => assignment.registrationId === "r-001")!.teamIndex!);
    }
    expect(teamsOfFirstKeeper.size).toBeGreaterThan(4);
  });

  describe("captains", () => {
    it("picks the captain from the volunteers when a team has any", () => {
      const pool = fullPool.map((candidate, index) => (index % 3 === 0 ? { ...candidate, willingCaptain: true } : candidate));
      const volunteers = new Set(pool.filter((candidate) => candidate.willingCaptain).map((candidate) => candidate.registrationId));
      for (let run = 0; run < 20; run += 1) {
        const result = draw(pool, `captain-${run}`);
        for (const members of teamsOf(result).values()) {
          const captain = members.find((member) => member.isCaptain)!;
          if (members.some((member) => volunteers.has(member.registrationId))) {
            expect(volunteers.has(captain.registrationId)).toBe(true);
          }
        }
      }
    });

    it("picks any member when nobody in the team volunteered", () => {
      const result = draw(fullPool);
      for (const members of teamsOf(result).values()) expect(members.filter((member) => member.isCaptain)).toHaveLength(1);
    });

    it("picks the only volunteer", () => {
      const pool = fullPool.map((candidate) => (candidate.registrationId === "r-020" ? { ...candidate, willingCaptain: true } : candidate));
      const result = draw(pool);
      const team = result.assignments.find((assignment) => assignment.registrationId === "r-020")!.teamIndex!;
      expect(teamsOf(result).get(team)!.find((member) => member.isCaptain)!.registrationId).toBe("r-020");
    });
  });

  describe("shortages", () => {
    it("leaves players out, in registration order, when keepers are short (the PRD example)", () => {
      const pool = buildPool({ keepers: 7, emergency: 3, field: 27 });
      const result = draw(pool);
      expect(result.teamCount).toBe(7);
      expect(result.unplacedCount).toBe(2);
      expect(result.canLock).toBe(true);
      const unplaced = result.assignments.filter((assignment) => assignment.role === "unplaced").map((assignment) => assignment.registrationId);
      expect(unplaced).toEqual(["r-036", "r-037"]);
      expect(result.assignments.filter((assignment) => assignment.role === "unplaced").every((assignment) => assignment.teamIndex === null && assignment.assignedPosition === null && !assignment.isCaptain)).toBe(true);
      expect(checkDrawInvariants(result, FLASHPEAK_RULES)).toEqual([]);
    });

    it("puts an emergency keeper in goal and labels the position", () => {
      const pool = buildPool({ keepers: 7, emergency: 2, field: 32 });
      const result = draw(pool);
      expect(result.teamCount).toBe(8);
      const emergencyId = "r-008";
      const emergency = result.assignments.find((assignment) => assignment.registrationId === emergencyId)!;
      expect(emergency.role).toBe("starter");
      expect(emergency.assignedPosition).toBe("Goalkeeper");
      expect(checkDrawInvariants(result, FLASHPEAK_RULES)).toEqual([]);
    });

    it("makes no teams when too few players registered, and marks everyone as left out", () => {
      const pool = buildPool({ keepers: 1, emergency: 0, field: 6 });
      const result = draw(pool);
      expect(result.teamCount).toBe(0);
      expect(result.canLock).toBe(false);
      expect(result.unplacedCount).toBe(7);
      expect(result.assignments.every((assignment) => assignment.role === "unplaced")).toBe(true);
      expect(result.warnings.map((warning) => warning.code)).toContain("too_few_teams");
    });

    it("handles an empty pool", () => {
      const result = draw([]);
      expect(result).toMatchObject({ teamCount: 0, unplacedCount: 0, canLock: false, assignments: [] });
    });

    it("reports the same left-out players as planTeams, before any seed is chosen", () => {
      const pool = buildPool({ keepers: 6, emergency: 4, field: 28 });
      const planned = planTeams({ candidates: pool, participantCap: 8, rules: FLASHPEAK_RULES });
      const result = draw(pool, "any-seed");
      const unplaced = result.assignments.filter((assignment) => assignment.role === "unplaced").map((assignment) => assignment.registrationId);
      expect(unplaced).toEqual([...planned.unplacedRegistrationIds]);
    });
  });

  describe("in-game name clashes", () => {
    it("never puts two players with the same name in one team when it can be avoided", () => {
      const pool = buildPool({ keepers: 2, emergency: 0, field: 8 }).map((candidate) => {
        if (candidate.registrationId === "r-003") return { ...candidate, ign: "Budi" };
        if (candidate.registrationId === "r-004") return { ...candidate, ign: " budi " };
        if (candidate.registrationId === "r-005") return { ...candidate, ign: "Sari" };
        if (candidate.registrationId === "r-006") return { ...candidate, ign: "SARI" };
        return candidate;
      });
      for (let run = 0; run < 60; run += 1) {
        const result = draw(pool, `ign-${run}`, 2);
        expect(result.canLock).toBe(true);
        expect(result.warnings.map((warning) => warning.code)).not.toContain("ign_collision");
        const lookup = byId(pool);
        for (const members of teamsOf(result).values()) {
          const names = members.map((member) => lookup.get(member.registrationId)!.ign.trim().toLowerCase());
          expect(new Set(names).size).toBe(names.length);
        }
      }
    });

    it("splits a name shared by a keeper and a field player", () => {
      const pool = buildPool({ keepers: 2, emergency: 0, field: 8 }).map((candidate) =>
        candidate.registrationId === "r-001" || candidate.registrationId === "r-003" ? { ...candidate, ign: "Dewa" } : candidate,
      );
      for (let run = 0; run < 30; run += 1) {
        const result = draw(pool, `keeper-ign-${run}`, 2);
        const lookup = byId(pool);
        for (const members of teamsOf(result).values()) {
          const names = members.map((member) => lookup.get(member.registrationId)!.ign.toLowerCase());
          expect(new Set(names).size).toBe(names.length);
        }
      }
    });

    it("warns and blocks locking when a clash cannot be split", () => {
      const pool = buildPool({ keepers: 2, emergency: 0, field: 8 }).map((candidate, index) =>
        index >= 2 ? { ...candidate, ign: "Sama" } : candidate,
      );
      const result = draw(pool, "unsolvable", 2);
      expect(result.canLock).toBe(false);
      expect(result.warnings.map((warning) => warning.code)).toContain("ign_collision");
    });
  });

  describe("any pool", () => {
    it("keeps every invariant over a wide range of pools and seeds", () => {
      let checked = 0;
      for (const cap of [2, 3, 8, 12]) {
        for (let keepers = 0; keepers <= cap + 2; keepers += 2) {
          for (const emergency of [0, 2]) {
            for (let field = 0; field <= 4 * cap + 3; field += 5) {
              const pool = buildPool({ keepers, emergency, field });
              const planned = planTeams({ candidates: pool, participantCap: cap, rules: FLASHPEAK_RULES });
              const result = draw(pool, `grid-${cap}-${keepers}-${emergency}-${field}`, cap);

              expect(checkDrawInvariants(result, FLASHPEAK_RULES), `K${keepers} E${emergency} F${field} cap${cap}`).toEqual([]);
              expect(result.teamCount).toBe(planned.teamCount);
              expect(result.unplacedCount).toBe(planned.unplacedRegistrationIds.length);
              expect(result.assignments).toHaveLength(pool.length);
              checked += 1;
            }
          }
        }
      }
      expect(checked).toBeGreaterThan(80);
    });

    it("builds valid teams of three around a Center for Kuroko, without Flashpeak numbers", () => {
      const pool = buildPool(
        { keepers: 5, emergency: 1, field: 12 },
        { requiredPosition: "Center", fieldPositions: ["Guard", "Forward"] },
      );
      for (let run = 0; run < 25; run += 1) {
        const result = draw(pool, `kuroko-${run}`, 6, KUROKO_RULES);
        expect(checkDrawInvariants(result, KUROKO_RULES)).toEqual([]);
        expect(result.teamCount).toBe(6);
        for (const members of teamsOf(result).values()) {
          expect(members).toHaveLength(3);
          expect(members.filter((member) => member.assignedPosition === "Center")).toHaveLength(1);
        }
      }
    });
  });

  it("rejects an empty seed", () => {
    expect(() => draw(fullPool, "")).toThrow(RangeError);
  });
});

describe("swapPlayers", () => {
  const pool = buildPool({ keepers: 4, emergency: 0, field: 17 });
  const base = drawTeams({ candidates: pool, participantCap: 4, rules: FLASHPEAK_RULES, seed: "swap" });

  const starter = (predicate: (assignment: SoloAssignment) => boolean) => base.assignments.find((assignment) => assignment.role === "starter" && predicate(assignment))!;
  const fieldIn = (team: number) => starter((assignment) => assignment.teamIndex === team && assignment.assignedPosition !== "Goalkeeper");
  const keeperIn = (team: number) => starter((assignment) => assignment.teamIndex === team && assignment.assignedPosition === "Goalkeeper");
  const swap = (a: string, b: string, result = base, candidates = pool) => swapPlayers({ result, candidates, a, b, rules: FLASHPEAK_RULES });

  it("swaps two field players between teams and keeps the draw valid", () => {
    const a = fieldIn(1);
    const b = fieldIn(2);
    const result = swap(a.registrationId, b.registrationId);
    const after = (id: string) => result.assignments.find((assignment) => assignment.registrationId === id)!;
    expect(after(a.registrationId).teamIndex).toBe(2);
    expect(after(b.registrationId).teamIndex).toBe(1);
    expect(after(a.registrationId).assignedPosition).toBe(a.assignedPosition);
    expect(checkDrawInvariants(result, FLASHPEAK_RULES)).toEqual([]);
  });

  it("swaps two keepers between teams", () => {
    const a = keeperIn(1);
    const b = keeperIn(3);
    const result = swap(a.registrationId, b.registrationId);
    expect(result.assignments.find((assignment) => assignment.registrationId === a.registrationId)!.teamIndex).toBe(3);
    expect(checkDrawInvariants(result, FLASHPEAK_RULES)).toEqual([]);
  });

  it("does not change the draw it is given", () => {
    const copy = structuredClone(base);
    swap(fieldIn(1).registrationId, fieldIn(2).registrationId);
    expect(base).toEqual(copy);
  });

  it("refuses to swap a keeper with a field player", () => {
    expect(() => swap(keeperIn(1).registrationId, fieldIn(2).registrationId)).toThrow(/Cannot swap a Goalkeeper with a player in another position/);
  });

  it("refuses to swap players of the same team", () => {
    const [a, b] = base.assignments.filter((assignment) => assignment.teamIndex === 1 && assignment.assignedPosition !== "Goalkeeper");
    expect(() => swap(a.registrationId, b.registrationId)).toThrow(/same team/i);
  });

  it("refuses to swap a player who is not in a team", () => {
    const unplaced = base.assignments.find((assignment) => assignment.role === "unplaced")!;
    expect(() => swap(unplaced.registrationId, fieldIn(1).registrationId)).toThrow(/not in a team/i);
  });

  it("refuses an unknown player", () => {
    expect(() => swap("r-999", fieldIn(1).registrationId)).toThrow(/unknown/i);
  });

  it("keeps exactly one captain per team when a captain moves", () => {
    const captain1 = base.assignments.find((assignment) => assignment.teamIndex === 1 && assignment.isCaptain)!;
    const other = fieldIn(2).isCaptain ? fieldIn(3) : fieldIn(2);
    const moving = captain1.assignedPosition === "Goalkeeper" ? keeperIn(other.teamIndex!) : other;
    const result = swap(captain1.registrationId, moving.registrationId);
    expect(checkDrawInvariants(result, FLASHPEAK_RULES)).toEqual([]);
  });

  it("blocks locking when the swap creates a name clash", () => {
    const a = fieldIn(1);
    const b = fieldIn(2);
    const teammate = base.assignments.find((assignment) => assignment.teamIndex === 2 && assignment.registrationId !== b.registrationId && assignment.assignedPosition !== "Goalkeeper")!;
    const clashing = pool.map((candidate) => (candidate.registrationId === a.registrationId || candidate.registrationId === teammate.registrationId ? { ...candidate, ign: "Kembar" } : candidate));
    const result = swap(a.registrationId, b.registrationId, base, clashing);
    expect(result.canLock).toBe(false);
    expect(result.warnings.map((warning) => warning.code)).toContain("ign_collision");
  });

  it("clears a name-clash warning once a swap fixes it", () => {
    const clash = pool.map((candidate, index) => (index >= 5 ? { ...candidate, ign: "Sama" } : candidate));
    const blocked = drawTeams({ candidates: clash, participantCap: 4, rules: FLASHPEAK_RULES, seed: "blocked" });
    expect(blocked.canLock).toBe(false);
    const fixed = pool.map((candidate) => ({ ...candidate }));
    const cleaned = swapPlayers({ result: blocked, candidates: fixed, a: fieldInTeam(blocked, 1), b: fieldInTeam(blocked, 2), rules: FLASHPEAK_RULES });
    expect(cleaned.canLock).toBe(true);
    expect(cleaned.warnings.map((warning) => warning.code)).not.toContain("ign_collision");
  });
});

function fieldInTeam(result: SoloDrawResult, team: number) {
  return result.assignments.find((assignment) => assignment.teamIndex === team && assignment.assignedPosition !== "Goalkeeper")!.registrationId;
}

describe("makeCandidate", () => {
  it("builds distinct candidates", () => {
    expect(makeCandidate(1).registrationId).not.toBe(makeCandidate(2).registrationId);
  });
});
