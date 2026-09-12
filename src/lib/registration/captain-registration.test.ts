import { describe, expect, it } from "vitest";

import { buildCaptainCoreRoster } from "./captain-registration";

describe("captain core roster", () => {
  it("counts the captain once when the captain is also a player", () => {
    const result = buildCaptainCoreRoster({
      captainIgn: "Kirana",
      captainUid: "UID-001",
      captainIsPlayer: true,
      requiredPlayers: 5,
      players: [
        { ign: "Bima", uid: "UID-002", position: "Roamer" },
        { ign: "Citra", uid: "UID-003", position: "Mid" },
        { ign: "Danu", uid: "UID-004", position: "Jungle" },
        { ign: "Eka", uid: "UID-005", position: "Gold" },
      ],
    });

    expect(result).toEqual([
      { ign: "Kirana", uid: "UID-001", position: "Captain" },
      { ign: "Bima", uid: "UID-002", position: "Roamer" },
      { ign: "Citra", uid: "UID-003", position: "Mid" },
      { ign: "Danu", uid: "UID-004", position: "Jungle" },
      { ign: "Eka", uid: "UID-005", position: "Gold" },
    ]);
  });

  it("keeps a non-playing captain outside the required core roster", () => {
    const result = buildCaptainCoreRoster({
      captainIgn: "CoachK",
      captainUid: "CAP-99",
      captainIsPlayer: false,
      requiredPlayers: 2,
      players: [
        { ign: "Alpha", uid: "P-1", position: "Carry" },
        { ign: "Bravo", uid: "P-2", position: "Support" },
      ],
    });

    expect(result).toHaveLength(2);
    expect(result.map((player) => player.uid)).not.toContain("CAP-99");
  });

  it("rejects duplicate UIDs including a duplicated captain", () => {
    expect(() => buildCaptainCoreRoster({
      captainIgn: "Kirana",
      captainUid: "UID-001",
      captainIsPlayer: true,
      requiredPlayers: 2,
      players: [{ ign: "Clone", uid: "uid-001", position: "Mid" }],
    })).toThrow("UID setiap pemain harus unik");
  });

  it("requires exactly the event core team size", () => {
    expect(() => buildCaptainCoreRoster({
      captainIgn: "CoachK",
      captainUid: "CAP-99",
      captainIsPlayer: false,
      requiredPlayers: 3,
      players: [
        { ign: "Alpha", uid: "P-1" },
        { ign: "Bravo", uid: "P-2" },
      ],
    })).toThrow("Roster inti harus berisi 3 pemain");
  });

  it("trims and rejects incomplete player rows", () => {
    expect(() => buildCaptainCoreRoster({
      captainIgn: " Kirana ",
      captainUid: " UID-001 ",
      captainIsPlayer: false,
      requiredPlayers: 1,
      players: [{ ign: " ", uid: "UID-002" }],
    })).toThrow("IGN dan UID setiap pemain wajib diisi");
  });
});
