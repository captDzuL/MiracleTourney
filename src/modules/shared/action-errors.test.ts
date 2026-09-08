import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ConflictError, ForbiddenError, NotFoundError, UnauthenticatedError } from "@/modules/identity";

import { mapActionError } from "./action-errors";

describe("shared action error mapping", () => {
  it("maps Zod validation errors to a serializable validation failure", () => {
    const parseResult = z.object({
      email: z.string().email(),
    }).safeParse({
      email: "not-an-email",
    });

    if (parseResult.success) {
      throw new Error("Expected schema parsing to fail for invalid email");
    }

    const failure = mapActionError(parseResult.error);

    expect(failure).toEqual({
      ok: false,
      code: "validation",
      message: "Validation failed.",
      fieldErrors: {
        email: ["Invalid email address"],
      },
    });
  });

  it("maps UnauthenticatedError", () => {
    expect(mapActionError(new UnauthenticatedError())).toEqual({
      ok: false,
      code: "unauthenticated",
      message: "Unauthenticated.",
    });
  });

  it("maps ForbiddenError", () => {
    expect(mapActionError(new ForbiddenError())).toEqual({
      ok: false,
      code: "forbidden",
      message: "Forbidden.",
    });
  });

  it("maps NotFoundError", () => {
    expect(mapActionError(new NotFoundError())).toEqual({
      ok: false,
      code: "not_found",
      message: "Not found.",
    });
  });

  it("maps ConflictError", () => {
    expect(mapActionError(new ConflictError())).toEqual({
      ok: false,
      code: "conflict",
      message: "Conflict.",
    });
  });

  it("rethrows unknown errors", () => {
    const unknown = new Error("database is down");

    expect(() => mapActionError(unknown)).toThrow("database is down");
  });
});
