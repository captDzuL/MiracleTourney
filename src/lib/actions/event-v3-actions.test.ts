import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAnyRole, saveEventDraft, publishEvent, assertUserCanManageEvent, revalidatePath, revalidateTag } = vi.hoisted(() => ({
  requireAnyRole: vi.fn(), saveEventDraft: vi.fn(), publishEvent: vi.fn(), assertUserCanManageEvent: vi.fn(),
  revalidatePath: vi.fn(), revalidateTag: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireAnyRole }));
vi.mock("@/lib/events/event-draft", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/events/event-draft")>()), saveEventDraft,
}));
vi.mock("@/lib/events/publish-readiness", () => ({ publishEvent }));
vi.mock("@/lib/platform/repository", () => ({ assertUserCanManageEvent }));
vi.mock("next/cache", () => ({ revalidatePath, revalidateTag }));

import { publishEventV3Action, saveEventDraftAction } from "./event-v3-actions";

const organizer = { id: "organizer-1", role: "organizer", email: "org@test.com", name: "Organizer" };

describe("event V3 actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAnyRole.mockResolvedValue(organizer);
    assertUserCanManageEvent.mockResolvedValue(undefined);
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
});





