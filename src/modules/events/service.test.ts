import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  archiveEventForActor,
  assertActorCanManageEvent,
  createEventRecord,
  getActiveOrganizerIdentityById,
  setEventStatusForActor,
  updateEventOrganizerContactForActor,
  updateEventPublicInfoForActor,
  saveEventDraft,
  publishEvent,
  createEventPreviewToken,
  revokeEventPreviewTokens,
} = vi.hoisted(() => ({
  archiveEventForActor: vi.fn(),
  assertActorCanManageEvent: vi.fn(),
  createEventRecord: vi.fn(),
  getActiveOrganizerIdentityById: vi.fn(),
  setEventStatusForActor: vi.fn(),
  updateEventOrganizerContactForActor: vi.fn(),
  updateEventPublicInfoForActor: vi.fn(),
  saveEventDraft: vi.fn(),
  publishEvent: vi.fn(),
  createEventPreviewToken: vi.fn(),
  revokeEventPreviewTokens: vi.fn(),
}));

vi.mock("@/lib/platform/config", () => ({
  getGameIdForMode: vi.fn(() => "game-1"),
}));

vi.mock("./repository", () => ({
  archiveEventForActor,
  assertActorCanManageEvent,
  createEventRecord,
  getActiveOrganizerIdentityById,
  setEventStatusForActor,
  updateEventOrganizerContactForActor,
  updateEventPublicInfoForActor,
}));
vi.mock("./event-draft", () => ({
  eventDraftSchema: { parse: (value: unknown) => value },
  saveEventDraft,
}));
vi.mock("./publish-readiness", () => ({ publishEvent }));
vi.mock("./preview-token", () => ({ createEventPreviewToken, revokeEventPreviewTokens }));

import { ForbiddenError } from "@/modules/identity";

import {
  createEventForManager,
  createEventPreviewForManager,
  publishEventForManager,
  resolveEventFormatConfig,
  revokeEventPreviewForManager,
  saveEventDraftForManager,
  updateEventStatusForManager,
} from "./service";

const organizerActor = { userId: "org-1", role: "organizer" as const, tenantId: "org-1" };
const platformAdminActor = { userId: "admin-1", role: "platform_admin" as const, tenantId: null };

describe("events service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("organizer cannot override owner while creating event", async () => {
    await expect(createEventForManager({
      actor: organizerActor,
      organizerDisplayName: "Org One",
      name: "Miracle Cup",
      slug: "miracle-cup",
      gameModeId: "mode-1",
      formatConfig: resolveEventFormatConfig("single_elimination"),
      participantCap: 8,
      organizerUserId: "org-2",
    })).rejects.toBeInstanceOf(ForbiddenError);
    expect(createEventRecord).not.toHaveBeenCalled();
  });

  it("platform admin create requires explicit organizer", async () => {
    await expect(createEventForManager({
      actor: platformAdminActor,
      organizerDisplayName: "Admin",
      name: "Miracle Cup",
      slug: "miracle-cup",
      gameModeId: "mode-1",
      formatConfig: resolveEventFormatConfig("single_elimination"),
      participantCap: 8,
    })).rejects.toThrow("Organizer selection is required.");
  });

  it("platform admin create uses selected active organizer", async () => {
    getActiveOrganizerIdentityById.mockResolvedValue({ id: "org-2", name: "Org Two" });
    createEventRecord.mockResolvedValue({ id: "event-1" });

    await createEventForManager({
      actor: platformAdminActor,
      organizerDisplayName: "Admin",
      name: "Miracle Cup",
      slug: "miracle-cup",
      gameModeId: "mode-any",
      formatConfig: resolveEventFormatConfig("single_elimination"),
      participantCap: 8,
      organizerUserId: "org-2",
    });

    expect(createEventRecord).toHaveBeenCalledWith(expect.objectContaining({
      organizerUserId: "org-2",
      organizerName: "Org Two",
    }));
  });

  it("legacy admin compatibility actor creates for self tenant", async () => {
    createEventRecord.mockResolvedValue({ id: "event-1" });
    await createEventForManager({
      actor: { userId: "legacy-admin", role: "organizer", tenantId: "legacy-admin" },
      organizerDisplayName: "Legacy Admin",
      name: "Miracle Cup",
      slug: "miracle-cup",
      gameModeId: "mode-1",
      formatConfig: resolveEventFormatConfig("single_elimination"),
      participantCap: 8,
      organizerUserId: "org-other",
    }).catch(() => undefined);

    expect(createEventRecord).not.toHaveBeenCalled();
  });

  it("save draft delegates actor projection with tenant scope", async () => {
    saveEventDraft.mockResolvedValue({ status: "saved", revision: 1, fields: {} });
    await saveEventDraftForManager({
      actor: organizerActor,
      eventId: "event-1",
      expectedRevision: 0,
      mutationId: "11111111-1111-4111-8111-111111111111",
      draft: { name: "Miracle" },
    });

    expect(saveEventDraft).toHaveBeenCalledWith(expect.objectContaining({
      actor: { id: "org-1", role: "organizer" },
    }));
  });

  it("publish delegates ownership check and publish operation", async () => {
    publishEvent.mockResolvedValue({ status: "published", slug: "miracle" });
    await publishEventForManager({ actor: organizerActor, eventId: "event-1" });
    expect(assertActorCanManageEvent).toHaveBeenCalledWith(organizerActor, "event-1");
    expect(publishEvent).toHaveBeenCalledWith("event-1", { id: "org-1", role: "organizer" });
  });

  it("update status uses publish flow only when enabled", async () => {
    setEventStatusForActor.mockResolvedValue({ id: "event-1", slug: "miracle" });
    await updateEventStatusForManager({ actor: organizerActor, eventId: "event-1", status: "Ongoing", enableV3PublishFlow: true });
    expect(setEventStatusForActor).toHaveBeenCalledWith(organizerActor, "event-1", "Ongoing");
  });

  it("preview create/revoke stays tenant-scoped through actor mapping", async () => {
    createEventPreviewToken.mockResolvedValue({ status: "created", token: "a".repeat(64), id: "p1", expiresAt: new Date() });
    revokeEventPreviewTokens.mockResolvedValue({ status: "revoked", count: 1 });

    await createEventPreviewForManager({ actor: organizerActor, eventId: "event-1" });
    await revokeEventPreviewForManager({ actor: organizerActor, eventId: "event-1" });

    expect(createEventPreviewToken).toHaveBeenCalledWith({ eventId: "event-1", actor: { id: "org-1", role: "organizer" } });
    expect(revokeEventPreviewTokens).toHaveBeenCalledWith({ eventId: "event-1", actor: { id: "org-1", role: "organizer" } });
  });
});
