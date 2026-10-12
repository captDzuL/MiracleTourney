import { describe, expect, it } from "vitest";

import { UserFacingError, describeActionError, isUserSafeActionError, toSafeActionMessage } from "./public-error";

describe("toSafeActionMessage", () => {
  it("passes the message of a UserFacingError through to the user", () => {
    const error = new UserFacingError("Slot pendaftaran event ini sudah penuh.");

    expect(toSafeActionMessage(error, "Gagal mendaftarkan tim.")).toBe("Slot pendaftaran event ini sudah penuh.");
  });

  it("masks a plain Error that is not on the allowlist", () => {
    const error = new Error("Slot pendaftaran event ini sudah penuh.");

    expect(toSafeActionMessage(error, "Gagal mendaftarkan tim.")).toBe("Gagal mendaftarkan tim.");
  });

  it("keeps allowlisted plain messages", () => {
    expect(toSafeActionMessage(new Error("Not authorized"), "fallback")).toBe("Not authorized");
  });

  it("masks non-Error throwables", () => {
    expect(toSafeActionMessage("boom", "Gagal mendaftarkan tim.")).toBe("Gagal mendaftarkan tim.");
  });
});

describe("describeActionError", () => {
  it("reports only the name and Prisma code of an unexpected error", () => {
    const error = Object.assign(new Error("Transaction API error"), { name: "PrismaClientKnownRequestError", code: "P2028" });

    expect(describeActionError(error)).toEqual({ name: "PrismaClientKnownRequestError", code: "P2028" });
  });

  it("never includes the error message, which can carry team names or contacts", () => {
    const error = new Error("Invalid prisma.team.create() invocation: { captainContact: '0812-secret' }");

    expect(JSON.stringify(describeActionError(error))).not.toContain("secret");
  });

  it("describes a non-Error throwable without leaking its value", () => {
    expect(describeActionError({ secret: "value" })).toEqual({ name: "NonError", code: undefined });
  });
});

describe("isUserSafeActionError", () => {
  it("accepts user-facing and allowlisted errors but not unexpected ones", () => {
    expect(isUserSafeActionError(new UserFacingError("Slot pendaftaran event ini sudah penuh."))).toBe(true);
    expect(isUserSafeActionError(new Error("Not authorized"))).toBe(true);
    expect(isUserSafeActionError(new Error("connection reset"))).toBe(false);
    expect(isUserSafeActionError("boom")).toBe(false);
  });
});
