import { describe, expect, it } from "vitest";

import { buildLegacyUploadAppend } from "../../../scripts/certificate-upload-policy.mjs";

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
});
