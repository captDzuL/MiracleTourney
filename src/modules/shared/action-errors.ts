import { ZodError } from "zod";

import { ConflictError, ForbiddenError, NotFoundError, UnauthenticatedError } from "@/modules/identity";

export type ActionFailureCode =
  | "validation"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict";

export type ActionFailure = {
  ok: false;
  code: ActionFailureCode;
  message: string;
  fieldErrors?: Record<string, string[]>;
};

function toFieldErrors(error: ZodError): Record<string, string[]> {
  const flattened = error.flatten().fieldErrors;
  const fieldErrors = Object.fromEntries(
    Object.entries(flattened)
      .filter((entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].length > 0),
  );

  return fieldErrors;
}

export function mapActionError(error: unknown): ActionFailure {
  if (error instanceof ZodError) {
    return {
      ok: false,
      code: "validation",
      message: "Validation failed.",
      fieldErrors: toFieldErrors(error),
    };
  }

  if (error instanceof UnauthenticatedError) {
    return {
      ok: false,
      code: "unauthenticated",
      message: "Unauthenticated.",
    };
  }

  if (error instanceof ForbiddenError) {
    return {
      ok: false,
      code: "forbidden",
      message: "Forbidden.",
    };
  }

  if (error instanceof NotFoundError) {
    return {
      ok: false,
      code: "not_found",
      message: "Not found.",
    };
  }

  if (error instanceof ConflictError) {
    return {
      ok: false,
      code: "conflict",
      message: "Conflict.",
    };
  }

  throw error;
}
