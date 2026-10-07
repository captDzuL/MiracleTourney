import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/platform/db", () => ({
  prisma: { certificate: { findUnique } },
}));

import { loadPublishedCertificateVerification } from "./verification-repository";

const published = {
  verificationCode: "Exact_Code-7",
  type: "mvp",
  version: 3,
  recipientName: "Ayu Pratama",
  status: "ready",
  publishedAt: new Date("2026-09-12T04:00:00.000Z"),
  supersededByVersion: null,
  event: { name: "Miracle Cup" },
};

describe("Prisma certificate verification repository", () => {
  beforeEach(() => findUnique.mockReset());

  it("looks up the immutable verification code exactly and returns the public projection", async () => {
    findUnique.mockResolvedValue(published);

    await expect(loadPublishedCertificateVerification("Exact_Code-7")).resolves.toEqual({
      verificationCode: "Exact_Code-7",
      eventName: "Miracle Cup",
      certificateType: "mvp",
      certificateVersion: 3,
      recipientName: "Ayu Pratama",
      publishedAt: "2026-09-12T04:00:00.000Z",
      state: "current",
      supersededByVersion: null,
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { verificationCode: "Exact_Code-7" },
      select: {
        verificationCode: true,
        type: true,
        version: true,
        recipientName: true,
        status: true,
        publishedAt: true,
        supersededByVersion: true,
        event: { select: { name: true } },
      },
    });
  });

  it("does not query for malformed route input", async () => {
    await expect(loadPublishedCertificateVerification("../private")).resolves.toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("does not expose an unpublished row even if the storage layer returns it", async () => {
    findUnique.mockResolvedValue({ ...published, status: "draft", publishedAt: null });

    await expect(loadPublishedCertificateVerification("Exact_Code-7")).resolves.toBeNull();
  });
});
