import { describe, expect, it } from "vitest";

import { formatDeadline, soloCopy, successNotice } from "./registration-copy";

describe("soloCopy", () => {
  const keys = (locale: "id" | "en") => Object.keys(soloCopy(locale)).sort();

  it("has the same entries in Indonesian and English", () => {
    expect(keys("id")).toEqual(keys("en"));
    expect(keys("id").length).toBeGreaterThan(30);
  });

  it("has text for every entry, and functions return text for sample input", () => {
    for (const locale of ["id", "en"] as const) {
      for (const [name, value] of Object.entries(soloCopy(locale))) {
        const text = typeof value === "function" ? (value as (...args: unknown[]) => string)(2, "Kiper", "Rp25.000", "14 Oktober") : value;
        expect(typeof text, `${locale}.${name}`).toBe("string");
        expect((text as string).trim().length, `${locale}.${name}`).toBeGreaterThan(0);
        expect(text as string, `${locale}.${name}`).not.toMatch(/undefined|\[object|NaN/);
      }
    }
  });

  it("uses the agreed words in Indonesian", () => {
    const copy = soloCopy("id");
    expect(copy.submit).toBe("Daftar solo");
    expect(copy.withdraw).toBe("Batalkan pendaftaran");
    const text = JSON.stringify(Object.values(copy).map((value) => (typeof value === "function" ? (value as (...a: unknown[]) => string)(1, "Kiper", "Rp1", "x") : value)));
    expect(text).not.toMatch(/registrasi|waitlist|daftar tunggu/i);
  });
});

describe("successNotice", () => {
  it.each(["approved", "pending_payment", "queued", "payment-proof-uploaded", "withdrawn", "withdrawn-refund"])("knows %s", (code) => {
    for (const locale of ["id", "en"] as const) expect(successNotice(code, locale)).toEqual(expect.any(String));
  });

  it("ignores anything else, so a made-up link cannot print its own message", () => {
    expect(successNotice("<script>alert(1)</script>", "id")).toBeNull();
    expect(successNotice(undefined, "id")).toBeNull();
    expect(successNotice("", "en")).toBeNull();
  });
});

describe("formatDeadline", () => {
  const date = new Date("2026-10-14T03:30:00Z");

  it("writes Jakarta time in the reader's language", () => {
    expect(formatDeadline(date, "id")).toBe("14 Oktober 2026, 10.30 WIB");
    expect(formatDeadline(date, "en")).toMatch(/^14 October 2026, 10[:.]30 WIB$/);
  });

  it("shows a dash when there is no deadline", () => {
    expect(formatDeadline(null, "id")).toBe("—");
  });
});
