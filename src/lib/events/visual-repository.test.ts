import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    event: { update: vi.fn() },
  },
}));

vi.mock("@/lib/platform/db", () => ({ prisma }));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

import { updateEventBrandAssets, updateEventCertificateAssets } from "@/lib/events/visual-repository";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("updateEventCertificateAssets", () => {
  it("updates the character art url and accent color of the event and returns nothing", async () => {
    // Arrange
    prisma.event.update.mockResolvedValue({ id: "event-1" });

    // Act
    const result = await updateEventCertificateAssets("event-1", {
      characterArtUrl: "/art/hero.png",
      accentColor: "#ff8800",
    });

    // Assert
    expect(result).toBeUndefined();
    expect(prisma.event.update).toHaveBeenCalledTimes(1);
    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: { characterArtUrl: "/art/hero.png", accentColor: "#ff8800" },
    });
  });

  it("sends only the provided field so the other column is left untouched", async () => {
    // Arrange
    prisma.event.update.mockResolvedValue({ id: "event-1" });

    // Act
    await updateEventCertificateAssets("event-1", { accentColor: "#112233" });

    // Assert
    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: { accentColor: "#112233" },
    });
    const data = prisma.event.update.mock.calls[0]?.[0].data;
    expect(data).not.toHaveProperty("characterArtUrl");
  });

  it("passes an empty update object through unchanged", async () => {
    // Arrange
    prisma.event.update.mockResolvedValue({ id: "event-1" });

    // Act
    await updateEventCertificateAssets("event-1", {});

    // Assert
    expect(prisma.event.update).toHaveBeenCalledWith({ where: { id: "event-1" }, data: {} });
  });

  it("propagates the database error when the event does not exist", async () => {
    // Arrange
    prisma.event.update.mockRejectedValue(new Error("Record to update not found"));

    // Act + Assert
    await expect(updateEventCertificateAssets("missing", { accentColor: "#000000" })).rejects.toThrow(
      "Record to update not found",
    );
  });
});

describe("updateEventBrandAssets", () => {
  it("updates the logo url and game image url of the event and returns nothing", async () => {
    // Arrange
    prisma.event.update.mockResolvedValue({ id: "event-1" });

    // Act
    const result = await updateEventBrandAssets("event-1", {
      logoUrl: "/logos/event.png",
      gameImageUrl: "/games/event.png",
    });

    // Assert
    expect(result).toBeUndefined();
    expect(prisma.event.update).toHaveBeenCalledTimes(1);
    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: { logoUrl: "/logos/event.png", gameImageUrl: "/games/event.png" },
    });
  });

  it("sends only the provided field", async () => {
    // Arrange
    prisma.event.update.mockResolvedValue({ id: "event-1" });

    // Act
    await updateEventBrandAssets("event-1", { logoUrl: "/logos/only.png" });

    // Assert
    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: { logoUrl: "/logos/only.png" },
    });
  });

  it("propagates the database error", async () => {
    // Arrange
    prisma.event.update.mockRejectedValue(new Error("db down"));

    // Act + Assert
    await expect(updateEventBrandAssets("event-1", { logoUrl: "/x.png" })).rejects.toThrow("db down");
  });
});
