import { describe, expect, it } from "vitest";

import { ConflictError, ForbiddenError, NotFoundError, UnauthenticatedError } from "./errors";

describe("identity typed errors", () => {
  it("exposes stable names and extends Error", () => {
    const errors = [
      new UnauthenticatedError(),
      new ForbiddenError(),
      new NotFoundError(),
      new ConflictError(),
    ];

    expect(errors[0]).toBeInstanceOf(Error);
    expect(errors[0].name).toBe("UnauthenticatedError");
    expect(errors[1].name).toBe("ForbiddenError");
    expect(errors[2].name).toBe("NotFoundError");
    expect(errors[3].name).toBe("ConflictError");
  });
});
