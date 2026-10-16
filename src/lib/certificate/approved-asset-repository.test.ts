import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ assetFindMany: vi.fn() }));
vi.mock("@/lib/platform/db", () => ({ prisma: { eventVisualAsset: { findMany: db.assetFindMany } } }));

import { findApprovedCharacterArtAssetId, findApprovedCertificateAssetId } from "./approved-asset-repository";

const SHA = "c".repeat(64);
const trustedRow = (id: string, extra: Record<string, unknown> = {}) => ({
  id, url: `https://store1.public.blob.vercel-storage.com/certificate-assets/${id}.webp`, mimeType: "image/webp", width: 1443, height: 2000,
  byteSize: 213418, storageProvider: "vercel_blob", storageKey: `certificate-assets/${id}.webp`, contentSha256: SHA,
  purpose: "certificate_character_art", ...extra,
});

describe("findApprovedCertificateAssetId", () => {
  beforeEach(() => { db.assetFindMany.mockReset(); });

  it("asks only for approved, certificate-owned assets of this event, purpose and bytes", async () => {
    db.assetFindMany.mockResolvedValue([]);
    await expect(findApprovedCertificateAssetId("event-1", "certificate_character_art", SHA)).resolves.toBeNull();
    expect(db.assetFindMany.mock.calls[0][0]).toMatchObject({
      where: { eventId: "event-1", status: "approved", purpose: "certificate_character_art", contentSha256: SHA, storageKey: { startsWith: "certificate-assets/" } },
      orderBy: { createdAt: "asc" },
      take: 20,
    });
  });

  it("skips a same-hash row the studio would not trust and uses the next one", async () => {
    db.assetFindMany.mockResolvedValue([
      trustedRow("foreign-host", { url: "https://evil.example.com/certificate-assets/foreign-host.webp" }),
      trustedRow("no-size", { byteSize: null }),
      trustedRow("good"),
    ]);
    await expect(findApprovedCertificateAssetId("event-1", "certificate_character_art", SHA)).resolves.toBe("good");
  });

  it("returns null when no candidate is trusted", async () => {
    db.assetFindMany.mockResolvedValue([trustedRow("bad", { contentSha256: "short" })]);
    await expect(findApprovedCertificateAssetId("event-1", "certificate_character_art", SHA)).resolves.toBeNull();
  });
});

describe("findApprovedCharacterArtAssetId", () => {
  beforeEach(() => { db.assetFindMany.mockReset(); });

  it("looks for the character art purpose", async () => {
    db.assetFindMany.mockResolvedValue([trustedRow("first")]);
    await expect(findApprovedCharacterArtAssetId("event-1", SHA)).resolves.toBe("first");
    expect(db.assetFindMany.mock.calls[0][0].where.purpose).toBe("certificate_character_art");
  });
});
