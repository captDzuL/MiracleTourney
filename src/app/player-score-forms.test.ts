import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("player score form wiring", () => {
  it.each([
    ["captain", path.resolve(__dirname, "captain/stats/page.tsx")],
    ["organizer", path.resolve(__dirname, "admin/admin-workspace.tsx")],
  ])("renders one accessible 0-10 score input per official game for %s", (_role, filename) => {
    const source = fs.readFileSync(filename, "utf8");
    expect(source).toContain("scoreGameNumbers");
    expect(source).toContain("score_${player.id}_${gameNumber}");
    expect(source).toMatch(/min=(?:\{0\}|"0")/);
    expect(source).toMatch(/max=(?:\{10\}|"10")/);
    expect(source).toMatch(/step=(?:\{0\.1\}|"0\.1")/);
  });

  it("routes captain and organizer payloads through the same parser", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../lib/actions.ts"), "utf8");
    expect(source.match(/parsePlayerStatForm\(formData/g)).toHaveLength(2);
  });
});
