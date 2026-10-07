export type CaptainEventLoginState =
  | { status: "idle" }
  | { status: "error"; code: "invalid" | "wrong_role" | "database" | "rate_limited" };

export function buildCaptainEventDestination(locale: "id" | "en", eventId: string) {
  return `/${locale}/captain?tab=registration&eventId=${encodeURIComponent(eventId)}`;
}
