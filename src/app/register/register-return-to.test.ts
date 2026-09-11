import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("captain signup return flow", () => {
  it("passes returnTo through the page and signup form", () => {
    const page = readFileSync(join(process.cwd(), "src/app/register/page.tsx"), "utf8");
    const wizard = readFileSync(join(process.cwd(), "src/app/register/RegisterWizard.tsx"), "utf8");

    expect(page).toContain("returnTo?: string");
    expect(page).toContain("returnTo={resolvedParams?.returnTo}");
    expect(wizard).toContain('name="returnTo"');
    expect(wizard).toContain("encodeURIComponent(returnTo)");
  });
});
