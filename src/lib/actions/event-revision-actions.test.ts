import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAnyRole: vi.fn(),
  saveEventEditRevision: vi.fn(),
  applyEventEditRevision: vi.fn(),
  discardEventEditRevision: vi.fn(),
  createEventRevisionPreviewToken: vi.fn(),
  revokeEventRevisionPreviewTokens: vi.fn(),
  getEventEditRevision: vi.fn(),
  updatePublishedEventSlugAsAdmin: vi.fn(),
  createEventVisualAsset: vi.fn(),
  uploadImageAsset: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
}));

vi.mock("@/lib/auth/session", () => ({ requireAnyRole: mocks.requireAnyRole }));
vi.mock("@/lib/events/event-revision", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/events/event-revision")>()),
  saveEventEditRevision: mocks.saveEventEditRevision,
  applyEventEditRevision: mocks.applyEventEditRevision,
  discardEventEditRevision: mocks.discardEventEditRevision,
  createEventRevisionPreviewToken: mocks.createEventRevisionPreviewToken,
  revokeEventRevisionPreviewTokens: mocks.revokeEventRevisionPreviewTokens,
  getEventEditRevision: mocks.getEventEditRevision,
}));
vi.mock("@/lib/platform/repository", () => ({
  updatePublishedEventSlugAsAdmin: mocks.updatePublishedEventSlugAsAdmin,
  createEventVisualAsset: mocks.createEventVisualAsset,
}));
vi.mock("@/lib/actions", () => ({ uploadImageAsset: mocks.uploadImageAsset }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath, revalidateTag: mocks.revalidateTag }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import {
  createPublishedRevisionPreviewAction,
  savePublishedEventRevisionAction,
  updatePublishedEventSlugAction,
} from "./event-revision-actions";

const organizer = { id: "organizer-1", role: "organizer", name: "Organizer", email: "org@example.com", mustChangePassword: false };
const mutationId = "11111111-1111-4111-8111-111111111111";

describe("published event revision actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAnyRole.mockResolvedValue(organizer);
  });

  it("passes the authenticated organizer actor to the owner-scoped autosave service", async () => {
    mocks.saveEventEditRevision.mockResolvedValue({ status: "saved", revision: 2, fields: {} });
    await expect(savePublishedEventRevisionAction({
      eventId: "revision-1",
      expectedRevision: 1,
      mutationId,
      draft: { description: "Private update" },
    })).resolves.toMatchObject({ status: "saved", revision: 2 });

    expect(mocks.requireAnyRole).toHaveBeenCalledWith(["organizer", "platform_admin", "admin"]);
    expect(mocks.saveEventEditRevision).toHaveBeenCalledWith({
      revisionId: "revision-1",
      actor: { id: "organizer-1", role: "organizer" },
      expectedRevision: 1,
      mutationId,
      patch: { description: "Private update" },
    });
  });

  it("blocks a new organizer until the temporary password has been replaced", async () => {
    mocks.requireAnyRole.mockResolvedValue({ ...organizer, mustChangePassword: true });
    await expect(savePublishedEventRevisionAction({
      eventId: "revision-1",
      expectedRevision: 1,
      mutationId,
      draft: { description: "Private update" },
    })).rejects.toThrow("Password change required");
    expect(mocks.saveEventEditRevision).not.toHaveBeenCalled();
  });

  it("returns a locale-aware private preview URL", async () => {
    mocks.createEventRevisionPreviewToken.mockResolvedValue({
      status: "created",
      token: "a".repeat(64),
      expiresAt: new Date("2026-09-10T10:00:00.000Z"),
    });
    await expect(createPublishedRevisionPreviewAction({ revisionId: "revision-1", locale: "id" }))
      .resolves.toMatchObject({ status: "created", url: `/id/preview/events/${"a".repeat(64)}` });
    expect(mocks.createEventRevisionPreviewToken).toHaveBeenCalledWith({
      revisionId: "revision-1",
      actor: { id: "organizer-1", role: "organizer" },
    });
  });

  it("allows only Platform Admin to change a published slug", async () => {
    const formData = new FormData();
    formData.set("eventId", "event-1");
    formData.set("locale", "id");
    formData.set("slug", "miracle-open-baru");

    await expect(updatePublishedEventSlugAction(formData)).rejects.toThrow("Not authorized");
    expect(mocks.updatePublishedEventSlugAsAdmin).not.toHaveBeenCalled();

    const admin = { ...organizer, id: "admin-1", role: "platform_admin" };
    mocks.requireAnyRole.mockResolvedValue(admin);
    mocks.updatePublishedEventSlugAsAdmin.mockResolvedValue({ id: "event-1", slug: "miracle-open-baru" });
    await expect(updatePublishedEventSlugAction(formData))
      .rejects.toThrow("REDIRECT:/id/admin/events/event-1/edit#section-identity");
    expect(mocks.updatePublishedEventSlugAsAdmin).toHaveBeenCalledWith(admin, "event-1", "miracle-open-baru");
  });
});
