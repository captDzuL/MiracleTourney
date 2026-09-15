import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
Object.assign(globalThis, { React });
const m = vi.hoisted(() => ({ auth: vi.fn(), context: vi.fn(), queue: vi.fn(), history: vi.fn(), payments: vi.fn(), qris: vi.fn(), access: vi.fn() }));
vi.mock("next-intl/server", () => ({ setRequestLocale: vi.fn(), getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/auth/session", () => ({ requireAnyRole: m.auth }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: () => true }));
vi.mock("@/i18n/redirect", () => ({ redirectToActiveLocale: (url: string) => { throw Error(url); } }));
vi.mock("next/navigation", () => ({ notFound: () => { throw Error("NOT_FOUND"); }, useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/platform/repository", () => ({ assertUserCanManageEvent: m.access, getRegistrationImportEventContext: m.context }));
vi.mock("@/lib/registration/organizer-workspace-read", () => ({ getEventRegistrationQueue: m.queue, getEventImportHistory: m.history, getEventPaymentReview: m.payments, getEventQris: m.qris }));
vi.mock("../../../../../admin/admin-workspace", () => ({ default: () => React.createElement("div", null, "Legacy global workspace") }));
vi.mock("@/components/v3/organizer/registration/RegistrationWorkspace", () => ({ RegistrationWorkspace: (props: object) => React.createElement("pre", null, JSON.stringify(props)) }));
import Page from "./page";
describe("event registration route", () => {
  beforeEach(() => { vi.clearAllMocks(); m.auth.mockResolvedValue({ id: "owner", role: "organizer" }); m.access.mockResolvedValue(undefined); m.context.mockResolvedValue({ id: "cup", participantCap: 16, teams: [] }); m.queue.mockResolvedValue({ items: [], total: 0, page: 2, totalPages: 2, pageSize: 25 }); m.history.mockResolvedValue([]); m.payments.mockResolvedValue([]); m.qris.mockResolvedValue({ version: 0 }); });
  it.each(["queue", "import", "payments", "qris"])("preserves URL filters in the focused %s view", async view => {
    const result = await Page({ params: Promise.resolve({ locale: "en", eventId: "cup" }), searchParams: Promise.resolve({ view, status: "pending_review", source: "import_csv", q: "Alpha", page: "2" }) });
    const html = renderToStaticMarkup(result);
    expect(html).not.toContain("Legacy global workspace");
    expect(html).toContain(`&quot;view&quot;:&quot;${view}&quot;`);
    expect(html).toContain("Alpha"); expect(html).toContain("import_csv");
  });
  it("rejects unauthenticated reads before querying event data", async () => { m.auth.mockResolvedValue(null); await expect(Page({ params: Promise.resolve({ locale: "en", eventId: "cup" }) })).rejects.toThrow("/login"); expect(m.context).not.toHaveBeenCalled(); });
  it.each([
    ["pending_payment", "pending_payment"], ["pending_review", "pending_review"],
    ["approved", "approved"], ["rejected", "rejected"], ["expired", "expired"],
    ["accepted", "approved"], ["needs_correction", "expired"], ["bogus", ""],
  ])("passes payment status %s to the reader as %s on refreshed URL requests", async (status, expected) => {
    m.payments.mockImplementation(async ({ status: selected }) => [{ id: "payment", status: selected ?? "pending_review" }]);
    const result = await Page({ params: Promise.resolve({ locale: "id", eventId: "cup" }), searchParams: Promise.resolve({ view: "payments", status, q: "Alpha", page: "2" }) });
    expect(m.payments).toHaveBeenCalledWith({ user: { id: "owner", role: "organizer" }, eventId: "cup", status: expected || undefined });
    expect(result.props.query).toEqual({ view: "payments", status: expected, q: "Alpha", source: "", page: 2 });
    expect(result.props.payments[0].status).toBe(expected || "pending_review");
  });
  it("checks ownership before loading any module", async () => { m.access.mockRejectedValue(Error("Not authorized")); await expect(Page({ params: Promise.resolve({ locale: "en", eventId: "cup" }) })).rejects.toThrow(); expect(m.queue).not.toHaveBeenCalled(); });
});
