import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FlashpeakLeaderboardTable } from "./FlashpeakLeaderboardTable";

const rows = [
  { playerId: "a", playerName: "Ari", nickname: "Ari", teamId: "a", teamName: "Alpha", position: "Forward", game: 4, score: 8.15, goal: 3, assist: 2, passing: 28, defense: 8 },
  { playerId: "b", playerName: "Bima", nickname: "Bima", teamId: "b", teamName: "Beta", position: "Defender", game: 0, score: null, goal: 0, assist: 1, passing: 12, defense: 15 },
];

describe("FlashpeakLeaderboardTable", () => {
  it.each(["id", "en"] as const)("renders six keyboard-sortable metrics and responsive overflow in %s", (locale) => {
    const html = renderToStaticMarkup(<FlashpeakLeaderboardTable locale={locale} entries={rows} />);
    expect(html).toContain("overflow-x-auto");
    expect(html).toContain('aria-sort="descending"');
    for (const key of ["game", "score", "goal", "assist", "passing", "defense"]) {
      expect(html).toContain(`data-sort-key="${key}"`);
    }
    expect(html).toContain("8.2");
    expect(html).toContain("—");
    expect(html).toContain('min-h-11');
  });
});
