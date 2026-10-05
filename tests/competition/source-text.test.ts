import { describe, expect, it } from "vitest";
import { normalizeSourceText } from "./source-text";

describe("static source contract line endings", () => {
  it("treats LF and CRLF alike while preserving changed source text", () => {
    const original = "first\n  required();\nlast\n";
    expect(normalizeSourceText(original)).toBe(original);
    expect(normalizeSourceText(original.replaceAll("\n", "\r\n"))).toBe(original);
    expect(normalizeSourceText(original.replace("required()", "removed()"))).not.toBe(original);
  });
});
