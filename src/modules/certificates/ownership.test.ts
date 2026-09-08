import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf8");
}

describe("certificates module ownership", () => {
  it("keeps the repository private from the module's public barrel", () => {
    const barrel = readSource("./index.ts");
    expect(barrel).not.toMatch(/from ["']\.\/repository["']/);
  });

  it("does not expose actor-less low-level mutation/generation primitives on the primary barrel", () => {
    const barrel = readSource("./index.ts");
    // The compatibility entrypoint is for legacy src/lib facades only; it must never be
    // re-exported from the sanctioned public barrel that manager-facing code imports from.
    expect(barrel).not.toMatch(/from ["']\.\/compatibility["']/);

    const service = readSource("./service.ts");
    expect(service).not.toMatch(/\bfunction\s+updateEventCertificateAssets\b/);
    expect(service).not.toMatch(/\bfunction\s+recordCertificateSuccess\b/);
    expect(service).not.toMatch(/\bfunction\s+recordCertificateFailure\b/);
    expect(service).not.toMatch(/\bfunction\s+generateCertificate\b/);

    // The internal/system post-match trigger stays public: src/lib/actions.ts dynamically
    // invokes it after its own already-authorized match-result write. It is the explicitly
    // sanctioned exception, not a manager-facing mutation primitive like the ones above.
    expect(service).toMatch(/\bfunction\s+generateCertificateIfFinal\b/);
  });

  it("hosts the actor-less low-level primitives only on the compatibility entrypoint", () => {
    const compatibility = readSource("./compatibility.ts");
    expect(compatibility).toMatch(/\bfunction\s+updateEventCertificateAssets\b/);
    expect(compatibility).toMatch(/\bfunction\s+recordCertificateSuccess\b/);
    expect(compatibility).toMatch(/\bfunction\s+recordCertificateFailure\b/);
    expect(compatibility).toMatch(/\bfunction\s+generateCertificate\b/);
  });

  it("legacy lib/certificate/generate.ts delegates the system trigger to the primary barrel and the low-level generator to the compatibility entrypoint", () => {
    const source = readSource("../../lib/certificate/generate.ts");
    expect(source).toContain("generateCertificateIfFinal");
    expect(source).toContain("generateCertificate");
    expect(source).toMatch(/from ["']@\/modules\/certificates["']/);
    expect(source).toMatch(/from ["']@\/modules\/certificates\/compatibility["']/);
    expect(source).not.toContain("prisma.certificate");
    expect(source).not.toContain('await import("@vercel/blob")');
    expect(source).not.toContain("@/modules/certificates/repository");
  });

  it("legacy lib/actions.ts no longer performs certificate persistence or rendering directly", () => {
    const source = readSource("../../lib/actions.ts");
    expect(source).not.toContain("prisma.certificate");
    expect(source).not.toContain('import("@/lib/certificate/generate")');
    expect(source).toContain("@/modules/certificates");
    expect(source).not.toContain("@/modules/certificates/repository");
  });

  it("legacy lib/platform/repository.ts delegates certificate reads to the primary barrel and mutation primitives to the compatibility entrypoint", () => {
    const source = readSource("../../lib/platform/repository.ts");
    expect(source).toMatch(/from ["']@\/modules\/certificates["']/);
    expect(source).toMatch(/from ["']@\/modules\/certificates\/compatibility["']/);
    expect(source).not.toContain("certificate.upsert(");
    expect(source).not.toContain("@/modules/certificates/repository");
  });

  it("legacy src/lib facades never import the certificates repository directly", () => {
    const sources = [
      readSource("../../lib/certificate/generate.ts"),
      readSource("../../lib/platform/repository.ts"),
      readSource("../../lib/actions.ts"),
    ];

    for (const source of sources) {
      expect(source).not.toMatch(/@\/modules\/certificates\/repository/);
    }
  });
});
