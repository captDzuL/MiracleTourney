import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAnyRole,
  isFeatureEnabled,
  redirectToActiveLocale,
  redirect,
  revalidatePath,
  revalidateTag,
  createEventForManager,
  updateEventStatusForManager,
  archiveEventForManager,
  updateEventPublicInfoForManager,
  saveEventDraftForManager,
  publishEventForManager,
  updateEventOrganizerContactForManager,
  createEventPreviewForManager,
  revokeEventPreviewForManager,
} = vi.hoisted(() => ({
  requireAnyRole: vi.fn(),
  isFeatureEnabled: vi.fn(),
  redirectToActiveLocale: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  createEventForManager: vi.fn(),
  updateEventStatusForManager: vi.fn(),
  archiveEventForManager: vi.fn(),
  updateEventPublicInfoForManager: vi.fn(),
  saveEventDraftForManager: vi.fn(),
  publishEventForManager: vi.fn(),
  updateEventOrganizerContactForManager: vi.fn(),
  createEventPreviewForManager: vi.fn(),
  revokeEventPreviewForManager: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireAnyRole }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled }));
vi.mock("@/i18n/redirect", () => ({ redirectToActiveLocale }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath, revalidateTag }));
vi.mock("./service", () => ({
  createEventForManager,
  updateEventStatusForManager,
  archiveEventForManager,
  updateEventPublicInfoForManager,
  saveEventDraftForManager,
  publishEventForManager,
  updateEventOrganizerContactForManager,
  createEventPreviewForManager,
  revokeEventPreviewForManager,
  resolveEventFormatConfig: vi.fn((kind: string) => ({ kind })),
}));

import {
  adminCreateEventAction,
  adminUpdateEventStatusAction,
  publishEventV3Action,
  saveEventDraftAction,
} from "./actions";

const organizer = { id: "organizer-1", role: "organizer", email: "o@test", name: "Organizer" };
const platformAdmin = { id: "admin-1", role: "platform_admin", email: "a@test", name: "Admin" };
const legacyAdmin = { id: "legacy-admin", role: "admin", email: "l@test", name: "Legacy" };

describe("events actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isFeatureEnabled.mockReturnValue(true);
  });

  it("requires session and redirects to login when absent", async () => {
    requireAnyRole.mockResolvedValue(null);
    await expect(adminCreateEventAction(new FormData())).rejects.toThrow("REDIRECT:/login");
  });

  it("maps organizer session to canonical actor and delegates create", async () => {
    requireAnyRole.mockResolvedValue(organizer);
    createEventForManager.mockResolvedValue({ id: "event-1" });

    const form = new FormData();
    form.set("name", "Miracle Open");
    form.set("slug", "miracle-open");
    form.set("gameModeId", "mode-1");
    form.set("format", "Single Elimination");
    form.set("participantCap", "8");

    await expect(adminCreateEventAction(form)).rejects.toThrow("REDIRECT:/admin?success=event-created");
    expect(createEventForManager).toHaveBeenCalledWith(expect.objectContaining({
      actor: { userId: "organizer-1", role: "organizer", tenantId: "organizer-1" },
      organizerDisplayName: "Organizer",
    }));
  });

  it("maps legacy admin to compatibility actor for self-tenant create", async () => {
    requireAnyRole.mockResolvedValue(legacyAdmin);
    createEventForManager.mockRejectedValue(new Error("REDIRECT:/admin?error=Organizer%20selection%20is%20required."));

    const form = new FormData();
    form.set("name", "Miracle Open");
    form.set("slug", "miracle-open");
    form.set("gameModeId", "mode-1");
    form.set("format", "Single Elimination");
    form.set("participantCap", "8");

    await adminCreateEventAction(form).catch(() => undefined);
    expect(createEventForManager).toHaveBeenCalledWith(expect.objectContaining({
      actor: { userId: "legacy-admin", role: "organizer", tenantId: "legacy-admin" },
    }));
  });

  it("platform admin status update delegates and preserves redirect contract", async () => {
    requireAnyRole.mockResolvedValue(platformAdmin);
    updateEventStatusForManager.mockResolvedValue({ status: "updated", event: { slug: "miracle-open" } });

    const form = new FormData();
    form.set("eventId", "event-1");
    form.set("status", "Ongoing");

    await expect(adminUpdateEventStatusAction(form)).rejects.toThrow("REDIRECT:/admin?success=event-status-updated&event=miracle-open");
    expect(updateEventStatusForManager).toHaveBeenCalledWith(expect.objectContaining({
      actor: { userId: "admin-1", role: "platform_admin", tenantId: null },
      eventId: "event-1",
      status: "Ongoing",
    }));
  });

  it("publish action revalidates expected paths", async () => {
    requireAnyRole.mockResolvedValue(organizer);
    publishEventForManager.mockResolvedValue({ status: "published", slug: "miracle-open" });

    await publishEventV3Action({ eventId: "event-1" });

    expect(revalidateTag).toHaveBeenCalledWith("events");
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(revalidatePath).toHaveBeenCalledWith("/organizer/events/event-1");
  });

  it("draft save delegates through service and revalidates on save", async () => {
    requireAnyRole.mockResolvedValue(organizer);
    saveEventDraftForManager.mockResolvedValue({ status: "saved", revision: 1, fields: {} });

    await saveEventDraftAction({ eventId: "event-1", expectedRevision: 0, mutationId: "11111111-1111-4111-8111-111111111111", draft: { name: "Miracle" } });

    expect(saveEventDraftForManager).toHaveBeenCalledWith(expect.objectContaining({
      actor: { userId: "organizer-1", role: "organizer", tenantId: "organizer-1" },
      eventId: "event-1",
    }));
    expect(revalidateTag).toHaveBeenCalledWith("events");
  });
});
