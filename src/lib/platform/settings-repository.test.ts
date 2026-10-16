import { beforeEach, describe, expect, it, vi } from "vitest";

import { gameModes, games } from "@/lib/platform/config";
import type { AppUser, Event } from "@/lib/platform/types";

const { prisma } = vi.hoisted(() => {
  const client = {
    platformProfile: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    organizerProfile: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    paymentSettings: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    event: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  return { prisma: client };
});

vi.mock("@/lib/platform/db", () => ({ prisma }));

import {
  getAllGames,
  getGameForEvent,
  getGameModes,
  getModeForEvent,
  getOrganizerProfileForUser,
  getPaymentSettings,
  getPlatformProfile,
  updateOrganizerProfileForUser,
  updatePaymentSettings,
  updatePlatformProfile,
} from "@/lib/platform/settings-repository";

function eventWith(gameId: string, gameModeId: string): Event {
  return { gameId, gameModeId } as Event;
}

function userWithRole(role: AppUser["role"]): AppUser {
  return { id: "user-1", email: "user-1@example.test", name: "User One", role };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getAllGames", () => {
  it("returns the static game list from config", () => {
    const result = getAllGames();

    expect(result).toBe(games);
    expect(result.map((game) => game.id)).toEqual([
      "game-kuroko",
      "game-flashpeak",
      "game-mobile-legends",
      "game-hok",
      "game-valorant",
      "game-dota2",
    ]);
  });
});

describe("getGameModes", () => {
  it("returns the static game mode list from config", () => {
    const result = getGameModes();

    expect(result).toBe(gameModes);
    expect(result.map((mode) => mode.id)).toEqual([
      "mode-kuroko-3v3",
      "mode-flashpeak-5v5",
      "mode-mlbb-5v5",
      "mode-hok-5v5",
      "mode-valorant-5v5",
      "mode-dota2-5v5",
    ]);
  });
});

describe("getGameForEvent", () => {
  it("returns the game config matching the event gameId", () => {
    const game = getGameForEvent(eventWith("game-valorant", "mode-valorant-5v5"));

    expect(game.id).toBe("game-valorant");
    expect(game).toBe(games.find((candidate) => candidate.id === "game-valorant"));
  });

  it("throws with the unknown id when the event game is not in config", () => {
    expect(() => getGameForEvent(eventWith("game-missing", "mode-valorant-5v5"))).toThrow(
      "Unknown game config: game-missing",
    );
  });

  it("throws when the event gameId is an empty string", () => {
    expect(() => getGameForEvent(eventWith("", "mode-valorant-5v5"))).toThrow("Unknown game config: ");
  });
});

describe("getModeForEvent", () => {
  it("returns the mode config matching the event gameModeId", () => {
    const mode = getModeForEvent(eventWith("game-kuroko", "mode-kuroko-3v3"));

    expect(mode.id).toBe("mode-kuroko-3v3");
    expect(mode.teamSize).toBe(3);
    expect(mode).toBe(gameModes.find((candidate) => candidate.id === "mode-kuroko-3v3"));
  });

  it("looks up the mode by gameModeId and ignores gameId", () => {
    const mode = getModeForEvent(eventWith("game-missing", "mode-dota2-5v5"));

    expect(mode.id).toBe("mode-dota2-5v5");
  });

  it("throws with the unknown id when the event mode is not in config", () => {
    expect(() => getModeForEvent(eventWith("game-kuroko", "mode-missing"))).toThrow(
      "Unknown game mode config: mode-missing",
    );
  });
});

describe("getPlatformProfile", () => {
  it("reads the global profile selecting only display and contact fields", async () => {
    const profile = { displayName: "Miracle", contactChannel: "WhatsApp", contactValue: "08123456789" };
    prisma.platformProfile.findUnique.mockResolvedValue(profile);

    const result = await getPlatformProfile();

    expect(prisma.platformProfile.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.platformProfile.findUnique).toHaveBeenCalledWith({
      where: { id: "global" },
      select: { displayName: true, contactChannel: true, contactValue: true },
    });
    expect(result).toEqual(profile);
  });

  it("returns null when no global profile exists", async () => {
    prisma.platformProfile.findUnique.mockResolvedValue(null);

    await expect(getPlatformProfile()).resolves.toBeNull();
  });

  it("propagates database errors", async () => {
    prisma.platformProfile.findUnique.mockRejectedValue(new Error("db down"));

    await expect(getPlatformProfile()).rejects.toThrow("db down");
  });
});

describe("updatePlatformProfile", () => {
  it("upserts the global profile with the same input for update and create", async () => {
    prisma.platformProfile.upsert.mockResolvedValue({});
    const input = { displayName: "Miracle", contactChannel: "Instagram", contactValue: "@miracle" };

    const result = await updatePlatformProfile(input);

    expect(prisma.platformProfile.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.platformProfile.upsert).toHaveBeenCalledWith({
      where: { id: "global" },
      update: input,
      create: { id: "global", ...input },
    });
    expect(result).toBeUndefined();
  });

  it("propagates database errors", async () => {
    prisma.platformProfile.upsert.mockRejectedValue(new Error("write failed"));

    await expect(
      updatePlatformProfile({ displayName: "A", contactChannel: "B", contactValue: "C" }),
    ).rejects.toThrow("write failed");
  });
});

