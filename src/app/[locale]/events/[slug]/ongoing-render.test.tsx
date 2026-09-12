import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
const boundary = vi.hoisted(() => ({ status: "Ongoing", adaptive: true, operations: true, fail: false }));
vi.stubGlobal("React", React);
vi.mock("next-intl/server", () => ({ setRequestLocale: () => {}, getTranslations: async () => () => "" }));
vi.mock("@/lib/auth/session", () => ({ getSessionUser: async () => null }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: (flag: string) => flag === "competition_operations_v3" ? boundary.operations : boundary.adaptive }));
vi.mock("@/lib/platform/repository", () => ({ getPublicEventBySlug: async () => ({ id: "e", status: boundary.status, name: "Cup" }), getPublicEventSlugRedirect: async () => null }));
vi.mock("../../../events/[slug]/event-detail-page", () => ({ renderEventDetailPage: () => "legacy" }));
vi.mock("@/lib/events/adaptive-public-event", () => ({ getAdaptivePublicEventViewWithRetry: async () => null, shouldUseAdaptiveRegistrationRenderer: () => false }));
vi.mock("@/lib/events/public-ongoing", () => ({ getPublicOngoingEvent: async () => { if (boundary.fail) throw Error("offline"); return { mode: "ongoing", event: { name: "Cup" } }; }, publicOngoingEnabled: () => boundary.operations && boundary.adaptive }));
import Page from "./page";
import { AdaptiveOngoingEventPage } from "@/components/v3/public-event/AdaptiveOngoingEventPage";
beforeEach(() => { boundary.status = "Ongoing"; boundary.adaptive = true; boundary.operations = true; boundary.fail = false; });
it("selects ongoing only with both flags on the canonical localized route", async () => {
  const result = await Page({ params: Promise.resolve({ slug: "cup", locale: "id" }) });
  expect(React.isValidElement(result) && result.type).toBe(AdaptiveOngoingEventPage);
});
it.each(["adaptive", "operations", "finished", "failure"])("keeps legacy fallback for %s", async reason => {
  if (reason === "adaptive") boundary.adaptive = false; if (reason === "operations") boundary.operations = false;
  if (reason === "finished") boundary.status = "Finished"; if (reason === "failure") boundary.fail = true;
  expect(await Page({ params: Promise.resolve({ slug: "cup", locale: "en" }) })).toBe("legacy");
});
