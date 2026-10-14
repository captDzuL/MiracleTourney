import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ teamFindFirst: vi.fn(), assetFindMany: vi.fn() }));
vi.mock("@/lib/platform/db", () => ({
  prisma: { team: { findFirst: db.teamFindFirst }, eventVisualAsset: { findMany: db.assetFindMany } },
}));

import { findApprovedTeamLogoAssetId, findEventTeamLogo } from "./team-logo-repository";

const SHA = "b".repeat(64);
const trustedRow = (id: string, extra: Record<string, unknown> = {}) => ({
  id, url: `https://store1.public.blob.vercel-storage.com/certificate-assets/${id}.png`, mimeType: "image/png", width: 512, height: 512,
  byteSize: 2048, storageProvider: "vercel_blob", storageKey: `certificate-assets/${id}.png`, contentSha256: SHA,
  purpose: "certificate_team_logo", ...extra,
});

describe("findEventTeamLogo", () => {
  beforeEach(() => { db.teamFindFirst.mockReset(); });

  it("scopes the lookup to the event so a team of another event is never returned", async () => {
    db.teamFindFirst.mockResolvedValue({ id: "team-1", name: "Garuda FC", logoUrl: "https://x/y.png" });
    await expect(findEventTeamLogo("event-1", "team-1")).resolves.toEqual({ id: "team-1", name: "Garuda FC", logoUrl: "https://x/y.png" });
    expect(db.teamFindFirst).toHaveBeenCalledWith({ where: { id: "team-1", eventId: "event-1" }, select: { id: true, name: true, logoUrl: true } });
  });

  it("returns null when the event has no such team", async () => {
    db.teamFindFirst.mockResolvedValue(null);
    await expect(findEventTeamLogo("event-1", "team-of-event-2")).resolves.toBeNull();
  });
});

describe("findApprovedTeamLogoAssetId", () => {
  beforeEach(() => { db.assetFindMany.mockReset(); });

  it("asks only for approved, certificate-owned team logos of this event with identical bytes", async () => {
    db.assetFindMany.mockResolvedValue([]);
    await expect(findApprovedTeamLogoAssetId("event-1", SHA)).resolves.toBeNull();
    expect(db.assetFindMany).toHaveBeenCalledTimes(1);
    expect(db.assetFindMany.mock.calls[0][0]).toMatchObject({
      where: { eventId: "event-1", status: "approved", purpose: "certificate_team_logo", contentSha256: SHA, storageKey: { startsWith: "certificate-assets/" } },
      orderBy: { createdAt: "asc" },
    });
  });

  it("returns the oldest candidate that passes the studio's trust check", async () => {
    db.assetFindMany.mockResolvedValue([trustedRow("first"), trustedRow("second")]);
    await expect(findApprovedTeamLogoAssetId("event-1", SHA)).resolves.toBe("first");
  });

  it("skips a same-hash row the studio would not trust and uses the next one", async () => {
    db.assetFindMany.mockResolvedValue([
      trustedRow("foreign-host", { url: "https://evil.example.com/certificate-assets/foreign-host.png" }),
      trustedRow("wrong-folder", { storageKey: "team-logos/wrong-folder.png", url: "https://store1.public.blob.vercel-storage.com/team-logos/wrong-folder.png" }),
      trustedRow("no-size", { byteSize: null }),
      trustedRow("good"),
    ]);
    await expect(findApprovedTeamLogoAssetId("event-1", SHA)).resolves.toBe("good");
  });

  it("returns null when no candidate is trusted, so the logo is stored again", async () => {
    db.assetFindMany.mockResolvedValue([trustedRow("bad", { contentSha256: "short" })]);
    await expect(findApprovedTeamLogoAssetId("event-1", SHA)).resolves.toBeNull();
  });
});
