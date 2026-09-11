import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

Object.assign(globalThis, { React });

const { requireAnyRole, getManageableEventDraft, getPlatformProfile, isFeatureEnabled, notFound, redirectToActiveLocale } = vi.hoisted(() => ({
  requireAnyRole: vi.fn(),
  getManageableEventDraft: vi.fn(),
  getPlatformProfile: vi.fn(),
  isFeatureEnabled: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }),
  redirectToActiveLocale: vi.fn(() => { throw new Error("REDIRECT"); }),
}));

vi.mock("@/lib/auth/session", () => ({ requireAnyRole }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled }));
vi.mock("@/lib/platform/repository", () => ({ getManageableEventDraft, getPlatformProfile }));
vi.mock("@/i18n/redirect", () => ({ redirectToActiveLocale }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/lib/events/publish-readiness", () => ({
  evaluatePublishReadiness: vi.fn(() => ({ ready: false, incomplete: [], notices: [] })),
}));
vi.mock("@/components/v3/events/PreviewControls", () => ({ PreviewControls: () => <div>Preview controls</div> }));
vi.mock("@/components/v3/events/PublishReadiness", () => ({ PublishReadiness: () => <div>Publish readiness</div> }));
vi.mock("@/components/v3/EventWorkspaceShell", () => ({
  EventWorkspaceShell: ({ children, navigation, nextAction }: {
    children: React.ReactNode;
    navigation: Array<{ href: string; label: string }>;
    nextAction: React.ReactNode;
  }) => <main>
    <nav>{navigation.map(item => <a href={item.href} key={item.href}>{item.label}</a>)}</nav>
    {children}
    {nextAction}
  </main>,
}));

import EventLayout from "./layout";

describe("organizer event layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isFeatureEnabled.mockReturnValue(true);
    requireAnyRole.mockResolvedValue({ id: "org-1", role: "organizer", name: "Organizer" });
    getManageableEventDraft.mockResolvedValue({ id: "event-1", name: "Miracle Open", status: "Draft", organizerUserId: "org-1", organizer: { organizerProfile: { contactChannel: "WhatsApp", contactValue: "+6281" } } });
  });

  it("guards the workspace and exposes contextual editor sections", async () => {
    const layout = await EventLayout({
      children: <p>Editor</p>,
      params: Promise.resolve({ locale: "en", eventId: "event-1" }),
    });
    const markup = renderToStaticMarkup(layout);

    expect(requireAnyRole).toHaveBeenCalledWith(["organizer", "platform_admin", "admin"]);
    expect(getManageableEventDraft).toHaveBeenCalledWith(expect.objectContaining({ id: "org-1" }), "event-1");
    expect(markup).toContain('href="/organizer/events/event-1/overview#section-identity"');
    expect(markup).toContain('href="/organizer/events/event-1/overview#section-format"');
    expect(markup).not.toContain('aria-current="page"');
    expect(markup).toContain('href="/organizer/events/event-1/overview#section-review"');
    expect(markup).not.toContain('aria-label="Next action"');
    expect(markup).not.toContain('/registration');
    expect(markup).not.toContain('/matches');
  });

  it("keeps the event workspace unavailable while its feature flag is off", async () => {
    isFeatureEnabled.mockReturnValue(false);
    await expect(EventLayout({ children: null, params: Promise.resolve({ locale: "en", eventId: "event-1" }) })).rejects.toThrow("NOT_FOUND");
    expect(requireAnyRole).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated visitors before loading private event data", async () => {
    requireAnyRole.mockResolvedValue(null);
    await expect(EventLayout({ children: null, params: Promise.resolve({ locale: "id", eventId: "event-1" }) })).rejects.toThrow("REDIRECT");
    expect(getManageableEventDraft).not.toHaveBeenCalled();
  });

  it("does not reveal missing or unowned events", async () => {
    getManageableEventDraft.mockResolvedValue(null);
    await expect(EventLayout({ children: null, params: Promise.resolve({ locale: "en", eventId: "event-other" }) })).rejects.toThrow("NOT_FOUND");
  });
});