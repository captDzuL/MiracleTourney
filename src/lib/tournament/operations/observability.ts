import { writeServerLog } from "@/lib/observability/logger";
import { isCompetitionExpectedError } from "./errors";

export type CompetitionFailureCode = "transaction_timeout" | "internal_error" | "conflict" | "unauthorized";
export type OperationStageErrorCode = CompetitionFailureCode | "serialization_conflict";

export type OperationStageEvent = Readonly<{
  phase: "start" | "done" | "failed";
  stage: string;
  durationMs: number;
  counts?: Readonly<Record<string, number>>;
  errorCode?: OperationStageErrorCode;
  terminal?: "retry" | "failed";
}>;

export type OperationStageReporter = (event: OperationStageEvent) => void;

export type OperationObservabilityOptions = Readonly<{
  requestId?: string;
  logOperation?: string;
  logRoute?: string;
  onStage?: OperationStageReporter;
}>;

type ErrorLike = { message?: unknown; cause?: unknown; meta?: unknown };

/** Recognizes only the provider's explicit serialization-conflict code. */
export function isCompetitionSerializationConflict(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error
    && (error as { code?: unknown }).code === "P2034";
}

/** Classifies storage failures without exposing provider messages to callers. */
export function classifyCompetitionFailure(error: unknown): CompetitionFailureCode {
  if (isCompetitionExpectedError(error) && (error.code === "conflict" || error.code === "unauthorized")) {
    return error.code;
  }
  if (isTransactionTimeout(error)) return "transaction_timeout";
  return "internal_error";
}

function isTransactionTimeout(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as ErrorLike;
  return hasTransactionTimeoutEvidence(candidate.message)
    || hasTransactionTimeoutEvidence(candidate.meta)
    || hasTransactionTimeoutEvidence(candidate.cause);
}

function hasTransactionTimeoutEvidence(value: unknown, depth = 0, seen = new Set<object>()): boolean {
  if (typeof value === "string") {
    return /(?:interactive\s+)?transaction[\s\S]*(?:timed\s+out|timeout|expired|given\s+time)|(?:timed\s+out|timeout|expired|given\s+time)[\s\S]*transaction/i.test(value);
  }
  if (!value || typeof value !== "object" || depth >= 3 || seen.has(value)) return false;
  seen.add(value);
  const candidate = value as ErrorLike;
  return hasTransactionTimeoutEvidence(candidate.message, depth + 1, seen)
    || hasTransactionTimeoutEvidence(candidate.meta, depth + 1, seen)
    || hasTransactionTimeoutEvidence(candidate.cause, depth + 1, seen)
    || hasTransactionTimeoutEvidence((value as { error?: unknown }).error, depth + 1, seen);
}

export function makeOperationStageReporter(options: OperationObservabilityOptions): OperationStageReporter | undefined {
  if (options.onStage) return options.onStage;
  if (!options.requestId) return undefined;
  const operation = options.logOperation ?? "competition_execute";
  const route = options.logRoute ?? "/server-actions/competition/execute";
  return (event) => {
    writeServerLog({
      phase: event.phase,
      operation,
      route,
      requestId: options.requestId!,
      durationMs: event.durationMs,
      status: event.phase === "start" ? 0 : event.phase === "done" ? 200 : 500,
      ...(event.errorCode ? { errorCode: event.errorCode } : {}),
      ...(event.terminal ? { terminal: event.terminal } : {}),
      stage: event.stage,
      ...(event.counts ? { counts: event.counts } : {}),
    });
  };
}

export function reportOperationStage(reporter: OperationStageReporter | undefined, event: OperationStageEvent): void {
  if (!reporter) return;
  try {
    reporter(event);
  } catch {
    // Observability must never change the transaction's product behavior.
  }
}

export async function withOperationStage<T>(
  reporter: OperationStageReporter | undefined,
  stage: string,
  counts: Readonly<Record<string, number>> | undefined,
  work: () => Promise<T> | T,
): Promise<T> {
  const startedAt = Date.now();
  reportOperationStage(reporter, { phase: "start", stage, durationMs: 0, ...(counts ? { counts } : {}) });
  try {
    const result = await work();
    reportOperationStage(reporter, { phase: "done", stage, durationMs: Date.now() - startedAt, ...(counts ? { counts } : {}) });
    return result;
  } catch (error) {
    reportOperationStage(reporter, {
      phase: "failed",
      stage,
      durationMs: Date.now() - startedAt,
      ...(counts ? { counts } : {}),
      errorCode: classifyCompetitionFailure(error),
      terminal: "failed",
    });
    throw error;
  }
}
