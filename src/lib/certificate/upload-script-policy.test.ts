import { describe, expect, it, vi } from "vitest";

import { appendLegacyUploadInSerializableTransaction, buildLegacyUploadAppend } from "../../../scripts/certificate-upload-policy.mjs";

const legacy = {
  id: "legacy-champion-v1",
  eventId: "event-1",
  teamId: "team-1",
  type: "champion",
  recipientKind: "team",
  recipientId: "team-1",
  recipientName: "Garuda Nova",
  version: 1,
  templateVersion: "legacy-v1",
  completionId: null,
};

describe("legacy certificate upload policy", () => {
  it("builds a new legacy version without an update or supersession payload", () => {
    const publishedAt = new Date("2026-09-12T10:00:00.000Z");
    expect(buildLegacyUploadAppend(legacy, null, "https://store.public.blob.vercel-storage.com/certificates/legacy-v2.png", publishedAt)).toEqual({
      eventId: "event-1",
      teamId: "team-1",
      type: "champion",
      recipientKind: "team",
      recipientId: "team-1",
      recipientName: "Garuda Nova",
      version: 2,
      templateVersion: "legacy-v1",
      imageUrl: "https://store.public.blob.vercel-storage.com/certificates/legacy-v2.png",
      publishedUrl: "https://store.public.blob.vercel-storage.com/certificates/legacy-v2.png",
      status: "ready",
      generatedAt: publishedAt,
      publishedAt,
      attemptCount: 1,
    });
  });

  it.each([
    ["a completed V3 event", legacy, { id: "completion-1" }],
    ["a V3 certificate row", { ...legacy, templateVersion: "miracle-v3", completionId: "completion-1" }, null],
  ])("refuses to target %s", (_label, certificate, completion) => {
    expect(() => buildLegacyUploadAppend(certificate, completion, "https://store.public.blob.vercel-storage.com/certificates/new.png", new Date()))
      .toThrow("Certificate Studio");
  });

  it("rechecks V3 ownership inside the serializable append transaction after an external preflight", async () => {
    expect(() => buildLegacyUploadAppend(legacy, null, "https://store.public.blob.vercel-storage.com/certificates/preflight.png", new Date()))
      .not.toThrow();
    const create = vi.fn();
    const tx = {
      tournamentCompletion: { findFirst: vi.fn().mockResolvedValue({ id: "completion-created-after-preflight" }) },
      certificate: {
        findFirst: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(legacy),
        create,
      },
    };
    const prisma = {
      $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    };

    await expect(appendLegacyUploadInSerializableTransaction(
      prisma,
      "event-1",
      "https://store.public.blob.vercel-storage.com/certificates/new.png",
      new Date("2026-09-12T10:00:00.000Z"),
    )).rejects.toThrow("Certificate Studio");
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(create).not.toHaveBeenCalled();
  });

  it("re-reads the latest legacy row and appends it inside the same serializable transaction", async () => {
    const latest = { ...legacy, id: "legacy-v4", version: 4 };
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "legacy-v5", ...data }));
    const tx = {
      tournamentCompletion: { findFirst: vi.fn().mockResolvedValue(null) },
      certificate: {
        findFirst: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(latest),
        create,
      },
    };
    const prisma = {
      $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    };

    await expect(appendLegacyUploadInSerializableTransaction(
      prisma,
      "event-1",
      "https://store.public.blob.vercel-storage.com/certificates/new.png",
      new Date("2026-09-12T10:00:00.000Z"),
    )).resolves.toMatchObject({ id: "legacy-v5", version: 5 });
    expect(tx.tournamentCompletion.findFirst).toHaveBeenCalledWith({ where: { eventId: "event-1" }, select: { id: true } });
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ eventId: "event-1", version: 5, templateVersion: "legacy-v1" }) });
  });
});
