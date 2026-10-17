import { describe, expect, it } from "vitest";

import { resolvePositions } from "./positions";

const offered = ["Forward", "Midfielder", "Defender", "Goalkeeper"];

describe("resolvePositions", () => {
  it("returns the position names exactly as the game writes them", () => {
    expect(resolvePositions({ primary: " goalkeeper ", secondary: "FORWARD" }, offered)).toEqual({
      ok: true,
      primary: "Goalkeeper",
      secondary: "Forward",
    });
  });

  it("treats a missing or blank secondary position as none", () => {
    expect(resolvePositions({ primary: "Defender" }, offered)).toEqual({ ok: true, primary: "Defender", secondary: null });
    expect(resolvePositions({ primary: "Defender", secondary: "" }, offered)).toEqual({ ok: true, primary: "Defender", secondary: null });
    expect(resolvePositions({ primary: "Defender", secondary: "  " }, offered)).toEqual({ ok: true, primary: "Defender", secondary: null });
    expect(resolvePositions({ primary: "Defender", secondary: null }, offered)).toEqual({ ok: true, primary: "Defender", secondary: null });
  });

  it("drops a secondary position that repeats the primary", () => {
    expect(resolvePositions({ primary: "Defender", secondary: "defender" }, offered)).toEqual({
      ok: true,
      primary: "Defender",
      secondary: null,
    });
  });

  it("requires a primary position", () => {
    expect(resolvePositions({ primary: "" }, offered)).toEqual({ ok: false, message: "Posisi utama wajib dipilih." });
    expect(resolvePositions({ primary: "   " }, offered)).toEqual({ ok: false, message: "Posisi utama wajib dipilih." });
  });

  it("rejects a primary position the game does not offer", () => {
    expect(resolvePositions({ primary: "Striker" }, offered)).toEqual({ ok: false, message: "Posisi utama tidak tersedia untuk game ini." });
    expect(resolvePositions({ primary: "Center" }, offered)).toEqual({ ok: false, message: "Posisi utama tidak tersedia untuk game ini." });
  });

  it("rejects a secondary position the game does not offer", () => {
    expect(resolvePositions({ primary: "Forward", secondary: "Center" }, offered)).toEqual({
      ok: false,
      message: "Posisi cadangan tidak tersedia untuk game ini.",
    });
  });

  it("does not accept a position that only contains an offered name", () => {
    expect(resolvePositions({ primary: "Goalkeeper Pro" }, offered)).toEqual({ ok: false, message: "Posisi utama tidak tersedia untuk game ini." });
  });

  it("works for another game's positions", () => {
    expect(resolvePositions({ primary: "center", secondary: "guard" }, ["Guard", "Forward", "Center"])).toEqual({
      ok: true,
      primary: "Center",
      secondary: "Guard",
    });
  });
});
