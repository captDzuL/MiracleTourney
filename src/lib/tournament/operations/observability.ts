import { writeServerLog } from "@/lib/observability/logger";

export type CompetitionFailureCode = "transaction_timeout" | "internal_error";

export type OperationStageEvent = Readonly<{
  phase: "start" | "done" | "failed";
  stage: string;
  durationMs: number;
  counts?: Readonly<Record<string, number>>;
  errorCode?: CompetitionFailureCode;
}>;

export type OperationStageReporter = (event: OperationStageEvent) => void;

export type OperationObservabilityOptions = Readonly<{
  requestId?: string;
  logOperation?: string;
  logRoute?: string;
  onStage?: OperationStageReporter;
}>;

type ErrorLike = { code?: unknown; message?: unknown };

/** Classifies storage failures without exposing provider messages to callers. */
export function classifyCompetitionFailure(error: unknown): CompetitionFailureCode {
  if (isTransactionTimeout(error)) return "transaction_timeout";
  return "internal_error";
}

function isTransactionTimeout(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as ErrorLike;
  if (candidate.code === "P2028") return true;
  if (typeof candidate.message !== "string") return false;
  return /(?:interactive\s+)?transaction[\s\S]*(?:timed\s+out|timeout|expired|already\s+closed)|(?:timed\s+out|timeout|expired|already\s+closed)[\s\S]*transaction/i.test(candidate.message);
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
    });
    throw error;
  }
}
