import { describe, expect, it } from "vitest";

import { gameModes, getSoloDrawRules } from "@/lib/platform/config";

describe("getSoloDrawRules", () => {
  it("requires exactly one goalkeeper per Flashpeak 5v5 team", () => {
    expect(getSoloDrawRules("mode-flashpeak-5v5")).toEqual({
      teamSize: 5,
      requiredPositions: { Goalkeeper: 1 },
    });
  });

  it("returns null for modes without solo draw rules", () => {
    expect(getSoloDrawRules("mode-mlbb-5v5")).toBeNull();
    expect(getSoloDrawRules("mode-kuroko-3v3")).toBeNull();
  });

  it("returns null for an unknown mode instead of throwing", () => {
    expect(getSoloDrawRules("mode-does-not-exist")).toBeNull();
  });

  it("only requires positions the game mode actually offers", () => {
    for (const mode of gameModes) {
      if (!mode.soloDraw) continue;
      for (const position of Object.keys(mode.soloDraw.requiredPositions)) {
        expect(mode.positions).toContain(position);
      }
    }
  });

  it("never requires more players than the team has", () => {
    for (const mode of gameModes) {
      if (!mode.soloDraw) continue;
      const required = Object.values(mode.soloDraw.requiredPositions).reduce((sum, count) => sum + count, 0);
      expect(required).toBeLessThanOrEqual(mode.teamSize);
    }
  });
});
