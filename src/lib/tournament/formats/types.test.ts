import { describe, expect, it } from "vitest";

import {
  LEGACY_FORMAT_BY_V3_KIND,
  TOURNAMENT_FORMAT_PRESETS,
  parseTournamentFormatConfig,
  tournamentFormatConfigSchema,
  upgradeLegacyTournamentFormat,
} from "./types";

describe("V3 tournament format configuration", () => {
  it.each([
    {
      version: 1,
      kind: "single_elimination",
      bestOf: { earlyRounds: 1, semifinals: 3, thirdPlace: 1, final: 5 },
      thirdPlace: "required",
    },
    {
      version: 1,
      kind: "double_elimination",
      bestOf: { earlyRounds: 1, upperFinal: 3, lowerFinal: 3, grandFinal: 5 },
      thirdPlace: "lower_final_loser",
    },
    {
      version: 1,
      kind: "round_robin",
      legs: 2,
      points: { win: 3, draw: 1, loss: 0 },
      tiebreakers: ["head_to_head", "score_difference", "score_for", "wins", "tiebreak_match"],
    },
    {
      version: 1,
      kind: "group_playoffs",
      groupCount: 4,
      qualifiersPerGroup: 2,
      groupStage: {
        legs: 1,
        points: { win: 3, draw: 1, loss: 0 },
        tiebreakers: ["head_to_head", "score_difference", "score_for", "wins"],
      },
      playoffs: {
        version: 1,
        kind: "single_elimination",
        bestOf: { earlyRounds: 1, semifinals: 3, thirdPlace: 1, final: 5 },
        thirdPlace: "required",
        avoidImmediateGroupRematches: true,
      },
    },
  ])("accepts the $kind release-one contract", (config) => {
    expect(tournamentFormatConfigSchema.parse(config)).toEqual(config);
  });

  it.each(["battle_royale", "swiss", "ffa", "time_trial"])("rejects unsupported %s formats", (kind) => {
    expect(() => tournamentFormatConfigSchema.parse({ version: 1, kind })).toThrow();
  });

  it("requires the approved podium rule for each elimination type", () => {
    expect(() => tournamentFormatConfigSchema.parse({
      version: 1,
      kind: "single_elimination",
      bestOf: { earlyRounds: 1, semifinals: 3, thirdPlace: 1, final: 5 },
      thirdPlace: "disabled",
    })).toThrow();
    expect(() => tournamentFormatConfigSchema.parse({
      version: 1,
      kind: "double_elimination",
      bestOf: { earlyRounds: 1, upperFinal: 3, lowerFinal: 3, grandFinal: 5 },
      thirdPlace: "required",
    })).toThrow();
  });

  it("rejects duplicate tiebreakers and point systems that do not reward wins", () => {
    expect(() => tournamentFormatConfigSchema.parse({
      version: 1,
      kind: "round_robin",
      legs: 1,
      points: { win: 1, draw: 1, loss: 0 },
      tiebreakers: ["score_difference", "score_difference"],
    })).toThrow();
  });

  it("rejects group qualification that cannot produce a supported playoff field", () => {
    expect(() => tournamentFormatConfigSchema.parse({
      version: 1,
      kind: "group_playoffs",
      groupCount: 3,
      qualifiersPerGroup: 1,
      groupStage: {
        legs: 1,
        points: { win: 3, draw: 1, loss: 0 },
        tiebreakers: ["head_to_head", "score_difference"],
      },
      playoffs: {
        version: 1,
        kind: "single_elimination",
        bestOf: { earlyRounds: 1, semifinals: 3, thirdPlace: 1, final: 5 },
        thirdPlace: "required",
        avoidImmediateGroupRematches: true,
      },
    })).toThrow();
  });

  it("accepts any positive odd best-of and rejects even or non-positive values", () => {
    expect(tournamentFormatConfigSchema.parse({
      version: 1,
      kind: "single_elimination",
      bestOf: { earlyRounds: 1, semifinals: 3, thirdPlace: 1, final: 9 },
      thirdPlace: "required",
    })).toMatchObject({ bestOf: { final: 9 } });

    for (const final of [0, -1, 2, 2.5]) {
      expect(() => tournamentFormatConfigSchema.parse({
        version: 1,
        kind: "single_elimination",
        bestOf: { earlyRounds: 1, semifinals: 3, thirdPlace: 1, final },
        thirdPlace: "required",
      })).toThrow();
    }
  });

  it("requires schema version 1 at the root and nested playoff boundary", () => {
    expect(() => tournamentFormatConfigSchema.parse({
      kind: "single_elimination",
      bestOf: { earlyRounds: 1, semifinals: 3, thirdPlace: 1, final: 5 },
      thirdPlace: "required",
    })).toThrow();
    expect(() => tournamentFormatConfigSchema.parse({
      ...TOURNAMENT_FORMAT_PRESETS.groupPlayoffs,
      version: 2,
    })).toThrow();
  });

  it("ships validated presets and parses unknown persisted input", () => {
    for (const preset of Object.values(TOURNAMENT_FORMAT_PRESETS)) {
      expect(parseTournamentFormatConfig(JSON.parse(JSON.stringify(preset)))).toEqual(preset);
    }
  });

  it("adapts legacy format strings without changing their persisted compatibility values", () => {
    expect(upgradeLegacyTournamentFormat("Single Elimination")).toEqual(TOURNAMENT_FORMAT_PRESETS.singleElimination);
    expect(upgradeLegacyTournamentFormat("League")).toEqual(TOURNAMENT_FORMAT_PRESETS.roundRobin);
    expect(LEGACY_FORMAT_BY_V3_KIND).toEqual({
      single_elimination: "Single Elimination",
      double_elimination: "Single Elimination",
      round_robin: "League",
      group_playoffs: "League",
    });
  });
});