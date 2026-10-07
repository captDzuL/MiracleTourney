import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const workspace = fs.readFileSync(path.resolve(__dirname, "../../pnpm-workspace.yaml"), "utf8");
const lock = fs.readFileSync(path.resolve(__dirname, "../../pnpm-lock.yaml"), "utf8");

describe("security dependency overrides", () => {
  test("pins audited vulnerable packages to patched releases within their existing majors", () => {
    expect(workspace).toContain("brace-expansion: '5.0.12'");
    expect(workspace).toContain("undici@6: '6.28.1'");
    expect(lock).toContain("brace-expansion: 5.0.12");
    expect(lock).toContain("undici@6: 6.28.1");
    expect(lock).toContain("brace-expansion@5.0.12:");
    expect(lock).toContain("undici@6.28.1:");
    expect(lock).toContain("undici: 6.28.1");
  });
});
