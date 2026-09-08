import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAnyRole,
  redirectToActiveLocale,
  redirect,
  revalidatePath,
  revalidateTag,
  blobPut,
  assertActorCanManageVisualEvent,
  createEventVisualAsset,
  approveEventVisualAsset,
  rejectEventVisualAsset,
  setEventVisualFocalPoint,
} = vi.hoisted(() => ({
  requireAnyRole: vi.fn(),
  redirectToActiveLocale: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  blobPut: vi.fn(),
  assertActorCanManageVisualEvent: vi.fn(),
  createEventVisualAsset: vi.fn(),
  approveEventVisualAsset: vi.fn(),
  rejectEventVisualAsset: vi.fn(),
  setEventVisualFocalPoint: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireAnyRole }));
vi.mock("@/i18n/redirect", () => ({ redirectToActiveLocale }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath, revalidateTag }));
vi.mock("@vercel/blob", () => ({ put: blobPut }));
vi.mock("./service", () => ({
  assertActorCanManageVisualEvent,
  createEventVisualAsset,
  approveEventVisualAsset,
  rejectEventVisualAsset,
  setEventVisualFocalPoint,
}));

import {
  adminActivateEventVisualAction,
  adminApproveEventVisualAction,
  adminRejectEventVisualAction,
  adminSetEventVisualFocalPointAction,
  adminUploadEventVisualAction,
  organizerUploadEventVisualAction,
} from "./actions";

function fd(pairs: Record<string, string | File>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(pairs)) f.set(k, v);
  return f;
}

/** A real 16×9 PNG so `sharp` can decode it and report genuine dimensions. */
function validPngFile(name = "background.png") {
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAYAAAA7KqwyAAAAFklEQVQoU2NkYGD4z0AEYBxVSFwFAJm" +
    "wA/pKY2j8AAAAAElFTkSuQmCC";
  const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
  return new File([bytes], name, { type: "image/png" });
}

function organizerSession() {
  return { id: "organizer-1", role: "organizer" as const, email: "org@test.com", name: "Organizer One" };
}

const organizerActor = { userId: "organizer-1", role: "organizer" as const, tenantId: "organizer-1" };

function visualAsset(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "asset-new",
    eventId: "event-safe",
    source: "organizer_upload",
    status: "approved",
    focalX: 0.5,
    focalY: 0.5,
    createdAt: new Date("2026-09-07T00:00:00.000Z"),
    updatedAt: new Date("2026-09-07T00:00:00.000Z"),
    ...overrides,
  };
}

