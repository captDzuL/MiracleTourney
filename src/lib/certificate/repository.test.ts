import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    certificate: { count: vi.fn() },
  },
}));

vi.mock("@/lib/platform/db", () => ({ prisma }));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

import { countCertificatesForGame } from "@/lib/certificate/repository";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("countCertificatesForGame", () => {
  it("counts only ready legacy champion team certificates of events in the given game", async () => {
    // Arrange
    prisma.certificate.count.mockResolvedValue(4);

    // Act
    const count = await countCertificatesForGame("game-flashpeak");

    // Assert
    expect(count).toBe(4);
    expect(prisma.certificate.count).toHaveBeenCalledTimes(1);
    expect(prisma.certificate.count).toHaveBeenCalledWith({
      where: {
        status: "ready",
        type: "champion",
        recipientKind: "team",
        event: { gameId: "game-flashpeak" },
      },
    });
  });

  it("returns zero when the game has no ready certificate", async () => {
    // Arrange
    prisma.certificate.count.mockResolvedValue(0);

    // Act
    const count = await countCertificatesForGame("game-valorant");

    // Assert
    expect(count).toBe(0);
  });

  it("filters by the game id it was given", async () => {
    // Arrange
    prisma.certificate.count.mockResolvedValue(1);

    // Act
    await countCertificatesForGame("game-mobile-legends");

    // Assert
    expect(prisma.certificate.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ event: { gameId: "game-mobile-legends" } }),
    });
  });

  it("passes an empty game id through to the query without validation", async () => {
    // Arrange
    prisma.certificate.count.mockResolvedValue(0);

    // Act
    await countCertificatesForGame("");

    // Assert
    expect(prisma.certificate.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ event: { gameId: "" } }),
    });
  });

  it("propagates a database error", async () => {
    // Arrange
    prisma.certificate.count.mockRejectedValue(new Error("db down"));

    // Act + Assert
    await expect(countCertificatesForGame("game-flashpeak")).rejects.toThrow("db down");
  });
});
