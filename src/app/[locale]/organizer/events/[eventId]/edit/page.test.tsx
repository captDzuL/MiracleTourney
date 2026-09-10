import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

Object.assign(globalThis, { React });

const mocks = vi.hoisted(() => ({
  requireAnyRole: vi.fn(),
  getManageableEventDraft: vi.fn(),
  getPlatformProfile: vi.fn(),
  getGameModes: vi.fn(),
  isFeatureEnabled: vi.fn(),
  startEventEditRevision: vi.fn(),
  getEventRevisionFieldLocks: vi.fn(),
  payloadParse: vi.fn((value) => value),
  notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }),
  redirectToActiveLocale: vi.fn(() => { throw new Error("REDIRECT"); }),
  saveAction: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireAnyRole: mocks.requireAnyRole }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: mocks.isFeatureEnabled }));
vi.mock("@/lib/platform/repository", () => ({
  getManageableEventDraft: mocks.getManageableEventDraft,
  getPlatformProfile: mocks.getPlatformProfile,
  getGameModes: mocks.getGameModes,
}));
vi.mock("@/lib/platform/config", () => ({ getGameModeDisplayLabel: (id: string) => `Game · ${id}` }));
vi.mock("@/lib/events/event-revision", () => ({
  eventRevisionPayloadSchema: { parse: mocks.payloadParse },
  getEventRevisionFieldLocks: mocks.getEventRevisionFieldLocks,
  startEventEditRevision: mocks.startEventEditRevision,
}));
vi.mock("@/lib/actions/event-revision-actions", () => ({
  savePublishedEventRevisionAction: mocks.saveAction,
  updatePublishedEventSlugAction: vi.fn(),
}));
vi.mock("@/lib/events/event-datetime", () => ({ eventDateToLocalInput: () => "2026-09-10T10:00" }));
vi.mock("@/i18n/redirect", () => ({ redirectToActiveLocale: mocks.redirectToActiveLocale }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/components/v3/events/EventDraftForm", () => ({
  EventDraftForm: (props: { saveTargetId: string; editorLabel: string; fieldLocks: Record<string, string>; initialDraft: { description: string }; reviewPanel: React.ReactNode; visualEditor: React.ReactNode }) =>
    <div data-description={props.initialDraft.description} data-editor={props.editorLabel} data-locks={JSON.stringify(props.fieldLocks)} data-save-target={props.saveTargetId}>Revision editor{props.visualEditor}{props.reviewPanel}</div>,
}));
vi.mock("@/components/v3/events/PublishedRevisionControls", () => ({
  PublishedRevisionControls: ({ revisionId }: { revisionId: string }) => <div data-revision-controls={revisionId}>Perbarui event publik</div>,
}));
vi.mock("@/components/v3/events/RevisionVisualEditor", () => ({
  RevisionVisualEditor: ({ revisionId }: { revisionId: string }) => <div data-revision-visuals={revisionId}>Revision visuals</div>,
}));

import EditEventPage from "./page";

const payload = {
  name: "Miracle Open", description: "Public description", logoUrl: null, gameImageUrl: null,
  gameModeId: "mode-1", format: "Single Elimination", formatConfig: null, participantCap: 16,
  registrationOpensAt: null, registrationClosesAt: null, eventStartsAt: null,
  timezone: "Asia/Jakarta", venue: "Online", venueAddress: null, prizePoolLabel: null,
  registrationFeeRequired: false, registrationFeeAmount: null, registrationFeeLabel: null,
  registrationUrl: null, characterArtUrl: null, accentColor: null, activeVisualAssetId: null, stream: null,
};
const event = {
  id: "event-1", slug: "miracle-open", status: "Published", organizerUserId: "org-1",
  registrationClosesAt: null, _count: { matches: 0 },
  organizer: { organizerProfile: { contactChannel: "WhatsApp", contactValue: "+62812" } },
};

describe("published event edit route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isFeatureEnabled.mockReturnValue(true);
    mocks.requireAnyRole.mockResolvedValue({ id: "org-1", role: "organizer", name: "Organizer" });
    mocks.getManageableEventDraft.mockResolvedValue(event);
    mocks.getGameModes.mockReturnValue([{ id: "mode-1" }]);
    mocks.getEventRevisionFieldLocks.mockReturnValue({});
    mocks.startEventEditRevision.mockResolvedValue({ status: "active", revision: { id: "revision-1", revision: 3, payload } });
  });

  it("opens a private autosave editor for Published events", async () => {
    const markup = renderToStaticMarkup(await EditEventPage({ params: Promise.resolve({ locale: "id", eventId: "event-1" }) }));
    expect(mocks.startEventEditRevision).toHaveBeenCalledWith({
      eventId: "event-1",
      actor: { id: "org-1", role: "organizer" },
    });
    expect(markup).toContain('data-save-target="revision-1"');
    expect(markup).toContain('data-editor="Revisi privat"');
    expect(markup).toContain("Perbarui event publik");
    expect(markup).toContain("Revision visuals");
  });

  it.each(["Ongoing", "Finished"])("locks the editor when status is %s", async (status) => {
    mocks.getManageableEventDraft.mockResolvedValue({ ...event, status });
    const markup = renderToStaticMarkup(await EditEventPage({ params: Promise.resolve({ locale: "id", eventId: "event-1" }) }));
    expect(markup).toContain("Event terkunci");
    expect(markup).toContain("Kembali ke workspace");
    expect(mocks.startEventEditRevision).not.toHaveBeenCalled();
  });
});