describe("getPaymentSettings", () => {
  it("looks up the global payment settings row by id", async () => {
    prisma.paymentSettings.findUnique.mockResolvedValue(null);

    await getPaymentSettings();

    expect(prisma.paymentSettings.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.paymentSettings.findUnique).toHaveBeenCalledWith({ where: { id: "global" } });
  });

  it("returns only the id when no row exists", async () => {
    prisma.paymentSettings.findUnique.mockResolvedValue(null);

    await expect(getPaymentSettings()).resolves.toEqual({ id: "global" });
  });

  it("maps a full row including updatedAt", async () => {
    const updatedAt = new Date("2026-01-15T10:00:00.000Z");
    prisma.paymentSettings.findUnique.mockResolvedValue({
      id: "global",
      qrisImageUrl: "https://example.test/qris.png",
      instructions: "Transfer lalu kirim bukti.",
      updatedAt,
    });

    const result = await getPaymentSettings();

    expect(result).toEqual({
      id: "global",
      qrisImageUrl: "https://example.test/qris.png",
      instructions: "Transfer lalu kirim bukti.",
      updatedAt,
    });
  });

  it("omits null and empty fields from the mapped result", async () => {
    prisma.paymentSettings.findUnique.mockResolvedValue({
      id: "global",
      qrisImageUrl: null,
      instructions: "",
    });

    const result = await getPaymentSettings();

    expect(result).toEqual({ id: "global" });
    expect(Object.keys(result)).toEqual(["id"]);
  });

  it("propagates database errors", async () => {
    prisma.paymentSettings.findUnique.mockRejectedValue(new Error("db down"));

    await expect(getPaymentSettings()).rejects.toThrow("db down");
  });
});

describe("updatePaymentSettings", () => {
  it("upserts the global row with provided values and returns the mapped row", async () => {
    prisma.paymentSettings.upsert.mockResolvedValue({
      id: "global",
      qrisImageUrl: "https://example.test/qris.png",
      instructions: "Bayar via QRIS",
    });

    const result = await updatePaymentSettings({
      qrisImageUrl: "https://example.test/qris.png",
      instructions: "Bayar via QRIS",
    });

    const data = { qrisImageUrl: "https://example.test/qris.png", instructions: "Bayar via QRIS" };
    expect(prisma.paymentSettings.upsert).toHaveBeenCalledWith({
      where: { id: "global" },
      update: data,
      create: { id: "global", ...data },
    });
    expect(result).toEqual({ id: "global", ...data });
  });

  it("stores null for undefined and null fields", async () => {
    prisma.paymentSettings.upsert.mockResolvedValue({ id: "global", qrisImageUrl: null, instructions: null });

    const result = await updatePaymentSettings({ qrisImageUrl: undefined, instructions: null });

    expect(prisma.paymentSettings.upsert).toHaveBeenCalledWith({
      where: { id: "global" },
      update: { qrisImageUrl: null, instructions: null },
      create: { id: "global", qrisImageUrl: null, instructions: null },
    });
    expect(result).toEqual({ id: "global" });
  });

  it("keeps an empty string as is instead of converting it to null", async () => {
    prisma.paymentSettings.upsert.mockResolvedValue({ id: "global", qrisImageUrl: null, instructions: "" });

    await updatePaymentSettings({ instructions: "" });

    expect(prisma.paymentSettings.upsert).toHaveBeenCalledWith({
      where: { id: "global" },
      update: { qrisImageUrl: null, instructions: "" },
      create: { id: "global", qrisImageUrl: null, instructions: "" },
    });
  });
});

describe("getOrganizerProfileForUser", () => {
  it.each(["captain", "platform_admin"] as const)("returns null for %s without querying the database", async (role) => {
    const result = await getOrganizerProfileForUser(userWithRole(role));

    expect(result).toBeNull();
    expect(prisma.organizerProfile.findUnique).not.toHaveBeenCalled();
  });

  it("reads the organizer profile by user id with the summary fields", async () => {
    const profile = { organizationName: "Org", contactChannel: "WhatsApp", contactValue: "0812", verified: true };
    prisma.organizerProfile.findUnique.mockResolvedValue(profile);

    const result = await getOrganizerProfileForUser(userWithRole("organizer"));

    expect(prisma.organizerProfile.findUnique).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: { organizationName: true, contactChannel: true, contactValue: true, verified: true },
    });
    expect(result).toEqual(profile);
  });

  it("returns null when an organizer has no profile row", async () => {
    prisma.organizerProfile.findUnique.mockResolvedValue(null);

    await expect(getOrganizerProfileForUser(userWithRole("organizer"))).resolves.toBeNull();
  });
});

describe("updateOrganizerProfileForUser", () => {
  const input = { organizationName: "New Org", contactChannel: "Telegram", contactValue: "@neworg" };

  it("rejects non-organizer users before opening a transaction", async () => {
    await expect(updateOrganizerProfileForUser(userWithRole("captain"), input)).rejects.toThrow("Not authorized");

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("upserts the profile and renames the organizer events inside one transaction", async () => {
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => Promise<void>) => callback(prisma));
    prisma.organizerProfile.upsert.mockResolvedValue({});
    prisma.event.updateMany.mockResolvedValue({ count: 2 });

    const result = await updateOrganizerProfileForUser(userWithRole("organizer"), input);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.organizerProfile.upsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      update: input,
      create: { userId: "user-1", ...input },
    });
    expect(prisma.event.updateMany).toHaveBeenCalledWith({
      where: { organizerUserId: "user-1" },
      data: { organizerName: "New Org" },
    });
    expect(result).toBeUndefined();
  });

  it("does not rename events when the profile upsert fails", async () => {
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => Promise<void>) => callback(prisma));
    prisma.organizerProfile.upsert.mockRejectedValue(new Error("upsert failed"));

    await expect(updateOrganizerProfileForUser(userWithRole("organizer"), input)).rejects.toThrow("upsert failed");

    expect(prisma.event.updateMany).not.toHaveBeenCalled();
  });
});
