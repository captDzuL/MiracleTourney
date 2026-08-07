import fs from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

describe("admin action buttons", () => {
  test("do not use invisible light-on-light secondary button styling", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "./page.tsx"), "utf8");

    expect(source).not.toContain(
      'rounded-full border border-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/5',
    );
  });

  test("shows a match operations section with result entry controls", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "./page.tsx"), "utf8");

    expect(source).toContain("Match operations");
    expect(source).toContain("Save match result");
    expect(source).toContain("homeScore");
    expect(source).toContain("awayScore");
  });

  test("lets admin choose which manageable event should receive match results", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "./page.tsx"), "utf8");

    expect(source).toContain("manageableEvents");
    expect(source).toContain("selectedManageableEventId");
    expect(source).toContain('name="eventId"');
    expect(source).toContain("Choose event");
  });
});
