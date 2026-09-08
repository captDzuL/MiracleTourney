import { beforeEach, describe, expect, it, vi } from "vitest";

const { createEventV3ActionFromModule, createEventPreviewActionFromModule, publishEventV3ActionFromModule, revokeEventPreviewActionFromModule, saveEventDraftActionFromModule, updateEventOrganizerContactActionFromModule } = vi.hoisted(() => ({
  createEventV3ActionFromModule: vi.fn(),
  createEventPreviewActionFromModule: vi.fn(),
  publishEventV3ActionFromModule: vi.fn(),
  revokeEventPreviewActionFromModule: vi.fn(),
  saveEventDraftActionFromModule: vi.fn(),
  updateEventOrganizerContactActionFromModule: vi.fn(),
}));

vi.mock("@/modules/events", () => ({
  adminCreateEventAction: vi.fn(),
  adminUpdateEventStatusAction: vi.fn(),
  adminArchiveEventAction: vi.fn(),
  adminUpdateEventPublicInfoAction: vi.fn(),
  createEventV3Action: createEventV3ActionFromModule,
  createEventPreviewAction: createEventPreviewActionFromModule,
  publishEventV3Action: publishEventV3ActionFromModule,
  revokeEventPreviewAction: revokeEventPreviewActionFromModule,
  saveEventDraftAction: saveEventDraftActionFromModule,
  updateEventOrganizerContactAction: updateEventOrganizerContactActionFromModule,
}));

import {
  createEventV3Action,
  createEventPreviewAction,
  publishEventV3Action,
  revokeEventPreviewAction,
  saveEventDraftAction,
  updateEventOrganizerContactAction,
} from "./event-v3-actions";

const organizer = { id: "organizer-1", role: "organizer", email: "org@test.com", name: "Organizer" };

describe("event V3 actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveEventDraftActionFromModule.mockResolvedValue({ status: "saved", revision: 3, fields: {} });
    createEventV3ActionFromModule.mockRejectedValue(new Error("REDIRECT:/id/organizer/events/event-new/overview"));
    publishEventV3ActionFromModule.mockResolvedValue({ status: "published", slug: "miracle-open" });
    updateEventOrganizerContactActionFromModule.mockResolvedValue(undefined);
    createEventPreviewActionFromModule.mockResolvedValue({ status: "created", url: "/id/preview/events/" + "a".repeat(64), expiresAt: new Date("2026-09-07T10:00:00.000Z") });
    revokeEventPreviewActionFromModule.mockResolvedValue({ status: "revoked", count: 1 });
  });

  it("delegates autosave to modules/events owner", async () => {
    await expect(saveEventDraftAction({ eventId: "event-1", expectedRevision: 2, mutationId: "11111111-1111-4111-8111-111111111111", draft: { name: "Miracle Open" } }))
      .resolves.toMatchObject({ status: "saved", revision: 3 });
    expect(saveEventDraftActionFromModule).toHaveBeenCalledWith({ eventId: "event-1", expectedRevision: 2, mutationId: "11111111-1111-4111-8111-111111111111", draft: { name: "Miracle Open" } });
  });

  it("delegates create flow to modules/events owner", async () => {
    const formData = new FormData();
    formData.set("locale", "id");
    formData.set("name", "Miracle Masters");
    formData.set("slug", "miracle-masters");
    formData.set("gameModeId", "mode-flashpeak-5v5");
    formData.set("formatKind", "double_elimination");
    formData.set("participantCap", "16");

    await expect(createEventV3Action(formData))
      .rejects.toThrow("REDIRECT:/id/organizer/events/event-new/overview");
    expect(createEventV3ActionFromModule).toHaveBeenCalledWith(formData);
  });

  it("delegates organizer contact update to modules/events owner", async () => {
    const formData = new FormData();
    formData.set("eventId", "event-1");
    formData.set("contactChannel", " WhatsApp ");
    formData.set("contactValue", " +628123456789 ");

    await updateEventOrganizerContactAction(formData);
    expect(updateEventOrganizerContactActionFromModule).toHaveBeenCalledWith(formData);
  });

  it("delegates publish operation to modules/events owner", async () => {
    await expect(publishEventV3Action({ eventId: "event-1" })).resolves.toMatchObject({ status: "published" });
    expect(publishEventV3ActionFromModule).toHaveBeenCalledWith({ eventId: "event-1" });
  });

  it("preserves delegated publish return contracts", async () => {
    await publishEventV3Action({ eventId: "event-1" });
    expect(publishEventV3ActionFromModule).toHaveBeenCalledTimes(1);
  });

  it("delegates preview create result unchanged from modules/events owner", async () => {
    const result = await createEventPreviewAction({ eventId: "event-1", locale: "id" });
    expect(createEventPreviewActionFromModule).toHaveBeenCalledWith({ eventId: "event-1", locale: "id" });
    expect(result).toEqual({
      status: "created",
      url: `/id/preview/events/${"a".repeat(64)}`,
      expiresAt: new Date("2026-09-07T10:00:00.000Z"),
    });
  });

  it("delegates preview revoke to modules/events owner", async () => {
    await expect(revokeEventPreviewAction({ eventId: "event-1" }))
      .resolves.toEqual({ status: "revoked", count: 1 });
    expect(revokeEventPreviewActionFromModule).toHaveBeenCalledWith({ eventId: "event-1" });
  });

  it("forwards module validation failures", async () => {
    createEventPreviewActionFromModule.mockRejectedValueOnce(new Error("invalid locale"));
    await expect(createEventPreviewAction({ eventId: "event-1", locale: "fr" })).rejects.toThrow("invalid locale");
  });
});





