import fs from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

describe("events page public cards", () => {
  test("renders visible event naming and media placeholders for MVP cards", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "./page.tsx"), "utf8");

    expect(source).toContain("{event.name}");
    expect(source).toContain("logo");
    expect(source).toContain("{game.name}");
    expect(source).not.toContain('className="mt-4 text-xl font-semibold text-white">{event.name}</h2>');
  });
});
