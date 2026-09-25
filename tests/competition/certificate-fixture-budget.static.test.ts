import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const helper = readFileSync(resolve(root, "tests/e2e/helpers/completion.ts"), "utf8");
const certificateSpec = readFileSync(resolve(root, "tests/e2e/organizer-v3-certificates.spec.ts"), "utf8");

describe("certificate fixture budget contract", () => {
  it("persists the authoritative certificate history without replaying regeneration workflows", () => {
    expect(helper).toContain("onBaseFixtureReady");
    expect(helper).toContain("certificate.createMany");
    expect(helper).toContain("certificateGenerationMutation.createMany");
    expect(helper).not.toContain("await regenerateCertificate(");
    expect(helper).not.toContain("await publishCertificateSet(");
  });

  it("registers fixture cleanup and names the focused setup boundaries", () => {
    expect(certificateSpec).toContain("onBaseFixtureReady");
    expect(certificateSpec).toContain('test.step("fixture setup"');
    expect(certificateSpec).toContain('test.step("organizer login"');
    expect(certificateSpec).toContain('test.step("certificate navigation"');
    expect(certificateSpec).toContain('test.step("publication"');
  });
});
