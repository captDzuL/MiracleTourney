import { describe, expect, it, vi } from "vitest";

import { resolvePublicCertificateVerification } from "./verification";

const publishedAt = new Date("2026-09-12T04:00:00.000Z");

const published = {
  id: "private-certificate-id",
  eventId: "private-event-id",
  recipientId: "private-recipient-id",
  verificationCode: "Verify_Exact-9",
  type: "champion",
  version: 2,
  recipientName: "Garuda Nova",
  status: "ready",
  publishedAt,
  supersededByVersion: null,
  event: { name: "Miracle Cup" },
};

describe("public certificate verification", () => {
  it.each(["", ".", "..", "a/b", "a\\b", "%2e%2e", "a?b", "a#b", " verify-1", "verify-1 ", "a".repeat(129)])(
    "rejects malformed code %s without querying certificate data",
    async (verificationCode) => {
      const lookup = vi.fn();

      await expect(resolvePublicCertificateVerification(verificationCode, lookup)).resolves.toBeNull();

      expect(lookup).not.toHaveBeenCalled();
    },
  );

  it("uses the immutable code exactly and exposes only the public current-certificate projection", async () => {
    const lookup = vi.fn().mockResolvedValue(published);

    const result = await resolvePublicCertificateVerification("Verify_Exact-9", lookup);

    expect(lookup).toHaveBeenCalledWith("Verify_Exact-9");
    expect(result).toEqual({
      verificationCode: "Verify_Exact-9",
      eventName: "Miracle Cup",
      certificateType: "champion",
      certificateVersion: 2,
      recipientName: "Garuda Nova",
      publishedAt: "2026-09-12T04:00:00.000Z",
      state: "current",
      supersededByVersion: null,
    });
    expect(result).not.toHaveProperty("id");
    expect(result).not.toHaveProperty("eventId");
    expect(result).not.toHaveProperty("recipientId");
  });

  it("keeps a published superseded version verifiable with its immutable code", async () => {
    const lookup = vi.fn().mockResolvedValue({
      ...published,
      version: 1,
      status: "superseded",
      supersededByVersion: 2,
    });

    await expect(resolvePublicCertificateVerification("Verify_Exact-9", lookup)).resolves.toMatchObject({
      verificationCode: "Verify_Exact-9",
      certificateVersion: 1,
      state: "superseded",
      supersededByVersion: 2,
    });
  });

  it.each([
    ["unknown", null],
    ["draft", { ...published, status: "draft", publishedAt: null }],
    ["unpublished-ready", { ...published, status: "ready", publishedAt: null }],
    ["failed", { ...published, status: "failed" }],
    ["unsupported-type", { ...published, type: "private_award" }],
    ["invalid-version", { ...published, version: 0 }],
    ["broken-supersession", { ...published, status: "superseded", supersededByVersion: null }],
  ])("returns the same private-safe absence for %s", async (_case, row) => {
    const lookup = vi.fn().mockResolvedValue(row);

    await expect(resolvePublicCertificateVerification("Verify_Exact-9", lookup)).resolves.toBeNull();
  });
});
