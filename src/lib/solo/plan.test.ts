import { describe, expect, it } from "vitest";

import { FLASHPEAK_RULES, KUROKO_RULES, buildPool, makeCandidate } from "./fixtures";
import { planTeams } from "./plan";
import type { SoloCandidate } from "./types";

const ids = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => `r-${String(from + index).padStart(3, "0")}`);

function plan(candidates: readonly SoloCandidate[], participantCap = 8, rules = FLASHPEAK_RULES) {
  return planTeams({ candidates, participantCap, rules });
}

const codes = (result: ReturnType<typeof plan>) => result.warnings.map((warning) => warning.code).sort();

describe("planTeams", () => {
  it("fills every team when there are enough keepers and field players", () => {
    const result = plan(buildPool({ keepers: 8, emergency: 0, field: 32 }));
    expect(result.teamCount).toBe(8);
    expect(result.keeperRegistrationIds).toEqual(ids(1, 8));
    expect(result.fieldRegistrationIds).toEqual(ids(9, 40));
    expect(result.unplacedRegistrationIds).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("leaves out the last registered players when field players are in surplus (PRD example)", () => {
    // 7 keepers, 3 emergency keepers and 27 field players: 30 open players for 7 teams of 4.
    const result = plan(buildPool({ keepers: 7, emergency: 3, field: 27 }));
    expect(result.teamCount).toBe(7);
    expect(result.emergencyUsedRegistrationIds).toEqual([]);
    expect(result.keeperRegistrationIds).toEqual(ids(1, 7));
    expect(result.fieldRegistrationIds).toEqual(ids(8, 35));
    expect(result.unplacedRegistrationIds).toEqual(ids(36, 37));
    expect(codes(result)).toEqual(["open_short", "team_count_below_cap", "unplaced"]);
  });

  it("limits the team count to the keepers when there are no emergency keepers", () => {
    const result = plan(buildPool({ keepers: 3, emergency: 0, field: 40 }));
    expect(result.teamCount).toBe(3);
    expect(result.fieldRegistrationIds).toEqual(ids(4, 15));
    expect(result.unplacedRegistrationIds).toEqual(ids(16, 43));
    expect(result.warnings).toContainEqual({ code: "required_short", detail: { missing: 5 } });
    expect(result.warnings).toContainEqual({ code: "team_count_below_cap", detail: { teamCount: 3, participantCap: 8 } });
    expect(result.warnings).toContainEqual({ code: "unplaced", detail: { count: 28 } });
  });

  it("limits the team count to the field players and leaves the last keepers out", () => {
    const result = plan(buildPool({ keepers: 8, emergency: 0, field: 10 }));
    expect(result.teamCount).toBe(2);
    expect(result.keeperRegistrationIds).toEqual(ids(1, 2));
    expect(result.fieldRegistrationIds).toEqual(ids(9, 16));
    expect(result.unplacedRegistrationIds).toEqual([...ids(3, 8), ...ids(17, 18)]);
  });

  it("uses the earliest emergency keepers when keepers are short, and field players shrink with them", () => {
    // 6 keepers + 4 emergency + 28 field: 8 teams need 2 emergency but then 30 field players are not enough for 32.
    const result = plan(buildPool({ keepers: 6, emergency: 4, field: 28 }));
    expect(result.teamCount).toBe(7);
    expect(result.emergencyUsedRegistrationIds).toEqual(["r-007"]);
    expect(result.keeperRegistrationIds).toEqual([...ids(1, 6), "r-007"]);
    expect(result.fieldRegistrationIds).toEqual(ids(8, 35));
    expect(result.unplacedRegistrationIds).toEqual(ids(36, 38));
  });

  it("uses emergency keepers to reach a full event when there are enough field players", () => {
    const result = plan(buildPool({ keepers: 6, emergency: 2, field: 32 }));
    expect(result.teamCount).toBe(8);
    expect(result.emergencyUsedRegistrationIds).toEqual(["r-007", "r-008"]);
    expect(result.keeperRegistrationIds).toHaveLength(8);
    expect(result.fieldRegistrationIds).toHaveLength(32);
    expect(result.unplacedRegistrationIds).toEqual([]);
  });

  it("makes no teams when nobody registered", () => {
    const result = plan([]);
    expect(result.teamCount).toBe(0);
    expect(result.unplacedRegistrationIds).toEqual([]);
    expect(codes(result)).toContain("too_few_teams");
  });

  it("makes no teams when only one team is possible, and everyone is left out", () => {
    const result = plan(buildPool({ keepers: 1, emergency: 0, field: 40 }));
    expect(result.teamCount).toBe(0);
    expect(result.keeperRegistrationIds).toEqual([]);
    expect(result.fieldRegistrationIds).toEqual([]);
    expect(result.unplacedRegistrationIds).toHaveLength(41);
    expect(codes(result)).toContain("too_few_teams");
  });

  it("treats the required position without regard to letter case", () => {
    const pool = buildPool({ keepers: 2, emergency: 0, field: 8 }).map((candidate) =>
      candidate.primaryPosition === "Goalkeeper" ? { ...candidate, primaryPosition: " goalkeeper " } : candidate,
    );
    expect(plan(pool, 2).teamCount).toBe(2);
  });

  it("does not depend on the order of the input", () => {
    const pool = buildPool({ keepers: 7, emergency: 3, field: 27 });
    expect(plan([...pool].reverse())).toEqual(plan(pool));
  });

  it("does not change its input", () => {
    const pool = buildPool({ keepers: 4, emergency: 1, field: 16 });
    const copy = structuredClone(pool);
    plan(pool, 4);
    expect(pool).toEqual(copy);
  });

  it("plans a team of three around a Center for Kuroko", () => {
    const pool = buildPool({ keepers: 2, emergency: 0, field: 4 }, { requiredPosition: "Center", fieldPositions: ["Guard", "Forward"] });
    const result = plan(pool, 2, KUROKO_RULES);
    expect(result.teamCount).toBe(2);
    expect(result.keeperRegistrationIds).toHaveLength(2);
    expect(result.fieldRegistrationIds).toHaveLength(4);
    expect(result.unplacedRegistrationIds).toEqual([]);
  });

  it("keeps the placed and unplaced sets apart and complete", () => {
    const pool = buildPool({ keepers: 5, emergency: 2, field: 20 });
    const result = plan(pool, 8);
    const all = [
      ...result.keeperRegistrationIds,
      ...result.fieldRegistrationIds,
      ...result.unplacedRegistrationIds,
    ];
    expect(new Set(all).size).toBe(all.length);
    expect(all.sort()).toEqual(pool.map((candidate) => candidate.registrationId).sort());
  });

  describe("input checks", () => {
    const pool = buildPool({ keepers: 2, emergency: 0, field: 8 });

    it.each([0, 1, 2.5, -4, Number.NaN])("rejects a team count of %s", (participantCap) => {
      expect(() => plan(pool, participantCap)).toThrow(RangeError);
    });

    it("rejects duplicate registrations", () => {
      expect(() => plan([...pool, pool[0]], 2)).toThrow(/duplicate/i);
    });

    it("rejects a registration without a primary position", () => {
      expect(() => plan([...pool, makeCandidate(99, { primaryPosition: "  " })], 2)).toThrow(/position/i);
    });

    it("rejects rules it cannot draw", () => {
      expect(() => plan(pool, 2, { teamSize: 5, requiredPositions: {} })).toThrow(RangeError);
    });
  });

  describe("against an independent count", () => {
    function expectedTeamCount(keepers: number, emergency: number, field: number, cap: number, teamSize: number) {
      const open = emergency + field;
      for (let teams = cap; teams >= 2; teams -= 1) {
        const missing = Math.max(0, teams - keepers);
        if (missing <= emergency && open - missing >= (teamSize - 1) * teams) return teams;
      }
      return 0;
    }

    it("matches for a wide range of pools", () => {
      let checked = 0;
      for (const cap of [2, 3, 8, 12]) {
        for (let keepers = 0; keepers <= cap + 2; keepers += 1) {
          for (const emergency of [0, 1, 3]) {
            for (let field = 0; field <= 4 * cap + 3; field += 3) {
              const result = plan(buildPool({ keepers, emergency, field }), cap);
              const expected = expectedTeamCount(keepers, emergency, field, cap, 5);
              expect(result.teamCount, `K${keepers} E${emergency} F${field} cap${cap}`).toBe(expected);
              const total = keepers + emergency + field;
              expect(result.unplacedRegistrationIds.length).toBe(total - expected * 5);
              checked += 1;
            }
          }
        }
      }
      expect(checked).toBeGreaterThan(300);
    });
  });
});
