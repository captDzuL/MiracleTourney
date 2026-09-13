import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AdaptiveBracketBoard } from "./AdaptiveBracketBoard";

describe("AdaptiveBracketBoard", () => {
  it("renders a bounded TBD template during registration without assigning seeds", () => {
    const html = renderToStaticMarkup(<AdaptiveBracketBoard locale="id" format="single_elimination" matches={[]} standings={[]} registrationSlots={8} />);
    expect(html).toContain("Template bracket");
    expect(html.match(/TBD/g)).toHaveLength(8);
    expect(html).toContain("overflow-x-auto");
    expect(html).toContain("max-w-full");
  });

  it("renders group standings and never invents a grand final for league", () => {
    const html = renderToStaticMarkup(<AdaptiveBracketBoard locale="en" format="round_robin" matches={[]} standings={[{
      phaseId: "league",
      groupId: null,
      rows: [{ teamId: "a", name: "Alpha", rank: 1, played: 2, wins: 2, draws: 0, losses: 0, points: 6, scoreFor: 5, scoreAgainst: 1, scoreDifference: 4, tied: false }],
    }]} />);
    expect(html).toContain("Standings");
    expect(html).toContain("Alpha");
    expect(html).not.toContain("Grand Final");
  });
});
