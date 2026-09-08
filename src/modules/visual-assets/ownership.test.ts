import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf8");
}

describe("visual-assets module ownership", () => {
  it("keeps the repository private from the module's public barrel", () => {
    const barrel = readSource("./index.ts");
    expect(barrel).not.toMatch(/from ["']\.\/repository["']/);
  });

  it("legacy lib/actions.ts no longer performs visual asset persistence directly", () => {
    const source = readSource("../../lib/actions.ts");
    expect(source).not.toContain("prisma.eventVisualAsset");
    expect(source).toContain("@/modules/visual-assets");
  });

  it("legacy lib/platform/repository.ts delegates visual asset mutations to the module", () => {
    const source = readSource("../../lib/platform/repository.ts");
    expect(source).toContain("@/modules/visual-assets");
    expect(source).not.toContain("eventVisualAsset.create(");
    expect(source).not.toContain("eventVisualAsset.update(");
  });
});
