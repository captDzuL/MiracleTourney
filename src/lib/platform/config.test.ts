import { describe, expect, it } from "vitest";

import {
  findGameConfig,
  getDefaultModeLabel,
  getFallbackLogoUrl,
  getGameArtTheme,
  getGameCertificateThemeId,
  getGameConfig,
  getGameModeConfig,
  getGamePrimaryStatKey,
  getOrderedStatEntries,
  getStatKeysForMode,
} from "./config";

describe("game registry config", () => {
  it("exposes primary stat keys through the registry instead of hardcoded game checks", () => {
    expect(getGamePrimaryStatKey("game-kuroko")).toBe("points");
    expect(getGamePrimaryStatKey("game-flashpeak")).toBe("goals");
  });

  it("exposes default mode labels and visual metadata for current games", () => {
    expect(getDefaultModeLabel("mode-kuroko-3v3")).toBe("3v3");
    expect(getDefaultModeLabel("mode-flashpeak-5v5")).toBe("5v5");

    expect(getFallbackLogoUrl("game-kuroko")).toContain("googleusercontent.com");
    expect(getFallbackLogoUrl("game-flashpeak")).toContain("googleusercontent.com");

    expect(getGameArtTheme("game-kuroko")).toMatchObject({
      label: "KNB",
    });
    expect(getGameArtTheme("game-flashpeak")).toMatchObject({
      label: "FP",
    });
  });

  it("maps certificate themes by game id", () => {
    expect(getGameCertificateThemeId("game-kuroko")).toBe("kuroko");
    expect(getGameCertificateThemeId("game-flashpeak")).toBe("flashpeak");
  });

  it("does not silently coerce unknown game ids into Kuroko config", () => {
    expect(findGameConfig("game-unknown")).toBeUndefined();
    expect(getFallbackLogoUrl("game-unknown")).toBe("");
    expect(getGameArtTheme("game-unknown")).toMatchObject({
      label: "EV",
    });
  });

  it("can fall back to the game's default mode label when a mode id is invalid", () => {
    expect(getDefaultModeLabel("mode-missing", "game-kuroko")).toBe("3v3");
    expect(getDefaultModeLabel("mode-missing", "game-flashpeak")).toBe("5v5");
  });

  it("resolves stat keys from the registry without exposing raw mode scans", () => {
    expect(getStatKeysForMode("mode-kuroko-3v3")).toEqual([
      "points",
      "assists",
      "rebounds",
      "steals",
      "blocks",
      "flb",
    ]);
    expect(getStatKeysForMode("mode-missing", "game-flashpeak")).toEqual([
      "goals",
      "assists",
      "tackles",
      "blocks",
    ]);
  });

  it("orders leaderboard stat summaries using registry stat key order", () => {
    expect(
      getOrderedStatEntries(
        {
          blocks: 2,
          assists: 5,
          goals: 3,
          tackles: 1,
        },
        "mode-flashpeak-5v5",
      ),
    ).toEqual([
      ["goals", 3],
      ["assists", 5],
      ["tackles", 1],
      ["blocks", 2],
    ]);
  });

  it("throws for unknown mode configs instead of silently coercing them", () => {
    expect(() => getGameModeConfig("mode-missing")).toThrow("Unknown game mode config: mode-missing");
  });

  it("onboards Mobile Legends, HOK, Valorant, and DOTA2 through the shared registry", () => {
    expect(getGameConfig("game-mobile-legends")).toMatchObject({
      name: "Mobile Legends",
      primaryStatKey: "kills",
    });
    expect(getGameConfig("game-hok")).toMatchObject({
      name: "Honor of Kings",
      primaryStatKey: "kills",
    });
    expect(getGameConfig("game-valorant")).toMatchObject({
      name: "Valorant",
      primaryStatKey: "kills",
    });
    expect(getGameConfig("game-dota2")).toMatchObject({
      name: "DOTA 2",
      primaryStatKey: "kills",
    });

    expect(getGameModeConfig("mode-mlbb-5v5")).toMatchObject({
      gameId: "game-mobile-legends",
      teamSize: 5,
    });
    expect(getGameModeConfig("mode-hok-5v5")).toMatchObject({
      gameId: "game-hok",
      teamSize: 5,
    });
    expect(getGameModeConfig("mode-valorant-5v5")).toMatchObject({
      gameId: "game-valorant",
      teamSize: 5,
    });
    expect(getGameModeConfig("mode-dota2-5v5")).toMatchObject({
      gameId: "game-dota2",
      teamSize: 5,
    });
  });

  it("exposes per-game stat keys and visual themes for the newly onboarded games", () => {
    expect(getStatKeysForMode("mode-mlbb-5v5")).toEqual([
      "kills",
      "assists",
      "deaths",
      "gold",
      "damage",
    ]);
    expect(getStatKeysForMode("mode-hok-5v5")).toEqual([
      "kills",
      "assists",
      "deaths",
      "gold",
      "damage",
    ]);
    expect(getStatKeysForMode("mode-valorant-5v5")).toEqual([
      "kills",
      "assists",
      "deaths",
      "plants",
      "defuses",
    ]);
    expect(getStatKeysForMode("mode-dota2-5v5")).toEqual([
      "kills",
      "assists",
      "deaths",
      "gpm",
      "xpm",
    ]);

    expect(getGameArtTheme("game-mobile-legends")).toMatchObject({ label: "ML" });
    expect(getGameArtTheme("game-hok")).toMatchObject({ label: "HOK" });
    expect(getGameArtTheme("game-valorant")).toMatchObject({ label: "VLR" });
    expect(getGameArtTheme("game-dota2")).toMatchObject({ label: "D2" });
  });
});
