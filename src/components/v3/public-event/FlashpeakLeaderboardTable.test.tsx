import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FlashpeakLeaderboardTable } from "./FlashpeakLeaderboardTable";

Object.assign(globalThis, { React });

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

  it.each(["id", "en"] as const)("explains that %s has no completed player statistics when the source is empty", (locale) => {
    const html = renderToStaticMarkup(<FlashpeakLeaderboardTable locale={locale} entries={[]} emptyState="no-data" />);

    expect(html).toContain(locale === "id" ? "Belum ada statistik pemain yang selesai." : "No completed player statistics yet.");
    expect(html).not.toContain(locale === "id" ? "Tidak ada pemain yang cocok dengan filter." : "No players match the filters.");
  });

  it("keeps filter-empty copy distinct from an empty leaderboard source", () => {
    const html = renderToStaticMarkup(<FlashpeakLeaderboardTable locale="en" entries={[]} emptyState="no-matches" />);

    expect(html).toContain("No players match the filters.");
    expect(html).not.toContain("No completed player statistics yet.");
  });
});
