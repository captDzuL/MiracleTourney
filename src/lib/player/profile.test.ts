import { describe, expect, it } from "vitest";

import { normalizeWhatsapp } from "./profile";

describe("normalizeWhatsapp", () => {
  it.each([
    ["081234567890", "6281234567890"],
    ["0812-3456-7890", "6281234567890"],
    ["0812 3456 7890", "6281234567890"],
    ["+62 812 3456 7890", "6281234567890"],
    ["+6281234567890", "6281234567890"],
    ["6281234567890", "6281234567890"],
    ["(0812) 3456-7890", "6281234567890"],
    ["  081234567890  ", "6281234567890"],
  ])("turns %s into %s", (input, expected) => {
    expect(normalizeWhatsapp(input)).toBe(expected);
  });

  it.each([
    "",
    "   ",
    "abc",
    "0812 3456 78a0",
    "81234567890",
    "0812",
    "08123456789012345678",
    "+1 415 555 0100",
    "0812345678901234",
    "62",
  ])("rejects %j", (input) => {
    expect(normalizeWhatsapp(input)).toBeNull();
  });

  it("is stable when normalized twice", () => {
    const once = normalizeWhatsapp("0812-3456-7890")!;
    expect(normalizeWhatsapp(once)).toBe(once);
  });
});
