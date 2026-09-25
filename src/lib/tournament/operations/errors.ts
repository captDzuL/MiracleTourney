export type CompetitionExpectedErrorCode =
  | "unauthorized"
  | "conflict"
  | "unavailable"
  | "password_change_required";

/** Domain failures that are safe for an action boundary to classify explicitly. */
export class CompetitionExpectedError extends Error {
  readonly code: CompetitionExpectedErrorCode;

  constructor(code: CompetitionExpectedErrorCode, message: string) {
    super(message);
    this.name = "CompetitionExpectedError";
    this.code = code;
  }
}

export function isCompetitionExpectedError(error: unknown): error is CompetitionExpectedError {
  return error instanceof CompetitionExpectedError;
}
