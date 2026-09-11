import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

Object.assign(globalThis, { React });

const { requireAnyRole, getManageableEventsForUser, getTeamCountsForEvents, getOrganizerProfileForUser, getActiveEventEditRevisionIds, isFeatureEnabled, notFound, redirectToActiveLocale } = vi.hoisted(() => ({
  requireAnyRole: vi.fn(),
  getManageableEventsForUser: vi.fn(),
  getTeamCountsForEvents: vi.fn(),
  getOrganizerProfileForUser: vi.fn(),
  getActiveEventEditRevisionIds: vi.fn(),
  isFeatureEnabled: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }),
  redirectToActiveLocale: vi.fn(() => { throw new Error("REDIRECT"); }),
}));

vi.mock("@/lib/auth/session", () => ({ requireAnyRole }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled }));
vi.mock("@/lib/events/event-revision", () => ({ getActiveEventEditRevisionIds }));
vi.mock("@/lib/platform/repository", () => ({ getManageableEventsForUser, getTeamCountsForEvents, getOrganizerProfileForUser }));
vi.mock("@/i18n/redirect", () => ({ redirectToActiveLocale }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import OrganizerCommandCenterPage from "./page";

const events = [
  { id: "draft-1", name: "Miracle Draft Cup", status: "Draft", participantCap: 16, format: "Single Elimination", gameId: "flashpeak" },
  { id: "live-1", name: "Kuroko Community League", status: "Published", participantCap: 8, format: "League", gameId: "kuroko" },
];

describe("organizer command center", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isFeatureEnabled.mockReturnValue(true);
    requireAnyRole.mockResolvedValue({ id: "org-1", role: "organizer", name: "Miracle Organizer" });
    getManageableEventsForUser.mockResolvedValue(events);
    getTeamCountsForEvents.mockResolvedValue(new Map([["draft-1", 4], ["live-1", 8]]));
    getActiveEventEditRevisionIds.mockResolvedValue({});
    getOrganizerProfileForUser.mockResolvedValue({ organizationName: "Miracle Esports", contactChannel: "WhatsApp", contactValue: "+628123456789", verified: false });
  });

  it("shows only the organizer's event inventory, priority draft work, and workspace links", async () => {
    const markup = renderToStaticMarkup(await OrganizerCommandCenterPage({ params: Promise.resolve({ locale: "id" }) }));
    expect(requireAnyRole).toHaveBeenCalledWith(["organizer"]);
    expect(getManageableEventsForUser).toHaveBeenCalledWith(expect.objectContaining({ id: "org-1" }));
    expect(getTeamCountsForEvents).toHaveBeenCalledWith(["draft-1", "live-1"]);
    expect(markup).toContain("Organizer Command Center");
    expect(markup).toContain("Miracle Draft Cup");
    expect(markup).toContain("Lanjutkan setup");
    expect(markup).toContain('href="/organizer/events/draft-1/overview"');
    expect(markup).toContain('href="/organizer/events/new"');
    expect(markup).toContain("Edit event");
    expect(markup).toContain('href="/organizer/events/live-1/edit"');
    expect(markup).toContain("Miracle Esports");
  });


  it("shows Continue revision when a private revision is active", async () => {
    getActiveEventEditRevisionIds.mockResolvedValue({ "live-1": { id: "revision-1", revision: 2 } });
    const markup = renderToStaticMarkup(await OrganizerCommandCenterPage({ params: Promise.resolve({ locale: "id" }) }));
    expect(markup).toContain("Lanjutkan revisi");
    expect(markup).toContain("Revisi privat aktif");
  });

  it("requires the V3 flag and an organizer session", async () => {
    isFeatureEnabled.mockReturnValue(false);
    await expect(OrganizerCommandCenterPage({ params: Promise.resolve({ locale: "id" }) })).rejects.toThrow("NOT_FOUND");
    isFeatureEnabled.mockReturnValue(true);
    requireAnyRole.mockResolvedValue(null);
    await expect(OrganizerCommandCenterPage({ params: Promise.resolve({ locale: "id" }) })).rejects.toThrow("REDIRECT");
  });
});