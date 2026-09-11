import { describe, expect, it } from "vitest";

import { pickMvpCharacterArt, resolveMvpForCertificate, selectMvpEntry } from "./mvp";
import type { PlayerLeaderboardEntry } from "@/lib/tournament/types";

function entry(overrides: Partial<PlayerLeaderboardEntry>): PlayerLeaderboardEntry {
  return {
    playerId: "player-1",
    playerName: "Bagas Wirawan",
    teamId: "team-1",
    position: "Forward",
    gameSlug: "flashpeak",
    matchesPlayed: 5,
    totalStats: { goal: 11 },
    ...overrides,
  };
}

describe("pickMvpCharacterArt", () => {
  it("maps Flashpeak positions to their character pool folder", () => {
    expect(pickMvpCharacterArt("Defender", "seed-a")).toMatch(/^\/character-art\/roster\/defender\//);
    expect(pickMvpCharacterArt("Midfielder", "seed-a")).toMatch(/^\/character-art\/roster\/midfielder\//);
    expect(pickMvpCharacterArt("Forward", "seed-a")).toMatch(/^\/character-art\/roster\/striker\//);
    expect(pickMvpCharacterArt("Goalkeeper", "seed-a")).toBe("/character-art/roster/goalkeeper/maxim.jpg");
  });

  it("is case-insensitive and returns null for unmapped positions", () => {
    expect(pickMvpCharacterArt("forward", "seed-a")).toMatch(/^\/character-art\/roster\/striker\//);
    expect(pickMvpCharacterArt("Point Guard", "seed-a")).toBeNull();
  });

  it("is deterministic for the same seed and position", () => {
    const first = pickMvpCharacterArt("Forward", "player-42");
    const second = pickMvpCharacterArt("Forward", "player-42");
    expect(first).toBe(second);
  });

  it("can pick different characters for different seeds within the same role", () => {
    const picks = new Set(
      ["ahmad-fauzi", "bagas-wirawan", "citra-lestari", "dimas-pratama", "eko-santoso", "farhan-hidayat"].map(
        (seed) => pickMvpCharacterArt("Forward", seed),
      ),
    );
    expect(picks.size).toBeGreaterThan(1);
  });
});

describe("selectMvpEntry", () => {
  it("returns the first entry belonging to the winning team from an already-sorted leaderboard", () => {
    const entries = [
      entry({ playerId: "p1", teamId: "team-runner-up", position: "Forward", totalStats: { goal: 20 } }),
      entry({ playerId: "p2", teamId: "team-1", position: "Forward", totalStats: { goal: 11 } }),
      entry({ playerId: "p3", teamId: "team-1", position: "Defender", totalStats: { goal: 2 } }),
    ];

    const mvp = selectMvpEntry(entries, "team-1");
    expect(mvp?.playerId).toBe("p2");
  });

  it("returns null when the winning team has no leaderboard entries", () => {
    const entries = [entry({ teamId: "team-other" })];
    expect(selectMvpEntry(entries, "team-1")).toBeNull();
  });
});

describe("resolveMvpForCertificate", () => {
  it("resolves a portrait, name, and role label for Flashpeak", () => {
    const entries = [entry({ playerId: "p2", teamId: "team-1", position: "Forward", totalStats: { goal: 11 } })];
    const result = resolveMvpForCertificate("game-flashpeak", entries, "team-1");

    expect(result).not.toBeNull();
    expect(result?.url).toMatch(/^\/character-art\/roster\/striker\//);
    expect(result?.name).toBe("Bagas Wirawan");
    expect(result?.roleLabel).toBe("Forward · 11 goals");
  });

  it("returns null for games other than Flashpeak", () => {
    const entries = [entry({ teamId: "team-1" })];
    expect(resolveMvpForCertificate("game-kuroko", entries, "team-1")).toBeNull();
  });

  it("returns null when the position doesn't map to a character pool", () => {
    const entries = [entry({ teamId: "team-1", position: "Utility" })];
    expect(resolveMvpForCertificate("game-flashpeak", entries, "team-1")).toBeNull();
  });
});
