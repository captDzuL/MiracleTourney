import { describe, expect, it, vi } from "vitest";

const { getPublishedPaymentSettingsForEvent } = vi.hoisted(() => ({
  getPublishedPaymentSettingsForEvent: vi.fn(),
}));
vi.mock("./event-payment-settings", () => ({ getPublishedPaymentSettingsForEvent }));

import { buildCaptainCoreRoster } from "./captain-registration";
import { getCaptainPaymentSettings } from "./captain-repository";

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

  it("allows substitutes after the core roster up to the mode limit", () => {
    const players = [
      { ign: "Bima", uid: "UID-002" },
      { ign: "Citra", uid: "UID-003" },
      { ign: "Danu", uid: "UID-004" },
      { ign: "Eka", uid: "UID-005" },
      { ign: "Fajar", uid: "UID-006", position: "Roamer" },
      { ign: "Gita", uid: "UID-007" },
    ];

    const result = buildCaptainCoreRoster({
      captainIgn: "Kirana",
      captainUid: "UID-001",
      captainIsPlayer: true,
      requiredPlayers: 5,
      maxPlayers: 7,
      players,
    });

    expect(result).toHaveLength(7);
    expect(result.slice(5).map((player) => player.uid)).toEqual(["UID-006", "UID-007"]);
  });

  it("rejects a roster larger than the mode limit including substitutes", () => {
    expect(() => buildCaptainCoreRoster({
      captainIgn: "Kirana",
      captainUid: "UID-001",
      captainIsPlayer: true,
      requiredPlayers: 5,
      maxPlayers: 7,
      players: Array.from({ length: 7 }, (_, index) => ({ ign: `Player${index}`, uid: `UID-1${index}` })),
    })).toThrow("Roster maksimal 7 pemain, termasuk cadangan");
  });

  it("still requires the full core roster when substitutes are allowed", () => {
    expect(() => buildCaptainCoreRoster({
      captainIgn: "Kirana",
      captainUid: "UID-001",
      captainIsPlayer: true,
      requiredPlayers: 5,
      maxPlayers: 7,
      players: [{ ign: "Bima", uid: "UID-002" }],
    })).toThrow("Roster inti harus berisi 5 pemain");
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

describe("captain payment settings", () => {
  it("delegates captain reads to the event-scoped published settings reader", async () => {
    getPublishedPaymentSettingsForEvent.mockResolvedValue({
      id: "event-settings-1",
      eventId: "event-1",
      source: "event",
      status: "published",
      version: 2,
      qrisImageUrl: "https://blob.example/event-1.png",
    });

    await expect(getCaptainPaymentSettings("event-1")).resolves.toMatchObject({
      eventId: "event-1",
      source: "event",
      status: "published",
    });
    expect(getPublishedPaymentSettingsForEvent).toHaveBeenCalledWith("event-1");
  });
});
