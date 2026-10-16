import { describe, expect, it } from "vitest";
import { generateSingleEliminationBracket } from "../engine";
import { TOURNAMENT_FORMAT_PRESETS } from "../formats/types";
import { diagnoseLegacyCompetition } from "./legacy-compatibility";
import { inferLegacySeeds, structuralOnly } from "./legacy-audit";

const EVENT = "event";

function legacyRows(teamCount: number) {
  const teams = Array.from({ length: teamCount }, (_, index) => ({ id: `t${index + 1}`, name: `Team ${index + 1}` }));
  const rows = generateSingleEliminationBracket(teams, 8, EVENT).map((match) => ({
    id: match.id,
    round: match.round,
    slot: match.slot,
    roundLabel: `R${match.round}`,
    homeTeamId: match.homeTeamId ?? "",
    awayTeamId: match.awayTeamId ?? "",
  }));
  return { teams, rows };
}

describe("legacy audit helpers", () => {
  it("reads seeds back from first-round slots of an old 8-team bracket", () => {
    const { teams, rows } = legacyRows(8);
    const inferred = inferLegacySeeds(teams.map((team) => team.id), rows);
    expect(inferred.complete).toBe(true);
    expect(Object.fromEntries(inferred.seeds.map((entry) => [entry.id, entry.seed]))).toEqual(
      Object.fromEntries(teams.map((team, index) => [team.id, index + 1])),
    );
  });

  it("maps an old fully-paired bracket onto the V3 graph once results and advanced teams are removed", () => {
    const { teams, rows } = legacyRows(8);
    const finished = rows.map((row) => row.round === 1
      ? row
      : { ...row, homeTeamId: "t1", awayTeamId: "t2" }); // later rounds hold advanced teams in old data
    const inferred = inferLegacySeeds(teams.map((team) => team.id), finished);
    const diagnosis = diagnoseLegacyCompetition(
      { id: EVENT, format: "Single Elimination", formatConfig: TOURNAMENT_FORMAT_PRESETS.singleElimination },
      inferred.seeds,
      structuralOnly(finished.map((row) => ({ ...row, homeScore: 2, awayScore: 1, status: "Completed" }))),
    );
    expect(diagnosis).toMatchObject({ status: "ready", reason: "compatible" });
  });

  it("flags brackets whose team list and slots disagree instead of guessing", () => {
    const { teams, rows } = legacyRows(8);
    const inferred = inferLegacySeeds(teams.map((team) => team.id), rows.filter((row) => row.round === 1).slice(0, 2));
    expect(inferred.complete).toBe(false);
    expect(inferred.note).toMatch(/not in round 1/);
  });

  it("reads seeds of a 7-team field in an 8-slot bracket, where seed 1 has a bye row", () => {
    const { teams, rows } = legacyRows(7);
    const inferred = inferLegacySeeds(teams.map((team) => team.id), rows);
    expect(inferred.complete).toBe(true);
    expect(inferred.seeds).toHaveLength(7);
    expect(inferred.seeds.find((entry) => entry.id === "t1")?.seed).toBe(1);
  });

  it("places the one team missing from round 1 by elimination", () => {
    const { teams, rows } = legacyRows(8);
    const withoutT8 = rows.filter((row) => row.round === 1).map((row) => row.awayTeamId === "t8" ? { ...row, awayTeamId: "" } : row);
    const inferred = inferLegacySeeds(teams.map((team) => team.id), withoutT8);
    expect(inferred.complete).toBe(true);
    expect(inferred.seeds.find((entry) => entry.id === "t8")?.seed).toBe(8);
  });
});
