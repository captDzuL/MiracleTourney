import { describe, expect, it } from "vitest";

import { loadCompletionWorkspace } from "./workspace";

describe("completion workspace read model", () => {
  it.each([
    ["en", "Group + Playoffs"],
    ["id", "Grup + Playoff"],
  ] as const)("returns a localized integration boundary for %s without inventing competition facts", async (locale, formatLabel) => {
    const state = await loadCompletionWorkspace({
      id: "event-1",
      name: "Miracle Open",
      slug: "miracle-open",
      formatConfig: {
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
    }, locale);

    expect(state).toMatchObject({
      status: "integration_required",
      event: { id: "event-1", name: "Miracle Open", formatLabel },
      version: null,
      blockers: null,
      podium: { sourceKind: "integration_pending", sourceLabel: null, locked: null, placements: null },
      certificates: { generated: null, total: null, status: "integration_pending", studioHref: null },
      publication: { status: "integration_pending", previewHref: null },
      audit: { lastAction: null, actorLabel: null, at: null, summary: null },
    });
    expect(state.awards.map(({ award }) => award)).toEqual([
      "mvp", "top_scorer", "top_defender", "top_assist",
    ]);
    expect(state.awards.every(({ candidates, metricLabel, selectedPlayerId, tied }) => candidates === null && metricLabel === null && selectedPlayerId === null && tied === null)).toBe(true);
  });
});
