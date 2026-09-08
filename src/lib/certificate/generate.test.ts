import { describe, expect, it, vi } from "vitest";

const { generateCertificate, generateCertificateIfFinal } = vi.hoisted(() => ({
  generateCertificate: vi.fn(),
  generateCertificateIfFinal: vi.fn(),
}));

vi.mock("@/modules/certificates", () => ({ generateCertificateIfFinal }));
vi.mock("@/modules/certificates/compatibility", () => ({ generateCertificate }));

import * as legacyGenerate from "./generate";

describe("lib/certificate/generate (legacy facade)", () => {
  it("delegates generateCertificate to the certificates module's compatibility entrypoint", async () => {
    generateCertificate.mockResolvedValue("https://blob.example/cert.png");

    await expect(legacyGenerate.generateCertificate("event-1", "team-1")).resolves.toBe(
      "https://blob.example/cert.png",
    );
    expect(generateCertificate).toHaveBeenCalledWith("event-1", "team-1");
  });

  it("delegates generateCertificateIfFinal to the certificates module's primary barrel", async () => {
    await legacyGenerate.generateCertificateIfFinal("match-1", "event-1");
    expect(generateCertificateIfFinal).toHaveBeenCalledWith("match-1", "event-1");
  });
});
