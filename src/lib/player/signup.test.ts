import { describe, expect, it } from "vitest";

import { emailConflictMessage, parsePlayerSignUp } from "./signup";

const valid = {
  fullName: "Bima Kartika",
  email: "Bima@Example.com ",
  password: "password123",
  whatsapp: "0812-3456-7890",
};

describe("parsePlayerSignUp", () => {
  it("normalizes a valid sign-up", () => {
    expect(parsePlayerSignUp(valid)).toEqual({
      ok: true,
      data: {
        fullName: "Bima Kartika",
        email: "bima@example.com",
        password: "password123",
        whatsapp: "6281234567890",
      },
    });
  });

  it("rejects a name shorter than 2 characters", () => {
    expect(parsePlayerSignUp({ ...valid, fullName: " A " })).toEqual({ ok: false, message: "Nama lengkap minimal 2 karakter." });
  });

  it("rejects an invalid email", () => {
    expect(parsePlayerSignUp({ ...valid, email: "bima" })).toEqual({ ok: false, message: "Format email tidak valid." });
  });

  it("rejects a password shorter than 8 characters", () => {
    expect(parsePlayerSignUp({ ...valid, password: "short" })).toEqual({ ok: false, message: "Password minimal 8 karakter." });
  });

  it("rejects an invalid WhatsApp number", () => {
    expect(parsePlayerSignUp({ ...valid, whatsapp: "123" })).toEqual({ ok: false, message: "Nomor WhatsApp tidak valid." });
  });

  it("reports the first problem in form order", () => {
    expect(parsePlayerSignUp({ fullName: "", email: "x", password: "", whatsapp: "" })).toEqual({
      ok: false,
      message: "Nama lengkap minimal 2 karakter.",
    });
  });

  it("rejects an oversized password before it reaches the hash function", () => {
    expect(parsePlayerSignUp({ ...valid, password: "a".repeat(200) })).toEqual({ ok: false, message: "Password terlalu panjang." });
  });
});

describe("emailConflictMessage", () => {
  it("tells the person which role already uses the email", () => {
    expect(emailConflictMessage("captain", "player")).toBe("Email ini sudah dipakai sebagai kapten.");
    expect(emailConflictMessage("player", "captain")).toBe("Email ini sudah dipakai sebagai pemain.");
  });

  it("asks to sign in when the email already has the same role", () => {
    expect(emailConflictMessage("player", "player")).toBe("Email ini sudah terdaftar. Coba login.");
    expect(emailConflictMessage("captain", "captain")).toBe("Email ini sudah terdaftar. Coba login.");
  });

  it("does not reveal organizer or admin accounts", () => {
    for (const role of ["organizer", "admin", "platform_admin"] as const) {
      expect(emailConflictMessage(role, "player")).toBe("Email ini sudah terdaftar. Coba login.");
      expect(emailConflictMessage(role, "captain")).toBe("Email ini sudah terdaftar. Coba login.");
    }
  });
});
