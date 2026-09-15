import type { RegistrationSource, RegistrationStatus } from "@/lib/registration/records";
export const statuses = ["pending_payment", "pending_review", "accepted", "rejected", "draft", "needs_correction"] as const;
export const sources = ["captain_registration", "import_xlsx", "import_csv", "unknown_import"] as const;
export type RegistrationQuery = { view: "queue" | "import" | "payments" | "qris"; status: string; source: string; q: string; page: number };
export type QueryInput = Record<string, string | string[] | undefined>;
export function normalizeRegistrationQuery(raw: QueryInput = {}): RegistrationQuery {
  const one = (key: string) => typeof raw[key] === "string" ? raw[key] as string : "";
  const view = one("view");
  return { view: ["queue", "import", "payments", "qris"].includes(view) ? view as RegistrationQuery["view"] : "queue",
    status: [...statuses, "approved", "expired"].includes(one("status") as RegistrationStatus) ? one("status") : "",
    source: sources.includes(one("source") as RegistrationSource) ? one("source") : "", q: one("q").trim().slice(0, 200), page: Math.max(1, Number.parseInt(one("page"), 10) || 1) };
}
export function registrationHref(locale: string, eventId: string, query: RegistrationQuery, overrides: Partial<RegistrationQuery> = {}, participants = false) {
  const data = { ...query, ...overrides }; const params = new URLSearchParams();
  if (!participants) params.set("view", data.view);
  for (const key of ["status", "source", "q"] as const) if (data[key]) params.set(key, data[key]);
  params.set("page", String(data.page));
  return `/${locale}/organizer/events/${encodeURIComponent(eventId)}/${participants ? "participants" : "registration"}?${params}`;
}
