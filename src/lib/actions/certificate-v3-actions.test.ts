import { beforeEach, describe, expect, it, vi } from "vitest";
const external = vi.hoisted(() => ({ flag: vi.fn(), session: vi.fn(), manage: vi.fn(), deps: vi.fn(), regenerate: vi.fn(), publish: vi.fn(), revalidate: vi.fn(), upload: vi.fn(), createAsset: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: external.revalidate }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: external.flag }));
vi.mock("@/lib/auth/session", () => ({ requireAnyRole: external.session }));
vi.mock("@/lib/platform/repository", () => ({ assertUserCanManageEvent: external.manage, createEventVisualAsset: external.createAsset, getCertificateByEvent: vi.fn() }));
vi.mock("@/lib/actions", () => ({ uploadImageAsset: external.upload }));
vi.mock("@/lib/certificate/studio-repository", () => ({ createPrismaCertificateStudioDependencies: external.deps }));
vi.mock("@/lib/certificate/service", async (load) => {
  const actual = await load<typeof import("@/lib/certificate/service")>();
  return { ...actual, regenerateCertificate: external.regenerate, publishCertificateSet: external.publish };
});
import { publishCertificateSetAction, regenerateCertificateAction, uploadCertificateAssetAction } from "./certificate-v3-actions";
import { MIRACLE_V3_CERTIFICATE_TYPES } from "@/lib/certificate/templates/miracle-v3";

const regen = { eventId: "event-1", certificateType: "champion", expectedVersion: 4, idempotencyKey: "11111111-1111-4111-8111-111111111111" };
const publication = { eventId: "event-1", expectedVersion: 4, expectedCertificateRevision: 2, idempotencyKey: "22222222-2222-4222-8222-222222222222", selection: MIRACLE_V3_CERTIFICATE_TYPES.map((certificateType) => ({ certificateType, certificateId: `cert-${certificateType}` })) };

describe("certificate v3 actions", () => {
  beforeEach(() => {
    vi.clearAllMocks(); external.flag.mockReturnValue(true);
    external.session.mockResolvedValue({ id: "org-1", role: "organizer", mustChangePassword: false });
    external.manage.mockResolvedValue(undefined); external.deps.mockReturnValue({});
    external.regenerate.mockResolvedValue({ status: "generated", certificateId: "cert-2", certificateType: "champion", version: 2, imageUrl: "/certificates/2.png" });
    external.publish.mockResolvedValue({ status: "published", publicationVersion: 3, publishedAt: "2026-09-12T00:00:00Z" });
  });
    external.upload.mockResolvedValue({ url: "/certificate-assets/a.png", mimeType: "image/png", width: 512, height: 512, byteSize: 1024, storageProvider: "local", storageKey: "certificate-assets/a.png", contentSha256: "a".repeat(64) });
    external.createAsset.mockResolvedValue({ id: "asset-1" });
  it("rejects invalid client input before session or database access", async () => {
    await expect(regenerateCertificateAction({ ...regen, eventId: "" })).resolves.toEqual({ status: "blocked", code: "invalid_input" });
    expect(external.session).not.toHaveBeenCalled();
  });
  it("enforces flag, session, password gate, and event ownership", async () => {
    external.flag.mockReturnValue(false);
    await expect(regenerateCertificateAction(regen)).resolves.toEqual({ status: "blocked", code: "feature_disabled" });
    external.flag.mockReturnValue(true); external.session.mockResolvedValue(null);
    await expect(regenerateCertificateAction(regen)).resolves.toEqual({ status: "blocked", code: "unauthorized" });
    external.session.mockResolvedValue({ id: "org-1", role: "organizer", mustChangePassword: true });
    await expect(regenerateCertificateAction(regen)).resolves.toEqual({ status: "blocked", code: "password_change_required" });
    external.session.mockResolvedValue({ id: "org-1", role: "organizer", mustChangePassword: false });
    external.manage.mockRejectedValue(new Error("Not authorized"));
    await expect(regenerateCertificateAction(regen)).resolves.toEqual({ status: "blocked", code: "forbidden" });
  });
  it("passes only validated publication input into the server-owned dependency adapter", async () => {
    await expect(publishCertificateSetAction(publication)).resolves.toMatchObject({ status: "published" });
    expect(external.manage).toHaveBeenCalledWith(expect.objectContaining({ id: "org-1" }), "event-1");
    expect(external.publish).toHaveBeenCalledWith(publication, {});
    expect(external.revalidate).toHaveBeenCalledWith("/organizer/events/event-1/certificates");
  });
  it("stores an uploaded certificate asset with trusted provenance and an explicit role", async () => {
    const form = new FormData();
    form.set("eventId", "event-1");
    form.set("purpose", "certificate_character_art");
    form.set("asset", new File(["png"], "hero.png", { type: "image/png" }));
    await expect(uploadCertificateAssetAction(form)).resolves.toEqual({ status: "uploaded", assetId: "asset-1" });
    expect(external.upload).toHaveBeenCalledWith(expect.objectContaining({ folder: "certificate-assets", entityId: "event-1" }));
    expect(external.createAsset).toHaveBeenCalledWith(expect.objectContaining({ id: "org-1" }), expect.objectContaining({
      eventId: "event-1", status: "approved", purpose: "certificate_character_art",
      storageProvider: "local", storageKey: "certificate-assets/a.png", contentSha256: "a".repeat(64),
    }));
    expect(external.revalidate).toHaveBeenCalledWith("/organizer/events/event-1/certificates");
  });
});
