import { describe, expect, it } from "vitest";
import type { SocialBracketMatch } from "./types";
import { buildBracketLayout } from "./layout";
const waiting = (sourceMatchId: string | null = null) => ({ team: null, label: "Waiting", sourceMatchId, outcome: sourceMatchId ? "winner" as const : null });
const match = (id: string, roundKey: string, round: number, slot: number, bracket: string, home: string | null = null, away: string | null = null): SocialBracketMatch => ({ id, roundKey, roundLabel: roundKey, round, slot, bracket, home: waiting(home), away: waiting(away), homeScore: null, awayScore: null, winnerTeamId: null, status: "scheduled", bestOf: 1, schedule: null, games: [] });
describe("bracket layout", () => {
  it("places grand final after both explicit upper and lower final sources", () => {
    const layout = buildBracketLayout([
      match("u1", "upper:1", 1, 1, "upper"), match("u2", "upper:2", 2, 1, "upper", "u1"),
      match("l1", "lower:1", 1, 1, "lower"), match("l2", "lower:2", 2, 1, "lower", "l1"),
      match("gf", "grand_final:1", 1, 1, "grand_final", "u2", "l2"),
    ]);
    expect(layout.positions.get("gf")!.x).toBeGreaterThan(layout.positions.get("u2")!.x);
    expect(layout.positions.get("gf")!.x).toBeGreaterThan(layout.positions.get("l2")!.x);
    expect(layout.edges).toHaveLength(4);
  });
  it("normalizes 1-based slots and centers downstream rounds on their source pair", () => {
    const layout = buildBracketLayout([
      match("q1", "single:1", 1, 1, "single"), match("q2", "single:1", 1, 2, "single"),
      match("q3", "single:1", 1, 3, "single"), match("q4", "single:1", 1, 4, "single"),
      match("s1", "single:2", 2, 1, "single", "q1", "q2"), match("s2", "single:2", 2, 2, "single", "q3", "q4"),
      match("f", "single:3", 3, 1, "single", "s1", "s2"),
    ]);
    expect(layout.positions.get("q1")!.y).toBe(0);
    expect(layout.positions.get("q4")!.y).toBe(444);
    expect(layout.positions.get("s1")!.y).toBe(74);
    expect(layout.positions.get("s2")!.y).toBe(370);
    expect(layout.positions.get("f")!.y).toBe(222);
    expect(layout.height).toBeLessThan(700);
  });
});