describe("visual-assets actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BLOB_READ_WRITE_TOKEN = "test-blob-token";
    requireAnyRole.mockResolvedValue(organizerSession());
    assertActorCanManageVisualEvent.mockResolvedValue(undefined);
    blobPut.mockResolvedValue({ url: "https://blob.example.com/event-visuals/event-safe.png" });
    createEventVisualAsset.mockResolvedValue(visualAsset({ status: "ready_for_review" }));
    approveEventVisualAsset.mockResolvedValue(visualAsset());
    rejectEventVisualAsset.mockResolvedValue(visualAsset({ id: "asset-old", status: "rejected" }));
    setEventVisualFocalPoint.mockResolvedValue(visualAsset({ focalX: 1, focalY: 0 }));
  });

  it("requires a session before creating a revision", async () => {
    requireAnyRole.mockResolvedValue(null);

    await expect(
      adminUploadEventVisualAction(fd({ eventId: "event-safe", rightsAttestation: "confirmed", eventVisual: validPngFile() })),
    ).rejects.toThrow("REDIRECT:/login");
    expect(createEventVisualAsset).not.toHaveBeenCalled();
    expect(blobPut).not.toHaveBeenCalled();
  });

  it("refuses uploads without a confirmed rights attestation", async () => {
    await expect(
      adminUploadEventVisualAction(fd({ eventId: "event-safe", eventVisual: validPngFile() })),
    ).rejects.toThrow("REDIRECT:/admin?error=");
    expect(createEventVisualAsset).not.toHaveBeenCalled();
    expect(blobPut).not.toHaveBeenCalled();
  });

  it("rejects spoofed image bytes before anything reaches blob storage", async () => {
    await expect(
      adminUploadEventVisualAction(fd({
        eventId: "event-safe",
        rightsAttestation: "confirmed",
        eventVisual: new File(["<script>alert(1)</script>"], "background.png", { type: "image/png" }),
      })),
    ).rejects.toThrow("REDIRECT:/admin?error=");
    expect(blobPut).not.toHaveBeenCalled();
    expect(createEventVisualAsset).not.toHaveBeenCalled();
  });

  it("refuses uploads for events the organizer does not own without ever calling blob storage or creating a revision", async () => {
    assertActorCanManageVisualEvent.mockRejectedValue(new Error("Not authorized"));

    await expect(
      adminUploadEventVisualAction(fd({ eventId: "event-of-another-organizer", rightsAttestation: "confirmed", eventVisual: validPngFile() })),
    ).rejects.toThrow("REDIRECT:/admin?error=");

    expect(assertActorCanManageVisualEvent).toHaveBeenCalledWith(organizerActor, "event-of-another-organizer");
    expect(blobPut).not.toHaveBeenCalled();
    expect(createEventVisualAsset).not.toHaveBeenCalled();
  });

  it("creates an approved organizer revision with decoded image metadata and activates it", async () => {
    await expect(
      adminUploadEventVisualAction(fd({ eventId: "event-safe", rightsAttestation: "confirmed", eventVisual: validPngFile() })),
    ).rejects.toThrow("REDIRECT:/admin?success=event-visual-uploaded");

    expect(createEventVisualAsset).toHaveBeenCalledWith(
      organizerActor,
      expect.objectContaining({
        eventId: "event-safe",
        source: "organizer_upload",
        status: "approved",
        rightsAttestedAt: expect.any(Date),
        url: "https://blob.example.com/event-visuals/event-safe.png",
        mimeType: "image/png",
        width: 16,
        height: 9,
      }),
    );
    expect(approveEventVisualAsset).toHaveBeenCalledWith(
      organizerActor,
      "event-safe",
      "asset-new",
      { dualWriteLegacyImage: true },
    );
    expect(revalidateTag).toHaveBeenCalledWith("events");
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  }, 15_000);

  it("returns a locale-aware organizer upload to the organizer workspace visual section", async () => {
    await expect(
      organizerUploadEventVisualAction(fd({ eventId: "event-safe", locale: "id", rightsAttestation: "confirmed", eventVisual: validPngFile() })),
    ).rejects.toThrow("REDIRECT:/id/organizer/events/event-safe/overview?success=event-visual-uploaded#section-visuals");
  });

  it("approves a revision and activates it through the service boundary", async () => {
    await expect(
      adminApproveEventVisualAction(fd({ eventId: "event-safe", assetId: "asset-new" })),
    ).rejects.toThrow("REDIRECT:/admin?success=event-visual-approved");

    expect(approveEventVisualAsset).toHaveBeenCalledWith(
      organizerActor,
      "event-safe",
      "asset-new",
      { dualWriteLegacyImage: true },
    );
    expect(revalidateTag).toHaveBeenCalledWith("events");
  });

  it("surfaces the repository guard when rejecting the active revision", async () => {
    rejectEventVisualAsset.mockRejectedValue(new Error("Cannot reject the active visual revision"));

    await expect(
      adminRejectEventVisualAction(fd({ eventId: "event-safe", assetId: "asset-active" })),
    ).rejects.toThrow(`REDIRECT:/admin?error=${encodeURIComponent("Cannot reject the active visual revision")}`);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("activates an older approved revision for rollback", async () => {
    approveEventVisualAsset.mockResolvedValue(visualAsset({ id: "asset-old" }));

    await expect(
      adminActivateEventVisualAction(fd({ eventId: "event-safe", assetId: "asset-old" })),
    ).rejects.toThrow("REDIRECT:/admin?success=event-visual-activated");

    expect(approveEventVisualAsset).toHaveBeenCalledWith(
      organizerActor,
      "event-safe",
      "asset-old",
      { dualWriteLegacyImage: true },
    );
  });

  it("forwards focal values outside 0..1 to the service clamp", async () => {
    await expect(
      adminSetEventVisualFocalPointAction(fd({ eventId: "event-safe", assetId: "asset-new", focalX: "1.4", focalY: "-0.2" })),
    ).rejects.toThrow("REDIRECT:/admin?success=event-visual-focal-updated");

    expect(setEventVisualFocalPoint).toHaveBeenCalledWith(
      organizerActor,
      "event-safe",
      "asset-new",
      { x: 1.4, y: -0.2 },
    );
  });
});
