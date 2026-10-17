import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
Object.assign(globalThis, { React });
const m = vi.hoisted(() => ({ auth: vi.fn(), context: vi.fn(), queue: vi.fn(), history: vi.fn(), payments: vi.fn(), qris: vi.fn(), access: vi.fn(), soloSummary: vi.fn(), soloRecords: vi.fn(), soloPayments: vi.fn(), soloPanel: vi.fn() }));
vi.mock("next-intl/server", () => ({ setRequestLocale: vi.fn(), getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/auth/session", () => ({ requireAnyRole: m.auth }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: () => true }));
vi.mock("@/i18n/redirect", () => ({ redirectToActiveLocale: (url: string) => { throw Error(url); } }));
vi.mock("next/navigation", () => ({ notFound: () => { throw Error("NOT_FOUND"); }, useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/imports/repository", () => ({
  getRegistrationImportEventContext: m.context,
}));
vi.mock("@/lib/platform/shared/authz", () => ({
  assertUserCanManageEvent: m.access,
}));
vi.mock("@/lib/registration/organizer-workspace-read", () => ({ getEventRegistrationQueue: m.queue, getEventImportHistory: m.history, getEventPaymentReview: m.payments, getEventQris: m.qris }));
vi.mock("@/lib/solo/organizer-read", () => ({ getSoloEventSummary: m.soloSummary, listSoloRegistrationRecords: m.soloRecords, listSoloPaymentEntries: m.soloPayments, getSoloDrawPanelData: m.soloPanel }));
vi.mock("../../../../../admin/admin-workspace", () => ({ default: () => React.createElement("div", null, "Legacy global workspace") }));
vi.mock("@/components/v3/organizer/registration/RegistrationWorkspace", () => ({ RegistrationWorkspace: (props: object) => React.createElement("pre", null, JSON.stringify(props)) }));
import Page from "./page";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => { resolve = resolvePromise; });
  return { promise, resolve };
}

type InfoSpy = { mock: { calls: unknown[][] } };

function routeStages(info: InfoSpy) {
  return info.mock.calls
    .map((call: unknown[]) => JSON.parse(String(call[0])) as Record<string, unknown>)
    .filter((record: Record<string, unknown>) => typeof record.stage === "string")
    .map((record: Record<string, unknown>) => record.stage);
}

describe("event registration route", () => {
  beforeEach(() => { vi.clearAllMocks(); m.auth.mockResolvedValue({ id: "owner", role: "organizer" }); m.access.mockResolvedValue(undefined); m.context.mockResolvedValue({ id: "cup", participantCap: 16, teams: [] }); m.queue.mockResolvedValue({ items: [], total: 0, page: 2, totalPages: 2, pageSize: 25 }); m.history.mockResolvedValue([]); m.payments.mockResolvedValue([]); m.qris.mockResolvedValue({ version: 0 }); m.soloSummary.mockResolvedValue(null); });
  it.each(["queue", "import", "payments", "qris"])("preserves URL filters in the focused %s view", async view => {
    const result = await Page({ params: Promise.resolve({ locale: "en", eventId: "cup" }), searchParams: Promise.resolve({ view, status: "pending_review", source: "import_csv", q: "Alpha", page: "2" }) });
    const html = renderToStaticMarkup(result);
    expect(html).not.toContain("Legacy global workspace");
    expect(html).toContain(`&quot;view&quot;:&quot;${view}&quot;`);
    expect(html).toContain("Alpha"); expect(html).toContain("import_csv");
  });
  describe("a solo event", () => {
    const summary = { eventId: "cup", status: "Registration Closed", participantCap: 16, feeRequired: false, competitionVersion: 3, teamsLocked: false, requiredPosition: "Goalkeeper", quota: {} };
    const record = (id: string, ign: string) => ({ id, eventId: "cup", teamName: ign, teamTag: "Forward", captainName: `UID-${ign}`, captainIsPlayer: true, rosterCount: 1, source: "solo_registration", status: "queued", createdAt: new Date("2026-10-13T00:00:00Z"), origin: "solo", solo: { registrationId: id, version: 1, secondaryPosition: null } });
    const render = async (searchParams: Record<string, string>) => Page({ params: Promise.resolve({ locale: "id", eventId: "cup" }), searchParams: Promise.resolve(searchParams) });
    beforeEach(() => { m.soloSummary.mockResolvedValue(summary); m.soloRecords.mockResolvedValue([record("r1", "Bima"), record("r2", "Sari")]); m.soloPayments.mockResolvedValue([{ id: "r1", status: "pending_review" }]); m.soloPanel.mockResolvedValue({ preview: null, draw: null }); });

    it("lists its players instead of teams, and filters them like teams", async () => {
      const result = await render({ view: "queue", q: "bima" });
      expect(m.queue).not.toHaveBeenCalled();
      expect(result.props.solo.summary).toBe(summary);
      expect(result.props.queue.items.map((item: { id: string }) => item.id)).toEqual(["r1"]);
      expect(result.props.teams).toEqual([]);
    });

    it("reviews solo payments with the same status filter", async () => {
      const result = await render({ view: "payments", status: "accepted" });
      expect(m.payments).not.toHaveBeenCalled();
      expect(m.soloPayments).toHaveBeenCalledWith({ id: "owner", role: "organizer" }, "cup", "approved");
      expect(result.props.payments).toHaveLength(1);
      expect(result.props.solo.summary).toBe(summary);
    });

    it("opens the draw tab with the panel data, and has no spreadsheet import", async () => {
      const result = await render({ view: "draw" });
      expect(m.soloPanel).toHaveBeenCalledWith({ user: { id: "owner", role: "organizer" }, eventId: "cup", status: "Registration Closed" });
      expect(result.props.query.view).toBe("draw");
      expect(result.props.solo.draw).toEqual({ preview: null, draw: null });

      const imported = await render({ view: "import" });
      expect(m.history).not.toHaveBeenCalled();
      expect(imported.props.query.view).toBe("queue");
      expect(imported.props.queue.items).toHaveLength(2);
    });
  });

  it("does not offer the draw tab for a team event", async () => {
    const result = await Page({ params: Promise.resolve({ locale: "id", eventId: "cup" }), searchParams: Promise.resolve({ view: "draw" }) });
    expect(m.soloPanel).not.toHaveBeenCalled();
    expect(result.props.query.view).toBe("queue");
    expect(result.props.solo).toBeUndefined();
    expect(m.queue).toHaveBeenCalled();
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

  it("emits a terminal failed route milestone when ownership resolution rejects", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    m.access.mockRejectedValue(new Error("database secret@example.test"));

    await expect(Page({ params: Promise.resolve({ locale: "en", eventId: "cup" }) })).rejects.toThrow("database secret@example.test");
    const failedRoute = info.mock.calls
      .map((call: unknown[]) => JSON.parse(String(call[0])) as Record<string, unknown>)
      .find((record: Record<string, unknown>) => record.stage === "route_return");
    expect(failedRoute).toMatchObject({ phase: "failed", terminal: "failed", status: 500 });
    expect(JSON.stringify(info.mock.calls)).not.toContain("secret@example.test");
  });

  it("preserves the fallback render when event context resolution rejects", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    m.context.mockRejectedValue(new Error("database context-secret@example.test"));

    const result = await Page({ params: Promise.resolve({ locale: "en", eventId: "cup" }) });
    const html = renderToStaticMarkup(result);
    expect(html).toContain("&quot;error&quot;:true");
    const failedRoute = info.mock.calls
      .map((call: unknown[]) => JSON.parse(String(call[0])) as Record<string, unknown>)
      .find((record: Record<string, unknown>) => record.stage === "route_return");
    expect(failedRoute).toMatchObject({ phase: "failed", terminal: "failed", status: 500 });
    expect(JSON.stringify(info.mock.calls)).not.toContain("context-secret@example.test");
  });

  it("preserves the import fallback render when history resolution rejects", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    m.history.mockRejectedValue(new Error("database history-secret@example.test"));

    const result = await Page({
      params: Promise.resolve({ locale: "en", eventId: "cup" }),
      searchParams: Promise.resolve({ view: "import" }),
    });
    const html = renderToStaticMarkup(result);
    expect(html).toContain("&quot;error&quot;:true");
    const failedRoute = info.mock.calls
      .map((call: unknown[]) => JSON.parse(String(call[0])) as Record<string, unknown>)
      .find((record: Record<string, unknown>) => record.stage === "route_return");
    expect(failedRoute).toMatchObject({ phase: "failed", terminal: "failed", status: 500 });
    expect(JSON.stringify(info.mock.calls)).not.toContain("history-secret@example.test");
  });

  it("does not return the import route before history resolves", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const history = deferred<never[]>();
    m.history.mockReturnValue(history.promise);

    const route = Page({
      params: Promise.resolve({ locale: "en", eventId: "cup" }),
      searchParams: Promise.resolve({ view: "import" }),
    });

    await vi.waitFor(() => expect(m.context).toHaveBeenCalled());
    expect(routeStages(info)).toEqual(expect.arrayContaining(["route_enter", "route_context_done"]));
    expect(routeStages(info)).not.toContain("route_history_done");
    expect(routeStages(info)).not.toContain("route_return");

    history.resolve([]);
    await route;
    expect(routeStages(info)).toEqual(expect.arrayContaining(["route_history_done", "route_return"]));
  });
});
