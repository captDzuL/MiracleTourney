// @vitest-environment jsdom
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

Object.assign(globalThis, { React });

const { requireAnyRole, getManageableEventDraft, isFeatureEnabled, notFound, redirectToActiveLocale } = vi.hoisted(() => ({
  requireAnyRole: vi.fn(),
  getManageableEventDraft: vi.fn(),
  isFeatureEnabled: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }),
  redirectToActiveLocale: vi.fn(() => { throw new Error("REDIRECT"); }),
}));

vi.mock("@/lib/auth/session", () => ({ requireAnyRole }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled }));
vi.mock("@/lib/platform/repository", () => ({ getManageableEventDraft }));
vi.mock("@/i18n/redirect", () => ({ redirectToActiveLocale }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ children, href, locale }: { children: React.ReactNode; href: string; locale?: string }) => <a href={locale ? `/${locale}${href}` : href}>{children}</a> }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/components/v3/events/EventDraftForm", () => ({
  EventDraftForm: ({ eventId, initialRevision }: { eventId: string; initialRevision: number }) => <div data-event-id={eventId} data-revision={initialRevision}>Draft editor</div>,
}));

import OverviewPage from "./page";
import { createTranslator } from "next-intl";
import en from "../../../../../../../messages/en.json";
import id from "../../../../../../../messages/id.json";
const { readOrganizerWorkspaceSummary, getActiveEventEditRevisionIds } = vi.hoisted(() => ({ readOrganizerWorkspaceSummary: vi.fn(), getActiveEventEditRevisionIds: vi.fn() }));
vi.mock("@/lib/events/event-revision", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/events/event-revision")>(), getActiveEventEditRevisionIds }));
vi.mock("@/lib/organizer/workspace-read", () => ({ readOrganizerWorkspaceSummary }));
vi.mock("next-intl/server", () => ({ getTranslations: async ({ locale, namespace }: { locale: "id" | "en"; namespace: "organizerMaster" }) => createTranslator({ locale, messages: locale === "id" ? id : en, namespace }) }));

describe("organizer event overview", () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    vi.clearAllMocks();
    getActiveEventEditRevisionIds.mockResolvedValue({});
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-09-15T10:00:00Z").getTime());
    isFeatureEnabled.mockImplementation((flag: string) => flag !== "organizer_master_shell_v3");
    requireAnyRole.mockResolvedValue({ id: "org-1", role: "organizer", name: "Organizer" });
    getManageableEventDraft.mockResolvedValue({
      id: "event-1", name: "Miracle Open", organizerUserId: "org-1", organizer: { organizerProfile: null }, formatConfig: null, draftRevision: 3, status: "Draft",
    });
  });

  it.each(["id", "en"] as const)("retains canonical admin editing entry for complete published events in %s", async locale => {
    isFeatureEnabled.mockReturnValue(true);
    requireAnyRole.mockResolvedValue({ id: "admin-1", role: "platform_admin" });
    getManageableEventDraft.mockResolvedValue({
      id: "event-1", slug: "miracle-open", name: "Miracle Open", description: "Tournament",
      gameId: "game-flashpeak", gameModeId: "mode-1", status: "Published", format: "Single Elimination",
      formatConfig: null, participantCap: 16, timezone: "Asia/Jakarta", venue: "Online",
      registrationFeeRequired: false, organizerUserId: "org-1",
      organizer: { organizerProfile: { contactChannel: "WhatsApp", contactValue: "+62812" } },
      registrationOpensAt: new Date("2026-09-14T10:00:00Z"), registrationClosesAt: new Date("2026-09-17T10:00:00Z"), eventStartsAt: new Date("2026-09-20T10:00:00Z"),
    });
    readOrganizerWorkspaceSummary.mockResolvedValue({ lifecycle: "registration", publication: "published", badges: {}, blockers: [] });
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(await OverviewPage({ params: Promise.resolve({ locale, eventId: "event-1" }) })), "text/html");
    expect(doc.querySelector(`header a[href="/${locale}/organizer/events/event-1/edit"]`)?.textContent).toBe(locale === "id" ? "Edit acara" : "Edit event");
    getActiveEventEditRevisionIds.mockResolvedValue({ "event-1": { id: "revision-1", revision: 2 } });
    const revisionMarkup = renderToStaticMarkup(await OverviewPage({ params: Promise.resolve({ locale, eventId: "event-1" }) }));
    expect(revisionMarkup).toContain(locale === "id" ? "Lanjutkan revisi" : "Continue revision");
  });

  it.each([["drawing", "competition_operations_v3", "competition"], ["ongoing", "competition_operations_v3", "match-control"], ["finished", "completion_workspace_v3", "completion"]])("does not route overview to disabled %s operations", async (lifecycle, disabledFlag, section) => {
    isFeatureEnabled.mockImplementation((flag: string) => flag !== disabledFlag);
    readOrganizerWorkspaceSummary.mockResolvedValue({ lifecycle, publication: "published", badges: {}, blockers: [] });
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(await OverviewPage({ params: Promise.resolve({ locale: "en", eventId: "event-1" }) })), "text/html");
    expect(doc.querySelector(`header a[href$="/${section}"]`)).toBeNull();
    expect(doc.querySelector("header [aria-disabled=true]")?.textContent).toContain("currently unavailable");
  });

  it("summarizes authoritative event facts without rendering an editor or global workspace", async () => {
    isFeatureEnabled.mockReturnValue(true);
    readOrganizerWorkspaceSummary.mockResolvedValue({
      event: { id: "event-1", title: "Miracle Open", game: "Flashpeak", format: "Single Elimination" },
      lifecycle: "draft", publication: "private", role: "organizer",
      capabilities: { overview: true, registration: true, schedule: true },
      badges: { participants: 7 }, blockers: [], updatedAt: "2026-09-15T10:00:00.000Z",
    });
    getManageableEventDraft.mockResolvedValue({
      id: "event-1", name: "Miracle Open", organizerUserId: "org-1", organizer: { organizerProfile: null },
      formatConfig: null, draftRevision: 3, status: "Draft", participantCap: 16,
      eventStartsAt: new Date("2026-09-20T10:00:00Z"), timezone: "Asia/Jakarta",
    });
    readOrganizerWorkspaceSummary.mockResolvedValue({
      event: { id: "event-1", title: "Miracle Open", game: "Flashpeak", format: "Single Elimination" },
      lifecycle: "draft", publication: "private", role: "organizer",
      capabilities: { overview: true, registration: true, schedule: true },
      badges: { participants: 7 }, blockers: [], updatedAt: "2026-09-15T10:00:00.000Z",
    });
    const markup = renderToStaticMarkup(await OverviewPage({ params: Promise.resolve({ locale: "en", eventId: "event-1" }) }));
    expect(markup).toContain("Operations overview");
    expect(markup).toContain("7 / 16");
    expect(markup).toContain("Private");
    expect(markup).toContain("Publication requirements");
    expect(markup).toContain('href="/en/organizer/events/event-1/edit"');
    expect(markup).toContain("Event starts");
    expect(markup).not.toContain("Draft editor");
    expect(markup).not.toContain("data-revision");
    expect(readOrganizerWorkspaceSummary).toHaveBeenCalledWith("event-1", expect.objectContaining({ id: "org-1" }));
  });

  it.each([
    ["draft", "edit"], ["registration", "registration"], ["drawing", "competition"],
    ["ongoing", "match-control"], ["finished", "completion"],
  ])("keeps admin next action canonical for %s", async (lifecycle, section) => {
    isFeatureEnabled.mockReturnValue(true);
    requireAnyRole.mockResolvedValue({ id: "admin-1", role: "platform_admin", name: "Admin" });
    readOrganizerWorkspaceSummary.mockResolvedValue({
      lifecycle, publication: lifecycle === "draft" ? "private" : "published",
      badges: { participants: 7 }, blockers: [], capabilities: {},
    });
    const markup = renderToStaticMarkup(await OverviewPage({ params: Promise.resolve({ locale: "id", eventId: "event-1" }) }));
    const document = new DOMParser().parseFromString(markup, "text/html");
    expect(document.querySelector("header a")?.getAttribute("href")).toBe(`/id/organizer/events/event-1/${section}`);
    expect(markup).toContain("Persyaratan publikasi");
    expect(markup).not.toContain("Operations overview");
  });

  it("shows complete readiness and the earliest future milestone from saved event data", async () => {
    isFeatureEnabled.mockReturnValue(true);
    getManageableEventDraft.mockResolvedValue({
      id: "event-1", slug: "miracle-open", name: "Miracle Open", description: "Tournament",
      gameId: "game-flashpeak", gameModeId: "mode-1", status: "Draft", format: "Single Elimination",
      formatConfig: null, participantCap: 16, timezone: "Asia/Jakarta", venue: "Online",
      registrationFeeRequired: false, registrationFeeAmount: null, organizerUserId: "org-1",
      organizer: { organizerProfile: { contactChannel: "WhatsApp", contactValue: "+62812" } },
      registrationOpensAt: new Date("2026-09-14T10:00:00Z"),
      registrationClosesAt: new Date("2026-09-17T10:00:00Z"),
      eventStartsAt: new Date("2026-09-20T10:00:00Z"),
    });
    const markup = renderToStaticMarkup(await OverviewPage({ params: Promise.resolve({ locale: "en", eventId: "event-1" }) }));
    const document = new DOMParser().parseFromString(markup, "text/html");
    expect(markup).toContain("All publication requirements are met.");
    expect(markup).not.toContain("requirements need attention");
    expect(document.querySelector("time")?.dateTime).toBe("2026-09-17T10:00:00.000Z");
    expect(document.querySelector("time")?.textContent).toContain("17:00");
    expect(markup).toContain("Registration closes");
  });

  it("renders only authoritative blockers and their canonical resolution links", async () => {
    isFeatureEnabled.mockReturnValue(true);
    readOrganizerWorkspaceSummary.mockResolvedValue({
      lifecycle: "ongoing", publication: "published", badges: { participants: 9 }, capabilities: {},
      blockers: [{ code: "match_results", message: "blockers.match_results", section: "match-control", href: "/organizer/events/event-1/match-control" }],
    });
    const markup = renderToStaticMarkup(await OverviewPage({ params: Promise.resolve({ locale: "en", eventId: "event-1" }) }));
    expect(markup).toContain("Match results are still outstanding.");
    expect(markup).not.toContain("Registration requests need review.");
    expect(markup).toContain('href="/en/organizer/events/event-1/match-control"');
    expect(markup).toContain("No upcoming event milestone is scheduled.");
  });

  it("does not render a summary if ownership disappears between scoped reads", async () => {
    isFeatureEnabled.mockReturnValue(true);
    readOrganizerWorkspaceSummary.mockResolvedValue(null);
    await expect(OverviewPage({ params: Promise.resolve({ locale: "en", eventId: "event-1" }) })).rejects.toThrow("NOT_FOUND");
  });

  it("loads the owned draft and composes the revision-aware editor", async () => {
    const page = await OverviewPage({ params: Promise.resolve({ locale: "en", eventId: "event-1" }) });
    const markup = renderToStaticMarkup(page);

    expect(requireAnyRole).toHaveBeenCalledWith(["organizer", "platform_admin", "admin"]);
    expect(getManageableEventDraft).toHaveBeenCalledWith(expect.objectContaining({ id: "org-1" }), "event-1");
    expect(markup).toContain('data-revision="3"');
    expect(markup).not.toContain("Event navigation");
  });

  it("keeps the workspace unavailable while its feature flag is off", async () => {
    isFeatureEnabled.mockReturnValue(false);

    await expect(OverviewPage({ params: Promise.resolve({ locale: "en", eventId: "event-1" }) })).rejects.toThrow("NOT_FOUND");
    expect(requireAnyRole).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated visitors before loading private draft data", async () => {
    requireAnyRole.mockResolvedValue(null);

    await expect(OverviewPage({ params: Promise.resolve({ locale: "id", eventId: "event-1" }) })).rejects.toThrow("REDIRECT");
    expect(redirectToActiveLocale).toHaveBeenCalledWith("/login");
    expect(getManageableEventDraft).not.toHaveBeenCalled();
  });

  it("does not reveal missing or unowned event drafts", async () => {
    getManageableEventDraft.mockResolvedValue(null);

    await expect(OverviewPage({ params: Promise.resolve({ locale: "en", eventId: "event-other" }) })).rejects.toThrow("NOT_FOUND");
  });
});
