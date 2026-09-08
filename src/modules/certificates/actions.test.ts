import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAnyRole,
  redirectToActiveLocale,
  revalidatePath,
  checkRateLimit,
  blobPut,
  assertActorCanManageCertificateEvent,
  updateCertificateAssets,
  regenerateCertificate,
} = vi.hoisted(() => ({
  requireAnyRole: vi.fn(),
  redirectToActiveLocale: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
  revalidatePath: vi.fn(),
  checkRateLimit: vi.fn(),
  blobPut: vi.fn(),
  assertActorCanManageCertificateEvent: vi.fn(),
  updateCertificateAssets: vi.fn(),
  regenerateCertificate: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireAnyRole }));
vi.mock("@/i18n/redirect", () => ({ redirectToActiveLocale }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit }));
vi.mock("@vercel/blob", () => ({ put: blobPut }));
vi.mock("./service", () => ({
  assertActorCanManageCertificateEvent,
  updateCertificateAssets,
  regenerateCertificate,
}));

import {
  adminRegenerateCertificateAction,
  adminSetAccentColorAction,
  adminUploadCharacterArtAction,
} from "./actions";

function fd(pairs: Record<string, string | File>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(pairs)) f.set(k, v);
  return f;
}

/** A real 16×9 PNG so `sharp` can decode it and report genuine dimensions. */
function validPngFile(name = "art.png") {
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

describe("certificates actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BLOB_READ_WRITE_TOKEN = "test-blob-token";
    requireAnyRole.mockResolvedValue(organizerSession());
    assertActorCanManageCertificateEvent.mockResolvedValue(undefined);
    checkRateLimit.mockReturnValue(true);
    blobPut.mockResolvedValue({ url: "https://blob.example.com/character-art/event-safe.png" });
    updateCertificateAssets.mockResolvedValue(undefined);
    regenerateCertificate.mockResolvedValue("https://blob.example.com/certificates/event-safe.png");
  });

  describe("adminUploadCharacterArtAction", () => {
    it("requires a session", async () => {
      requireAnyRole.mockResolvedValue(null);
      await expect(
        adminUploadCharacterArtAction(fd({ eventId: "event-safe", characterArt: validPngFile() })),
      ).rejects.toThrow("REDIRECT:/login");
      expect(updateCertificateAssets).not.toHaveBeenCalled();
    });

    it("checks ownership before ever touching Blob storage, for an event the organizer does not own", async () => {
      assertActorCanManageCertificateEvent.mockRejectedValue(new Error("Not authorized"));

      await expect(
        adminUploadCharacterArtAction(fd({ eventId: "event-of-another-organizer", characterArt: validPngFile() })),
      ).rejects.toThrow("REDIRECT:/admin?error=");

      expect(assertActorCanManageCertificateEvent).toHaveBeenCalledWith(organizerActor, "event-of-another-organizer");
      expect(blobPut).not.toHaveBeenCalled();
      expect(updateCertificateAssets).not.toHaveBeenCalled();
    });

    it("rejects spoofed image bytes before anything reaches blob storage or persistence", async () => {
      await expect(
        adminUploadCharacterArtAction(fd({
          eventId: "event-safe",
          characterArt: new File(["<script>alert(1)</script>"], "art.png", { type: "image/png" }),
        })),
      ).rejects.toThrow("REDIRECT:/admin?error=");

      expect(blobPut).not.toHaveBeenCalled();
      expect(updateCertificateAssets).not.toHaveBeenCalled();
    });

    it("rejects unsafe event IDs before building a local file path", async () => {
      await expect(
        adminUploadCharacterArtAction(fd({ eventId: "../outside", characterArt: validPngFile() })),
      ).rejects.toThrow("REDIRECT:/admin?error=");
      expect(updateCertificateAssets).not.toHaveBeenCalled();
    });

    it("uploads to Blob and persists the character art url for an owned event", async () => {
      await expect(
        adminUploadCharacterArtAction(fd({ eventId: "event-safe", characterArt: validPngFile() })),
      ).rejects.toThrow("REDIRECT:/admin?success=character-art-uploaded");

      expect(updateCertificateAssets).toHaveBeenCalledWith(
        organizerActor,
        "event-safe",
        { characterArtUrl: "https://blob.example.com/character-art/event-safe.png" },
      );
      expect(revalidatePath).toHaveBeenCalledWith("/admin");
    }, 15_000);
  });

  describe("adminSetAccentColorAction", () => {
    it("requires a session", async () => {
      requireAnyRole.mockResolvedValue(null);
      await expect(
        adminSetAccentColorAction(fd({ eventId: "event-safe", accentColor: "#ff0000" })),
      ).rejects.toThrow("REDIRECT:/login");
      expect(updateCertificateAssets).not.toHaveBeenCalled();
    });

    it("denies an organizer setting the accent color for another organizer's event", async () => {
      assertActorCanManageCertificateEvent.mockRejectedValue(new Error("Not authorized"));

      await expect(
        adminSetAccentColorAction(fd({ eventId: "event-of-another-organizer", accentColor: "#ff0000" })),
      ).rejects.toThrow(`REDIRECT:/admin?error=${encodeURIComponent("Not authorized")}`);
      expect(updateCertificateAssets).not.toHaveBeenCalled();
    });

    it("updates the accent color through the ownership-scoped service call", async () => {
      await expect(
        adminSetAccentColorAction(fd({ eventId: "event-safe", accentColor: "#16a34a" })),
      ).rejects.toThrow("REDIRECT:/admin?success=accent-color-saved");

      expect(updateCertificateAssets).toHaveBeenCalledWith(organizerActor, "event-safe", { accentColor: "#16a34a" });
    });
  });

  describe("adminRegenerateCertificateAction", () => {
    it("requires a session", async () => {
      requireAnyRole.mockResolvedValue(null);
      await expect(
        adminRegenerateCertificateAction(fd({ eventId: "event-safe" })),
      ).rejects.toThrow("REDIRECT:/login");
      expect(regenerateCertificate).not.toHaveBeenCalled();
    });

    it("denies an organizer regenerating another organizer's certificate before checking the rate limit", async () => {
      assertActorCanManageCertificateEvent.mockRejectedValue(new Error("Not authorized"));

      await expect(
        adminRegenerateCertificateAction(fd({ eventId: "event-of-another-organizer" })),
      ).rejects.toThrow(`REDIRECT:/admin?error=${encodeURIComponent("Not authorized")}`);

      expect(checkRateLimit).not.toHaveBeenCalled();
      expect(regenerateCertificate).not.toHaveBeenCalled();
    });

    it("rate limits to 3 attempts per event per 5 minutes", async () => {
      checkRateLimit.mockReturnValue(false);

      await expect(
        adminRegenerateCertificateAction(fd({ eventId: "event-safe" })),
      ).rejects.toThrow("REDIRECT:/admin?error=");

      expect(checkRateLimit).toHaveBeenCalledWith("cert-regen:event-safe", 3, 5 * 60 * 1000);
      expect(regenerateCertificate).not.toHaveBeenCalled();
    });

    it("regenerates for an owned event's Final winner and redirects with success", async () => {
      await expect(
        adminRegenerateCertificateAction(fd({ eventId: "event-safe" })),
      ).rejects.toThrow("REDIRECT:/admin?success=certificate-regenerated");

      expect(regenerateCertificate).toHaveBeenCalledWith(organizerActor, "event-safe");
      expect(revalidatePath).toHaveBeenCalledWith("/admin");
    });

    it("surfaces the missing-winner error from the service and revalidates before redirecting", async () => {
      regenerateCertificate.mockRejectedValue(new Error("Belum ada juara. Simpan hasil match Final terlebih dahulu."));

      await expect(
        adminRegenerateCertificateAction(fd({ eventId: "event-safe" })),
      ).rejects.toThrow(`REDIRECT:/admin?error=${encodeURIComponent("Belum ada juara. Simpan hasil match Final terlebih dahulu.")}`);

      expect(revalidatePath).toHaveBeenCalledWith("/admin");
    });
  });
});
