import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, mapEvent } = vi.hoisted(() => ({
  prisma: {
    eventPreviewToken: { findUnique: vi.fn() },
  },
  mapEvent: vi.fn((row: Record<string, unknown>) => ({
    ...row,
    registrationWindow: "public registration",
    startsAt: "public start",
  })),
}));

vi.mock("@/lib/platform/db", () => ({ prisma }));
vi.mock("@/lib/platform/repository", () => ({ eventPublicInclude: {}, mapEvent }));

import { hashEventRevisionPreviewToken, resolveEventRevisionPreviewToken } from "./event-revision";

const now = new Date("2026-09-09T10:00:00.000Z");
const token = "a".repeat(64);
const payload = {
  name: "Private revised event",
  description: "Only revision preview may show this",
  logoUrl: "/revision-logo.png",
  gameImageUrl: "/revision-poster.png",
  gameModeId: "mode-mlbb-5v5",
  format: "Single Elimination",
  formatConfig: null,
  participantCap: 16,
  registrationOpensAt: "2026-09-10T00:00:00.000Z",
  registrationClosesAt: "2026-09-12T00:00:00.000Z",
  eventStartsAt: "2026-09-13T00:00:00.000Z",
  timezone: "Asia/Jakarta",
  venue: "Miracle Arena",
  venueAddress: null,
  prizePoolLabel: "Rp 5 juta",
  registrationFeeRequired: true,
  registrationFeeAmount: 20000,
  registrationFeeLabel: "Rp 20.000",
  registrationUrl: null,
  characterArtUrl: null,
  accentColor: null,
  activeVisualAssetId: null,
  stream: null,
};

function previewRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "preview-1",
    tokenHash: hashEventRevisionPreviewToken(token),
    revokedAt: null,
    expiresAt: new Date("2026-09-10T10:00:00.000Z"),
    event: { id: "event-1", slug: "public-event", status: "Published" },
    revision: { id: "revision-1", status: "Draft", payload },
    ...overrides,
  };
}

describe("published revision preview resolution", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects malformed, expired, revoked, applied, and started previews", async () => {
    await expect(resolveEventRevisionPreviewToken("short", now)).resolves.toBeNull();
    expect(prisma.eventPreviewToken.findUnique).not.toHaveBeenCalled();

    for (const row of [
      previewRow({ expiresAt: now }),
      previewRow({ revokedAt: now }),
      previewRow({ revision: { id: "revision-1", status: "Applied", payload } }),
      previewRow({ event: { id: "event-1", slug: "public-event", status: "Ongoing" } }),
    ]) {
      prisma.eventPreviewToken.findUnique.mockResolvedValueOnce(row);
      await expect(resolveEventRevisionPreviewToken(token, now)).resolves.toBeNull();
    }
  });

  it("renders the private revision payload without changing the public row", async () => {
    prisma.eventPreviewToken.findUnique.mockResolvedValue(previewRow());
    const result = await resolveEventRevisionPreviewToken(token, now);

    expect(prisma.eventPreviewToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashEventRevisionPreviewToken(token) },
      include: { event: { include: {} }, revision: true },
    });
    expect(result).toMatchObject({
      revisionId: "revision-1",
      event: {
        slug: "public-event",
        name: "Private revised event",
        description: "Only revision preview may show this",
        gameId: "game-mobile-legends",
        gameModeId: "mode-mlbb-5v5",
        logoUrl: "/revision-logo.png",
        gameImageUrl: "/revision-poster.png",
        registrationFeeAmount: 20000,
      },
    });
  });
});
