/** Request-local, allowlisted diagnostics for the guarded homepage-only pressure lane. */
export const FEATURED_TRACE_STAGES = [
  "reader_await", "identity_check", "reader_start", "transaction_start", "transaction_enter",
  "event_read_start", "event_read_done", "revision_read_start", "revision_read_done",
  "projection_start", "projection_done", "callback_done", "transaction_done",
  "transaction_after_callback", "fallback_start", "fallback_done", "reader_done",
] as const;

export type FeaturedTraceStage = typeof FEATURED_TRACE_STAGES[number];
const stages = new Set<string>(FEATURED_TRACE_STAGES);

type FeaturedErrorClass = "transaction_error" | "pool_timeout" | "connection_error" | "transaction_conflict" | "validation_error" | "projection_error" | "unknown_error";

function classify(error: unknown, stage: FeaturedTraceStage): FeaturedErrorClass {
  try {
    const value = error !== null && typeof error === "object" ? error as Record<string, unknown> : null;
    switch (value?.code) {
      case "P2028": return "transaction_error";
      case "P2024": return "pool_timeout";
      case "P1001": case "P1002": case "P1017": return "connection_error";
      case "P2034": return "transaction_conflict";
    }
    if (error instanceof TypeError) return stage === "projection_start" || stage === "identity_check" ? "projection_error" : "validation_error";
    if (value?.name === "PrismaClientValidationError") return "validation_error";
  } catch { /* hostile error properties must never affect the original failure */ }
  return "unknown_error";
}

export function createFeaturedTrace() {
  const enabled = process.env.PUBLIC_V3_HOME_DISCOVERY_TRACE === "1";
  const started = enabled ? performance.now() : 0;
  let stage: FeaturedTraceStage = "reader_start";
  const emit = (line: string) => {
    if (!enabled) return;
    try { console.info(line); } catch { /* diagnostics must not change the request outcome */ }
  };
  const elapsed = () => {
    try { return Math.min(99_999, Math.max(0, Math.round(performance.now() - started))) || 0; }
    catch { return 0; }
  };
  return {
    mark(next: FeaturedTraceStage) {
      if (!stages.has(next)) return;
      stage = next;
      if (enabled) emit(`[public-v3-featured] stage=${next} ms=${elapsed()}`);
    },
    fail<T>(error: T): T {
      if (enabled) {
        const failedAt = stage === "callback_done" ? "transaction_after_callback" : stage;
        const errorClass = classify(error, failedAt);
        emit(`[public-v3-featured] failure stage=${failedAt} class=${errorClass} ms=${elapsed()}`);
      }
      return error;
    },
  };
}
