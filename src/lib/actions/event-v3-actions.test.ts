import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAnyRole, saveEventDraft, publishEvent, createEvent, createEventPreviewToken, revokeEventPreviewTokens, assertUserCanManageEvent, updateEventOrganizerContact, isFeatureEnabled, redirect, revalidatePath, revalidateTag } = vi.hoisted(() => ({
  requireAnyRole: vi.fn(), saveEventDraft: vi.fn(), publishEvent: vi.fn(), assertUserCanManageEvent: vi.fn(),
  createEvent: vi.fn(), redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
  createEventPreviewToken: vi.fn(), revokeEventPreviewTokens: vi.fn(),
  updateEventOrganizerContact: vi.fn(),
  isFeatureEnabled: vi.fn(),
  revalidatePath: vi.fn(), revalidateTag: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireAnyRole }));
vi.mock("@/lib/events/event-draft", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/events/event-draft")>()), saveEventDraft,
}));
vi.mock("@/lib/events/publish-readiness", () => ({ publishEvent }));
vi.mock("@/lib/events/preview-token", () => ({ createEventPreviewToken, revokeEventPreviewTokens }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled }));
vi.mock("@/lib/platform/repository", () => ({ assertUserCanManageEvent, createEvent, updateEventOrganizerContact }));
vi.mock("next/cache", () => ({ revalidatePath, revalidateTag }));
vi.mock("next/navigation", () => ({ redirect }));

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
    requireAnyRole.mockResolvedValue(organizer);
    assertUserCanManageEvent.mockResolvedValue(undefined);
    isFeatureEnabled.mockReturnValue(true);
  });

  it("authenticates and delegates autosave with the full actor scope", async () => {
    saveEventDraft.mockResolvedValue({ status: "saved", revision: 3, fields: {} });
    await expect(saveEventDraftAction({ eventId: "event-1", expectedRevision: 2, mutationId: "11111111-1111-4111-8111-111111111111", draft: { name: "Miracle Open" } }))
      .resolves.toMatchObject({ status: "saved", revision: 3 });
    expect(requireAnyRole).toHaveBeenCalledWith(["organizer", "platform_admin", "admin"]);
    expect(saveEventDraft).toHaveBeenCalledWith({
      eventId: "event-1", actor: { id: "organizer-1", role: "organizer" }, expectedRevision: 2,
      mutationId: "11111111-1111-4111-8111-111111111111", draft: { name: "Miracle Open" },
    });
    expect(revalidateTag).toHaveBeenCalledWith("events");
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("creates an organizer-owned draft and opens its locale-aware workspace", async () => {
    createEvent.mockResolvedValue({ id: "event-new" });
    const formData = new FormData();
    formData.set("locale", "id");
    formData.set("name", "Miracle Masters");
    formData.set("slug", "miracle-masters");
    formData.set("gameModeId", "mode-flashpeak-5v5");
    formData.set("formatKind", "double_elimination");
    formData.set("participantCap", "16");

    await expect(createEventV3Action(formData))
      .rejects.toThrow("REDIRECT:/id/organizer/events/event-new/overview");
    expect(createEvent).toHaveBeenCalledWith(expect.objectContaining({
      name: "Miracle Masters",
      slug: "miracle-masters",
      gameModeId: "mode-flashpeak-5v5",
      format: "Single Elimination",
      formatConfig: expect.objectContaining({ kind: "double_elimination" }),
      participantCap: 16,
      organizerUserId: "organizer-1",
      organizerName: "Organizer",
    }));
  });

  it("rejects advanced competition formats while their feature flag is off", async () => {
    isFeatureEnabled.mockReturnValue(false);
    const formData = new FormData();
    formData.set("locale", "en"); formData.set("name", "Miracle Masters"); formData.set("slug", "miracle-masters");
    formData.set("gameModeId", "mode-1"); formData.set("formatKind", "double_elimination"); formData.set("participantCap", "16");
    await expect(createEventV3Action(formData)).rejects.toThrow("Competition operations are unavailable");
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("updates organizer contact through the event-scoped repository guard", async () => {
    const formData = new FormData();
    formData.set("eventId", "event-1");
    formData.set("contactChannel", " WhatsApp ");
    formData.set("contactValue", " +628123456789 ");

    await updateEventOrganizerContactAction(formData);

    expect(updateEventOrganizerContact).toHaveBeenCalledWith(organizer, {
      eventId: "event-1", contactChannel: "WhatsApp", contactValue: "+628123456789",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/organizer/events/event-1");
  });

  it.each(["organizer", "platform_admin", "admin"] as const)("allows the %s role to publish through the shared guard", async (role) => {
    const actor = { ...organizer, id: role + "-1", role };
    requireAnyRole.mockResolvedValue(actor);
    publishEvent.mockResolvedValue({ status: "published", slug: "miracle-open" });

    await expect(publishEventV3Action({ eventId: "event-1" })).resolves.toMatchObject({ status: "published" });
    expect(assertUserCanManageEvent).toHaveBeenCalledWith(actor, "event-1");
    expect(publishEvent).toHaveBeenCalledWith("event-1", { id: actor.id, role });
  });

  it("requires a UUID mutation ID before autosave", async () => {
    await expect(saveEventDraftAction({ eventId: "event-1", expectedRevision: 0, mutationId: "not-a-uuid", draft: {} }))
      .rejects.toThrow();
    expect(saveEventDraft).not.toHaveBeenCalled();
  });
  it("rejects autosave without an authorized session", async () => {
    requireAnyRole.mockResolvedValue(null);
    await expect(saveEventDraftAction({ eventId: "event-1", expectedRevision: 0, draft: {} })).rejects.toThrow("Unauthorized");
    expect(saveEventDraft).not.toHaveBeenCalled();
  });

  it("revalidates public pages after successful publication", async () => {
    publishEvent.mockResolvedValue({ status: "published", slug: "miracle-open" });
    await publishEventV3Action({ eventId: "event-1" });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("returns a locale-aware preview URL without exposing a separate raw token", async () => {
    createEventPreviewToken.mockResolvedValue({
      status: "created",
      token: "a".repeat(64),
      id: "preview-1",
      expiresAt: new Date("2026-09-07T10:00:00.000Z"),
    });

    const result = await createEventPreviewAction({ eventId: "event-1", locale: "id" });

    expect(assertUserCanManageEvent).toHaveBeenCalledWith(organizer, "event-1");
    expect(createEventPreviewToken).toHaveBeenCalledWith({
      eventId: "event-1",
      actor: { id: "organizer-1", role: "organizer" },
    });
    expect(result).toEqual({
      status: "created",
      url: `/id/preview/events/${"a".repeat(64)}`,
      expiresAt: new Date("2026-09-07T10:00:00.000Z"),
    });
    expect(result).not.toHaveProperty("token");
  });

  it("revokes preview links through the shared event manager guard", async () => {
    revokeEventPreviewTokens.mockResolvedValue({ status: "revoked", count: 1 });

    await expect(revokeEventPreviewAction({ eventId: "event-1" }))
      .resolves.toEqual({ status: "revoked", count: 1 });
    expect(assertUserCanManageEvent).toHaveBeenCalledWith(organizer, "event-1");
    expect(revokeEventPreviewTokens).toHaveBeenCalledWith({
      eventId: "event-1",
      actor: { id: "organizer-1", role: "organizer" },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/organizer/events/event-1");
  });

  it("validates the preview locale before creating a token", async () => {
    await expect(createEventPreviewAction({ eventId: "event-1", locale: "fr" })).rejects.toThrow();
    expect(createEventPreviewToken).not.toHaveBeenCalled();
  });
});





