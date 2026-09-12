import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("native captain draft", () => {
  it("offers draft intent and stops before event submission", () => {
    const wizard = readFileSync(join(process.cwd(), "src/components/registration/CaptainRegistrationWizard.tsx"), "utf8");
    const action = readFileSync(join(process.cwd(), "src/lib/registration/actions.ts"), "utf8");
    expect(wizard).toContain('name="intent" value="draft"');
    expect(action).toContain('formData.get("intent") === "draft"');
    expect(action).toContain("success=draft-saved");
  });
});
