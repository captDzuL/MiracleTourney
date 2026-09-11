import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAnyRole, saveEventDraft, publishEvent, createEvent, createOrganizerAndEventDraft, getOrganizerUserById, createEventPreviewToken, revokeEventPreviewTokens, assertUserCanManageEvent, updateEventOrganizerContact, isFeatureEnabled, redirect, revalidatePath, revalidateTag } = vi.hoisted(() => ({
  requireAnyRole: vi.fn(), saveEventDraft: vi.fn(), publishEvent: vi.fn(), assertUserCanManageEvent: vi.fn(),
  createEvent: vi.fn(), createOrganizerAndEventDraft: vi.fn(), getOrganizerUserById: vi.fn(), redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
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
vi.mock("@/lib/platform/repository", () => ({ assertUserCanManageEvent, createEvent, createOrganizerAndEventDraft, getOrganizerUserById, updateEventOrganizerContact }));
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

  it("creates a platform-owned Miracle draft without assigning the admin as organizer", async () => {
    const admin = { id: "admin-1", role: "platform_admin", email: "admin@test.com", name: "League Commissioner" };
    requireAnyRole.mockResolvedValue(admin);
    createEvent.mockResolvedValue({ id: "event-platform" });
    const formData = new FormData();
    formData.set("locale", "id"); formData.set("name", "Miracle Open"); formData.set("slug", "miracle-open");
    formData.set("gameModeId", "mode-flashpeak-5v5"); formData.set("formatKind", "single_elimination"); formData.set("participantCap", "16");
    formData.set("ownerKind", "platform");

    await expect(createEventV3Action(formData)).rejects.toThrow("REDIRECT:/id/admin/events/event-platform/overview");
    expect(createEvent).toHaveBeenCalledWith(expect.objectContaining({
      organizerUserId: undefined,
      organizerName: "Miracle",
      organizerVerified: true,
    }));
  });
  it("assigns an admin-created draft to the selected existing organizer", async () => {
    const admin = { id: "admin-1", role: "platform_admin", email: "admin@test.com", name: "League Commissioner" };
    requireAnyRole.mockResolvedValue(admin);
    getOrganizerUserById.mockResolvedValue({ id: "organizer-2", role: "organizer", name: "Arena Organizer", email: "arena@test.com" });
    createEvent.mockResolvedValue({ id: "event-assigned" });
    const formData = new FormData();
    formData.set("locale", "id"); formData.set("name", "Arena Cup"); formData.set("slug", "arena-cup");
    formData.set("gameModeId", "mode-flashpeak-5v5"); formData.set("formatKind", "single_elimination"); formData.set("participantCap", "16");
    formData.set("ownerKind", "existing_organizer"); formData.set("organizerUserId", "organizer-2");

    await expect(createEventV3Action(formData)).rejects.toThrow("REDIRECT:/id/admin/events/event-assigned/overview");
    expect(getOrganizerUserById).toHaveBeenCalledWith("organizer-2");
    expect(createEvent).toHaveBeenCalledWith(expect.objectContaining({ organizerUserId: "organizer-2", organizerName: "Arena Organizer" }));
  });

  it("creates a new organizer, profile, and assigned draft through one repository operation", async () => {
    const admin = { id: "admin-1", role: "platform_admin", email: "admin@test.com", name: "League Commissioner" };
    requireAnyRole.mockResolvedValue(admin);
    createOrganizerAndEventDraft.mockResolvedValue({ event: { id: "event-new-org" }, organizer: { id: "organizer-new" } });
    const formData = new FormData();
    formData.set("locale", "id"); formData.set("name", "Community Cup"); formData.set("slug", "community-cup");
    formData.set("gameModeId", "mode-flashpeak-5v5"); formData.set("formatKind", "single_elimination"); formData.set("participantCap", "16");
    formData.set("ownerKind", "new_organizer"); formData.set("organizerName", "Rival Community"); formData.set("organizerAccountName", "Rival Admin");
    formData.set("organizerEmail", "rival@example.com"); formData.set("organizerContactChannel", "WhatsApp"); formData.set("organizerContactValue", "+62 811 1234 5678"); formData.set("temporaryPassword", "Temporary123!");

    await expect(createEventV3Action(formData)).rejects.toThrow("REDIRECT:/id/admin/events/event-new-org/overview");
    expect(createOrganizerAndEventDraft).toHaveBeenCalledWith(expect.objectContaining({
      actorId: "admin-1", organizer: expect.objectContaining({ email: "rival@example.com", temporaryPassword: "Temporary123!" }),
      event: expect.objectContaining({ name: "Community Cup", organizerName: "Rival Community" }),
    }));
    expect(createEvent).not.toHaveBeenCalled();
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

  it("rejects organizer workspace mutations until the first password change is complete", async () => {
    requireAnyRole.mockResolvedValue({ ...organizer, mustChangePassword: true });
    await expect(saveEventDraftAction({ eventId: "event-1", expectedRevision: 0, mutationId: "11111111-1111-4111-8111-111111111111", draft: { name: "Blocked Draft" } }))
      .rejects.toThrow("Password change required");
    expect(saveEventDraft).not.toHaveBeenCalled();
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
  it("persists the valid group-and-playoff structure selected in the wizard", async () => {
    createEvent.mockResolvedValue({ id: "event-groups" });
    const formData = new FormData();
    formData.set("locale", "id"); formData.set("name", "Group Masters"); formData.set("slug", "group-masters");
    formData.set("gameModeId", "mode-flashpeak-5v5"); formData.set("formatKind", "group_playoffs"); formData.set("participantCap", "16");
    formData.set("groupCount", "4"); formData.set("qualifiersPerGroup", "2");

    await expect(createEventV3Action(formData)).rejects.toThrow("REDIRECT:/id/organizer/events/event-groups/overview");
    expect(createEvent).toHaveBeenCalledWith(expect.objectContaining({
      formatConfig: expect.objectContaining({ kind: "group_playoffs", groupCount: 4, qualifiersPerGroup: 2 }),
    }));
  });
  it("returns an organizer to the form with a slug error instead of leaking a database exception", async () => {
    createEvent.mockRejectedValue({ code: "P2002" });
    const formData = new FormData();
    formData.set("locale", "id"); formData.set("name", "Existing Cup"); formData.set("slug", "existing-cup");
    formData.set("gameModeId", "mode-flashpeak-5v5"); formData.set("formatKind", "single_elimination"); formData.set("participantCap", "16");

    await expect(createEventV3Action(formData)).rejects.toThrow("REDIRECT:/id/organizer/events/new?error=slug-taken");
  });
});
