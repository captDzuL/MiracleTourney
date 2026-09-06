import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/components/v3/events/EventDraftForm", () => ({
  EventDraftForm: ({ eventId, initialRevision }: { eventId: string; initialRevision: number }) => <div data-event-id={eventId} data-revision={initialRevision}>Draft editor</div>,
}));

import OverviewPage from "./page";

describe("organizer event overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isFeatureEnabled.mockReturnValue(true);
    requireAnyRole.mockResolvedValue({ id: "org-1", role: "organizer", name: "Organizer" });
    getManageableEventDraft.mockResolvedValue({
      id: "event-1", name: "Miracle Open", formatConfig: null, draftRevision: 3, status: "Draft",
    });
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