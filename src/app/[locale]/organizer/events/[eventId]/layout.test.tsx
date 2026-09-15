import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import en from "../../../../../../messages/en.json";
vi.mock("next-intl/server", () => ({ getTranslations: async ({ locale, namespace }: { locale: string; namespace: "organizerMaster.setup" }) => createTranslator({ locale, namespace, messages: en }) }));
const { readOrganizerWorkspaceSummary } = vi.hoisted(() => ({ readOrganizerWorkspaceSummary: vi.fn() }));
vi.mock("@/lib/organizer/workspace-read", () => ({ readOrganizerWorkspaceSummary }));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => "/organizer/events/event-1/overview", Link: ({ href, locale = "en", ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { locale?: string }) => <a {...props} href={`/${locale}${href}`} /> }));

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
  it.each(["organizer", "admin", "platform_admin"])("renders the real master shell for %s without loading editor data", async role => {
    isFeatureEnabled.mockReturnValue(true);
    requireAnyRole.mockResolvedValue({ id: "org-1", role, name: "Manager" });
    readOrganizerWorkspaceSummary.mockResolvedValue({ event: { id: "event-1", title: "Miracle Open", game: "Arena", format: "League" }, lifecycle: "ongoing", publication: "published", role, capabilities: { overview: true, registration: true, participants: false, competition: false, schedule: false, "match-control": false, completion: false, announcements: false, settings: false }, badges: {}, blockers: [], updatedAt: "2026-09-14T10:00:00.000Z" });
    const layout = await EventLayout({ children: <p>Event route content</p>, params: Promise.resolve({ locale: "en", eventId: "event-1" }) });
    const markup = renderToStaticMarkup(<NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Jakarta">{layout}</NextIntlClientProvider>);
    expect(markup).toContain('href="/en/organizer/events/event-1/overview"');
    expect(markup).toContain("Ongoing"); expect(markup).toContain("Event route content");
    expect(getManageableEventDraft).not.toHaveBeenCalled();
  });
  it("denies missing or unowned events through the compact reader under master flag", async () => {
    isFeatureEnabled.mockReturnValue(true); readOrganizerWorkspaceSummary.mockResolvedValue(null);
    await expect(EventLayout({ children: null, params: Promise.resolve({ locale: "en", eventId: "event-other" }) })).rejects.toThrow("NOT_FOUND");
  });
  beforeEach(() => {
    vi.clearAllMocks();
    isFeatureEnabled.mockImplementation(flag => flag !== "organizer_master_shell_v3");
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
