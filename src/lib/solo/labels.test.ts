import { describe, expect, it } from "vitest";

import { positionLabel, soloTotals } from "./labels";

describe("positionLabel", () => {
  it("uses the everyday Indonesian word for the goalkeeper", () => {
    expect(positionLabel("Goalkeeper", "id")).toBe("Kiper");
    expect(positionLabel("goalkeeper", "id")).toBe("Kiper");
    expect(positionLabel(" Goalkeeper ", "id")).toBe("Kiper");
  });

  it("keeps the game's own name in English and for positions with no common translation", () => {
    expect(positionLabel("Goalkeeper", "en")).toBe("Goalkeeper");
    expect(positionLabel("Center", "id")).toBe("Center");
    expect(positionLabel("Midfielder", "id")).toBe("Midfielder");
  });
});

describe("soloTotals", () => {
  const snapshot = {
    required: { quota: 8, held: 5, queued: 2 },
    open: { quota: 32, held: 30, queued: 4 },
  };

  it("adds both groups together", () => {
    expect(soloTotals(snapshot)).toEqual({ quota: 40, held: 35, queued: 6 });
  });

  it("answers null when the counts are not known", () => {
    expect(soloTotals(null)).toBeNull();
    expect(soloTotals(undefined)).toBeNull();
  });
});
