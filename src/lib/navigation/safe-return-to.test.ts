import { describe, expect, it } from "vitest";

import { getSafeReturnTo } from "./safe-return-to";

describe("getSafeReturnTo", () => {
  it("accepts an event registration path with an optional locale", () => {
    expect(getSafeReturnTo("/events/mfl-season-3/register")).toBe("/events/mfl-season-3/register");
    expect(getSafeReturnTo("/id/events/mfl-season-3/register")).toBe("/id/events/mfl-season-3/register");
  });

  it("rejects external, protocol-relative, and unrelated paths", () => {
    expect(getSafeReturnTo("https://attacker.test/events/x/register")).toBeNull();
    expect(getSafeReturnTo("//attacker.test/events/x/register")).toBeNull();
    expect(getSafeReturnTo("/admin")).toBeNull();
    expect(getSafeReturnTo("/events/../admin/register")).toBeNull();
  });

  it("returns null for non-string or empty input", () => {
    expect(getSafeReturnTo(null)).toBeNull();
    expect(getSafeReturnTo("  ")).toBeNull();
  });
});
