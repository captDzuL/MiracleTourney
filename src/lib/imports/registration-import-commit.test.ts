import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("registration import commit contract", () => {
  const repository = readFileSync(join(process.cwd(), "src/lib/platform/repository.ts"), "utf8");

  it("blocks a batch containing validation errors and commits every candidate row", () => {
    expect(repository).toContain('item.status === "error"');
    expect(repository).toContain('item.status === "new" || item.status === "changed"');
    expect(repository).toContain("candidateItems.map");
  });

  it("persists canonical captain game identity on imported teams", () => {
    expect(repository).toContain("captainIgn: row.normalized.captainIgn");
    expect(repository).toContain("captainUid: row.normalized.captainUid");
    expect(repository).toContain("captainIsPlayer: row.normalized.captainIsPlayer");
  });
});
