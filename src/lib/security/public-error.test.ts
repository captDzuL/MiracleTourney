import { describe, expect, it } from "vitest";

import { toSafeActionMessage } from "./public-error";

describe("toSafeActionMessage", () => {
  it.each([
    "Email ini sudah terdaftar. Coba login.",
    "Roster tim sudah terkunci setelah drawing dipublikasikan atau turnamen berjalan.",
    "Event ini membutuhkan verifikasi pembayaran sebelum tim aktif.",
  ])("keeps the allowed message %j", (message) => {
    expect(toSafeActionMessage(new Error(message), "Gagal.")).toBe(message);
  });

  it("replaces an unknown message with the fallback so internal details do not leak", () => {
    expect(toSafeActionMessage(new Error("Unique constraint failed on the fields: (`email`)"), "Gagal membuat akun.")).toBe(
      "Gagal membuat akun.",
    );
  });

  it("uses the fallback for values that are not errors", () => {
    expect(toSafeActionMessage("Email ini sudah terdaftar. Coba login.", "Gagal.")).toBe("Gagal.");
    expect(toSafeActionMessage(undefined, "Gagal.")).toBe("Gagal.");
  });
});
