import { describe, expect, it } from "vitest";
import { MIRACLE_V3_CERTIFICATE_TYPES } from "./miracle-v3-contract";
import { getMiracleV3EditorialCopy } from "./miracle-v3-editorial-copy";

describe("Miracle V3 editorial copy", () => {
  it.each(MIRACLE_V3_CERTIFICATE_TYPES)("has complete English copy for %s", (type) => {
    const copy = getMiracleV3EditorialCopy(type);
    expect(copy.eyebrow.length).toBeGreaterThan(0);
    expect(copy.megaLines).toHaveLength(2);
    for (const line of copy.megaLines) expect(line).toBe(line.toUpperCase());
    for (const value of [copy.motto, copy.rank, copy.rankLabel, copy.recipientLabel]) expect(value.trim().length).toBeGreaterThan(0);
  });

  it("keeps the approved podium copy", () => {
    expect(getMiracleV3EditorialCopy("champion")).toEqual({
      eyebrow: "Championship series · First place", megaLines: ["WE ARE", "CHAMPIONS"],
      motto: "Velocity · Pressure · Legacy", rank: "#1", rankLabel: "Final standing", recipientLabel: "Grand Champion",
    });
    expect(getMiracleV3EditorialCopy("runner_up")).toMatchObject({ megaLines: ["RELENTLESS", "RUNNER-UP"], rank: "#2", recipientLabel: "Second Place" });
    expect(getMiracleV3EditorialCopy("third_place")).toMatchObject({ megaLines: ["RISE AS", "THIRD PLACE"], rank: "#3", recipientLabel: "Third Place" });
  });

  it("keeps the approved award headlines", () => {
    expect(getMiracleV3EditorialCopy("mvp")).toMatchObject({ megaLines: ["MOST", "VALUABLE"], rank: "MVP", rankLabel: "Tournament award", recipientLabel: "Awarded to" });
    expect(getMiracleV3EditorialCopy("top_scorer").megaLines).toEqual(["BORN TO", "SCORE"]);
    expect(getMiracleV3EditorialCopy("top_defender").megaLines).toEqual(["BUILT TO", "DEFEND"]);
    expect(getMiracleV3EditorialCopy("top_assist").megaLines).toEqual(["CREATE THE", "OPENING"]);
  });

  it("never prints a sample statistic that the certificate data cannot back up", () => {
    for (const type of ["top_scorer", "top_defender", "top_assist"] as const) {
      const copy = getMiracleV3EditorialCopy(type);
      expect(`${copy.motto} ${copy.rank} ${copy.rankLabel}`).not.toMatch(/\d{2}|\d+%|\d+ (eliminations|assists|matches)/i);
    }
  });
});
