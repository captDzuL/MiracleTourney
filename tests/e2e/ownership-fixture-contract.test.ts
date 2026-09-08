import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("E2E fixture ownership contract", () => {
  const globalSetupPath = fileURLToPath(new URL("./global-setup.ts", import.meta.url));
  const globalSetup = readFileSync(globalSetupPath, "utf8");

  const fixturePath = fileURLToPath(new URL("./helpers/fixtures.ts", import.meta.url));
  const fixtures = readFileSync(fixturePath, "utf8");

  it("global setup upsert writes organizerUserId in both update and create branches", () => {
    expect(globalSetup).toContain("where: { email: \"test-organizer@miraclefc.gg\" }");
    expect(globalSetup).toContain("update: { status: \"Draft\", organizerUserId: organizer.id }");
    expect(globalSetup).toContain("create: {");
    expect(globalSetup).toContain("organizerUserId: organizer.id");
  });

  it("fixture create and upsert event writes always provide organizerUserId", () => {
    expect(fixtures).toContain("findUniqueOrThrow({ where: { email: \"test-organizer@miraclefc.gg\" } })");
    expect(fixtures).toContain("event.create({");
    expect(fixtures).toContain("organizerUserId: organizer.id");
    expect(fixtures).toContain("update: {");
    expect(fixtures).toContain("organizerUserId: organizer.id");
    expect(fixtures).toContain("create: {");
    expect(fixtures).toContain("organizerUserId: organizer.id");
  });
});
