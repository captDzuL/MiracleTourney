import * as React from "react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAnyRole: vi.fn(),
  readCompetitionWorkspace: vi.fn(),
  getManageableEventDraft: vi.fn(),
  mutateCompetitionWorkspaceAction: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }),
  redirectToActiveLocale: vi.fn((path: string) => ({ redirect: path })),
  setRequestLocale: vi.fn(),
  isFeatureEnabled: vi.fn(() => true),
}));
vi.mock("@/lib/auth/session", () => ({ requireAnyRole: mocks.requireAnyRole }));
vi.mock("@/lib/competition/workspace-read", () => ({ readCompetitionWorkspace: mocks.readCompetitionWorkspace }));
vi.mock("@/lib/platform/repository", () => ({ getManageableEventDraft: mocks.getManageableEventDraft }));
vi.mock("@/lib/actions/competition-v3-actions", () => ({ mutateCompetitionWorkspaceAction: mocks.mutateCompetitionWorkspaceAction }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("next-intl/server", () => ({ setRequestLocale: mocks.setRequestLocale, getTranslations: vi.fn() }));
vi.mock("@/i18n/redirect", () => ({ redirectToActiveLocale: mocks.redirectToActiveLocale }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: mocks.isFeatureEnabled }));

import AnnouncementsPage from "./page";

const user = { id: "owner", role: "organizer", mustChangePassword: false, name: "Organizer" };
const workspace = {
  event: { id: "event-1", name: "Miracle Open" }, announcements: [], audit: [], unavailableSections: [],
};

describe("AnnouncementsPage", () => {
  it("rejects an unsupported locale before reading event data", async () => {
    await expect(AnnouncementsPage({ params: Promise.resolve({ locale: "fr", eventId: "event-1" }) })).rejects.toThrow("NOT_FOUND");
    expect(mocks.requireAnyRole).not.toHaveBeenCalled();
  });

  it("requires a manager and reads announcements through the existing competition workspace reader", async () => {
    mocks.requireAnyRole.mockResolvedValue(user);
    mocks.getManageableEventDraft.mockResolvedValue({ id: "event-1", name: "Miracle Open" });
    mocks.readCompetitionWorkspace.mockResolvedValue(workspace);
    const result = await AnnouncementsPage({ params: Promise.resolve({ locale: "en", eventId: "event-1" }) });
    expect(mocks.requireAnyRole).toHaveBeenCalledWith(["organizer", "platform_admin", "admin"]);
    expect(mocks.readCompetitionWorkspace).toHaveBeenCalledWith("event-1");
    expect(result).toBeTruthy();
  });

  it("uses the guarded competition action boundary for announcement commands", async () => {
    mocks.requireAnyRole.mockResolvedValue(user);
    mocks.getManageableEventDraft.mockResolvedValue({ id: "event-1", name: "Miracle Open" });
    mocks.readCompetitionWorkspace.mockResolvedValue({ ...workspace, announcements: [{ id: "notice", title: "Welcome", body: "Ready", status: "draft", urgency: "info" }] });
    const result = await AnnouncementsPage({ params: Promise.resolve({ locale: "id", eventId: "event-1" }) });
    const element = result as React.ReactElement<{ action: unknown; audit: unknown }>;
    expect(element.props.action).toBe(mocks.mutateCompetitionWorkspaceAction);
    expect(element.props.audit).toEqual([]);
  });
});