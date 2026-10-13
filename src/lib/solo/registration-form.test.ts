import { describe, expect, it } from "vitest";

import { parseSoloRegistrationForm } from "./registration-form";

const valid = {
  eventId: "event_1-A",
  ign: "  BimaK  ",
  uid: " 12345678 ",
  primaryPosition: "Goalkeeper",
  secondaryPosition: "Forward",
  willingCaptain: "on",
  whatsapp: "0812-3456-7890",
  shareContact: "on",
};

describe("parseSoloRegistrationForm", () => {
  it("cleans a complete form", () => {
    expect(parseSoloRegistrationForm(valid)).toEqual({
      ok: true,
      data: {
        eventId: "event_1-A",
        ign: "BimaK",
        uid: "12345678",
        primaryPosition: "Goalkeeper",
        secondaryPosition: "Forward",
        willingCaptain: true,
        whatsapp: "6281234567890",
      },
    });
  });

  it("treats an unticked captain box and a blank backup position as none", () => {
    const result = parseSoloRegistrationForm({ ...valid, willingCaptain: undefined, secondaryPosition: "" });
    expect(result).toMatchObject({ ok: true, data: { willingCaptain: false, secondaryPosition: null } });
  });

  it.each([
    [{ eventId: "https://evil.example" }, "Event tidak valid."],
    [{ eventId: "" }, "Event tidak valid."],
    [{ ign: "A" }, "IGN minimal 2 karakter."],
    [{ ign: "x".repeat(41) }, "IGN maksimal 40 karakter."],
    [{ uid: "1" }, "UID minimal 2 karakter."],
    [{ uid: "9".repeat(41) }, "UID maksimal 40 karakter."],
    [{ primaryPosition: "" }, "Posisi utama wajib dipilih."],
    [{ whatsapp: "123" }, "Nomor WhatsApp tidak valid."],
    [{ shareContact: undefined }, "Centang izin berbagi WhatsApp ke teman satu tim."],
    [{ shareContact: "off" }, "Centang izin berbagi WhatsApp ke teman satu tim."],
  ])("refuses %j with a clear message", (override, message) => {
    expect(parseSoloRegistrationForm({ ...valid, ...override })).toEqual({ ok: false, message });
  });

  it("reports problems in the order the form shows its fields", () => {
    expect(parseSoloRegistrationForm({ ...valid, ign: "", uid: "", whatsapp: "", shareContact: undefined })).toEqual({
      ok: false,
      message: "IGN minimal 2 karakter.",
    });
  });

  it("refuses control characters in names", () => {
    expect(parseSoloRegistrationForm({ ...valid, ign: "Bima\u0000K" })).toEqual({ ok: false, message: "IGN tidak boleh berisi karakter kontrol." });
  });

  it("accepts the values a browser form really sends", () => {
    const data = new FormData();
    for (const [key, value] of Object.entries(valid)) if (value !== undefined) data.set(key, value);
    expect(parseSoloRegistrationForm(Object.fromEntries(data) as Record<string, string>).ok).toBe(true);
  });
});
