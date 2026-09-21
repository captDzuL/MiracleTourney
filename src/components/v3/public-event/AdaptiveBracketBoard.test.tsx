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

  it("bounds a wide elimination board inside its horizontal scroller", () => {
    const html = renderToStaticMarkup(<AdaptiveBracketBoard
      locale="id"
      format="single_elimination"
      standings={[]}
      matches={[
        { id: "r1", roundLabel: "R1", home: "Alpha", away: "Beta", status: "completed", homeScore: 2, awayScore: 0 },
        { id: "r2", roundLabel: "R2", home: "Alpha", away: "Gamma", status: "completed", homeScore: 2, awayScore: 1 },
        { id: "r3", roundLabel: "R3", home: "Alpha", away: "Delta", status: "live", homeScore: 1, awayScore: 0 },
        { id: "r4", roundLabel: "R4", home: "Alpha", away: "Omega", status: "scheduled", homeScore: null, awayScore: null },
      ]}
    />);

    expect(html).toContain('aria-labelledby="adaptive-bracket-heading" class="min-w-0"');
    expect(html).toContain('class="mt-4 w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain pb-2"');
    expect(html).toContain("flex min-w-max items-stretch");
  });
});
