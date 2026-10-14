import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const external = vi.hoisted(() => ({ flag: vi.fn(), session: vi.fn(), manage: vi.fn(), deps: vi.fn(), regenerate: vi.fn(), publish: vi.fn(), revalidate: vi.fn(), upload: vi.fn(), createAsset: vi.fn(), rateLimit: vi.fn(), findTeam: vi.fn(), findAsset: vi.fn(), fetch: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: external.revalidate, unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: external.flag }));
vi.mock("@/lib/auth/session", () => ({ requireAnyRole: external.session }));
vi.mock("@/lib/certificate/repository", () => ({
  getCertificateByEvent: vi.fn(),
}));
vi.mock("@/lib/events/visual-repository", () => ({
  createEventVisualAsset: external.createAsset,
}));
vi.mock("@/lib/platform/shared/authz", () => ({
  assertUserCanManageEvent: external.manage,
}));
vi.mock("@/lib/actions/shared/uploads", () => ({ uploadImageAsset: external.upload }));
vi.mock("@/lib/certificate/team-logo-repository", () => ({ findEventTeamLogo: external.findTeam, findApprovedTeamLogoAssetId: external.findAsset }));
vi.mock("@/lib/certificate/studio-repository", () => ({ createPrismaCertificateStudioDependencies: external.deps }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: external.rateLimit }));
vi.mock("@/lib/certificate/service", async (load) => {
  const actual = await load<typeof import("@/lib/certificate/service")>();
  return { ...actual, regenerateCertificate: external.regenerate, publishCertificateSet: external.publish };
});
import { importTeamLogoAsCertificateAssetAction, publishCertificateSetAction, regenerateCertificateAction, uploadCertificateAssetAction } from "./certificate-v3-actions";
import { MIRACLE_V3_CERTIFICATE_TYPES } from "@/lib/certificate/templates/miracle-v3";

const BLOB_LOGO = "https://store1.public.blob.vercel-storage.com/team-logos/team-1-abc-uuid.png";
const PNG_BYTES = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("logo")]);
const PNG_SHA = createHash("sha256").update(PNG_BYTES).digest("hex");
const importInput = { eventId: "event-1", teamId: "team-1" };
const regen = { eventId: "event-1", certificateType: "champion", expectedVersion: 4, idempotencyKey: "11111111-1111-4111-8111-111111111111" };
const publication = { eventId: "event-1", expectedVersion: 4, expectedCertificateRevision: 2, idempotencyKey: "22222222-2222-4222-8222-222222222222", selection: MIRACLE_V3_CERTIFICATE_TYPES.map((certificateType) => ({ certificateType, certificateId: `cert-${certificateType}` })) };

describe("certificate v3 actions", () => {
  beforeEach(() => {
    vi.clearAllMocks(); external.flag.mockReturnValue(true);
    external.session.mockResolvedValue({ id: "org-1", role: "organizer", mustChangePassword: false });
    external.manage.mockResolvedValue(undefined); external.deps.mockReturnValue({});
    external.rateLimit.mockReturnValue(true);
    external.regenerate.mockResolvedValue({ status: "generated", certificateId: "cert-2", certificateType: "champion", version: 2, imageUrl: "/certificates/2.png" });
    external.publish.mockResolvedValue({ status: "published", publicationVersion: 3, publishedAt: "2026-09-12T00:00:00Z" });
    external.upload.mockResolvedValue({ url: "/certificate-assets/a.png", mimeType: "image/png", width: 512, height: 512, byteSize: 1024, storageProvider: "local", storageKey: "certificate-assets/a.png", contentSha256: "a".repeat(64) });
    external.createAsset.mockResolvedValue({ id: "asset-1" });
    external.findTeam.mockResolvedValue({ id: "team-1", name: "Garuda FC", logoUrl: BLOB_LOGO });
    external.findAsset.mockResolvedValue(null);
    external.fetch.mockImplementation(async () => new Response(PNG_BYTES, { status: 200, headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", external.fetch);
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("NODE_ENV", "test");
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it("rejects invalid client input before session or database access", async () => {
    await expect(regenerateCertificateAction({ ...regen, eventId: "" })).resolves.toEqual({ status: "blocked", code: "invalid_input" });
    expect(external.session).not.toHaveBeenCalled();
    await expect(regenerateCertificateAction({ ...regen, eventId: "../secrets" })).resolves.toEqual({ status: "blocked", code: "invalid_input" });
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

  it("rate-limits certificate regeneration and publication before expensive work", async () => {
    external.rateLimit.mockReturnValue(false);

    await expect(regenerateCertificateAction(regen)).resolves.toEqual({ status: "blocked", code: "rate_limited" });
    await expect(publishCertificateSetAction(publication)).resolves.toEqual({ status: "blocked", code: "rate_limited" });
    expect(external.regenerate).not.toHaveBeenCalled();
    expect(external.publish).not.toHaveBeenCalled();
  });
  it("returns the committed certificate publication revision", async () => {
    await expect(publishCertificateSetAction(publication)).resolves.toEqual({ status: "published", revision: 3, publishedAt: "2026-09-12T00:00:00Z" });
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
  it("rate-limits certificate assets before upload or repository creation", async () => {
    external.rateLimit.mockReturnValue(false);
    const form = new FormData();
    form.set("eventId", "event-1");
    form.set("purpose", "certificate_character_art");
    form.set("asset", new File(["png"], "hero.png", { type: "image/png" }));

    await expect(uploadCertificateAssetAction(form)).resolves.toEqual({ status: "blocked", code: "rate_limited" });
    expect(external.upload).not.toHaveBeenCalled();
    expect(external.createAsset).not.toHaveBeenCalled();
  });
  it("returns upload validation errors instead of redirecting or creating an asset row", async () => {
    external.upload.mockRejectedValue(Object.assign(new Error("invalid dimensions"), { name: "ImageUploadValidationError", code: "invalid_dimensions" }));
    const form = new FormData();
    form.set("eventId", "event-1");
    form.set("purpose", "certificate_team_logo");
    form.set("asset", new File(["png"], "logo.png", { type: "image/png" }));
    await expect(uploadCertificateAssetAction(form)).resolves.toEqual({ status: "blocked", code: "invalid_dimensions" });
    expect(external.createAsset).not.toHaveBeenCalled();
    expect(external.revalidate).not.toHaveBeenCalled();
  });

  it("logs upload_failed when the certificate asset action returns its blocked failure shape", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    external.upload.mockRejectedValue(new Error("storage provider detail must not be logged"));
    const form = new FormData();
    form.set("eventId", "event-1");
    form.set("purpose", "certificate_team_logo");
    form.set("asset", new File(["png"], "logo.png", { type: "image/png" }));

    await expect(uploadCertificateAssetAction(form)).resolves.toEqual({ status: "blocked", code: "upload_failed" });

    const records = info.mock.calls.map(([line]) => JSON.parse(String(line)));
    expect(records).toContainEqual(expect.objectContaining({
      operation: "certificate_asset_upload",
      phase: "failed",
      status: 500,
      errorCode: "upload_failed",
    }));
    expect(JSON.stringify(records)).not.toContain("storage provider detail");
  });

  describe("importTeamLogoAsCertificateAssetAction", () => {
    it("rejects malformed input before any session, database, or network access", async () => {
      for (const bad of [null, {}, { eventId: "event-1" }, { eventId: "event-1", teamId: "" }, { eventId: "../x", teamId: "team-1" }, { eventId: "event-1", teamId: "a/b" }, { eventId: "event-1", teamId: 7 }]) {
        await expect(importTeamLogoAsCertificateAssetAction(bad)).resolves.toEqual({ status: "blocked", code: "invalid_input" });
      }
      expect(external.session).not.toHaveBeenCalled();
      expect(external.findTeam).not.toHaveBeenCalled();
      expect(external.fetch).not.toHaveBeenCalled();
    });

    it("reuses the certificate gate for flag, session, password change, and event ownership", async () => {
      external.flag.mockReturnValue(false);
      await expect(importTeamLogoAsCertificateAssetAction(importInput)).resolves.toEqual({ status: "blocked", code: "feature_disabled" });
      external.flag.mockReturnValue(true); external.session.mockResolvedValue(null);
      await expect(importTeamLogoAsCertificateAssetAction(importInput)).resolves.toEqual({ status: "blocked", code: "unauthorized" });
      external.session.mockResolvedValue({ id: "org-1", role: "organizer", mustChangePassword: true });
      await expect(importTeamLogoAsCertificateAssetAction(importInput)).resolves.toEqual({ status: "blocked", code: "password_change_required" });
      external.session.mockResolvedValue({ id: "org-1", role: "organizer", mustChangePassword: false });
      external.manage.mockRejectedValue(new Error("Not authorized"));
      await expect(importTeamLogoAsCertificateAssetAction(importInput)).resolves.toEqual({ status: "blocked", code: "forbidden" });
      expect(external.findTeam).not.toHaveBeenCalled();
      expect(external.fetch).not.toHaveBeenCalled();
      expect(external.upload).not.toHaveBeenCalled();
    });

    it("rate-limits before reading the team or fetching the logo", async () => {
      external.rateLimit.mockReturnValue(false);
      await expect(importTeamLogoAsCertificateAssetAction(importInput)).resolves.toEqual({ status: "blocked", code: "rate_limited" });
      expect(external.findTeam).not.toHaveBeenCalled();
      expect(external.fetch).not.toHaveBeenCalled();
    });

    it("looks the team up inside the authorized event and rejects a team of another event", async () => {
      external.findTeam.mockResolvedValue(null);
      await expect(importTeamLogoAsCertificateAssetAction({ eventId: "event-1", teamId: "team-of-event-2" })).resolves.toEqual({ status: "blocked", code: "team_not_found" });
      expect(external.findTeam).toHaveBeenCalledWith("event-1", "team-of-event-2");
      expect(external.fetch).not.toHaveBeenCalled();
      expect(external.upload).not.toHaveBeenCalled();
      expect(external.createAsset).not.toHaveBeenCalled();
    });

    it.each([
      [null, "logo_missing"],
      ["", "logo_missing"],
      ["https://evil.com/.public.blob.vercel-storage.com/a.png", "logo_unsupported_source"],
      ["http://store1.public.blob.vercel-storage.com/a.png", "logo_unsupported_source"],
      ["/team-logos/../.env", "logo_unsupported_source"],
    ])("blocks a %j logo as %s without fetching or storing", async (logoUrl, code) => {
      external.findTeam.mockResolvedValue({ id: "team-1", name: "Garuda FC", logoUrl });
      await expect(importTeamLogoAsCertificateAssetAction(importInput)).resolves.toEqual({ status: "blocked", code });
      expect(external.fetch).not.toHaveBeenCalled();
      expect(external.upload).not.toHaveBeenCalled();
      expect(external.createAsset).not.toHaveBeenCalled();
    });

    it.each([
      ["a network failure or redirect", () => Promise.reject(new TypeError("fetch failed")), "logo_fetch_failed"],
      ["a missing file", async () => new Response("gone", { status: 404 }), "logo_fetch_failed"],
      ["an html page", async () => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }), "unsupported_type"],
      ["bytes that are not an image", async () => new Response("<html>", { status: 200, headers: { "content-type": "image/png" } }), "unsupported_type"],
      ["an oversized declared length", async () => new Response(PNG_BYTES, { status: 200, headers: { "content-type": "image/png", "content-length": String(6 * 1024 * 1024) } }), "logo_too_large"],
    ])("maps %s to %s without storing anything", async (_label, respond, code) => {
      external.fetch.mockImplementation(respond);
      await expect(importTeamLogoAsCertificateAssetAction(importInput)).resolves.toEqual({ status: "blocked", code });
      expect(external.upload).not.toHaveBeenCalled();
      expect(external.createAsset).not.toHaveBeenCalled();
    });

    it("refuses a logo hosted in another Vercel Blob store than this project's", async () => {
      vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_ourstore_secret123");
      await expect(importTeamLogoAsCertificateAssetAction(importInput)).resolves.toEqual({ status: "blocked", code: "logo_unsupported_source" });
      expect(external.fetch).not.toHaveBeenCalled();
      expect(external.upload).not.toHaveBeenCalled();
      vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_store1_secret123");
      await expect(importTeamLogoAsCertificateAssetAction(importInput)).resolves.toMatchObject({ status: "imported" });
    });

    it("fetches the stored logo without following redirects", async () => {
      await importTeamLogoAsCertificateAssetAction(importInput);
      expect(external.fetch).toHaveBeenCalledTimes(1);
      expect(external.fetch.mock.calls[0][0]).toBe(BLOB_LOGO);
      expect(external.fetch.mock.calls[0][1]).toMatchObject({ redirect: "error" });
    });

    it("returns the existing approved asset for identical bytes and stores nothing", async () => {
      external.findAsset.mockResolvedValue("asset-existing");
      await expect(importTeamLogoAsCertificateAssetAction(importInput)).resolves.toEqual({ status: "imported", assetId: "asset-existing", teamId: "team-1" });
      expect(external.findAsset).toHaveBeenCalledWith("event-1", PNG_SHA);
      expect(external.upload).not.toHaveBeenCalled();
      expect(external.createAsset).not.toHaveBeenCalled();
    });

    it("stores the fetched bytes through the shared upload pipeline and records an approved import", async () => {
      await expect(importTeamLogoAsCertificateAssetAction(importInput)).resolves.toEqual({ status: "imported", assetId: "asset-1", teamId: "team-1" });
      const uploadInput = external.upload.mock.calls[0][0];
      expect(uploadInput).toMatchObject({ folder: "certificate-assets", entityId: "event-1", maxBytes: 5 * 1024 * 1024, minDimension: 32, maxDimension: 4096, validationMode: "throw", validatePixels: true });
      expect(uploadInput.file).toBeInstanceOf(File);
      expect(uploadInput.file.type).toBe("image/png");
      expect(Buffer.from(await uploadInput.file.arrayBuffer())).toEqual(PNG_BYTES);
      expect(external.createAsset).toHaveBeenCalledWith(expect.objectContaining({ id: "org-1" }), expect.objectContaining({
        eventId: "event-1", source: "team_logo_import", status: "approved", purpose: "certificate_team_logo", sourceUrl: BLOB_LOGO,
        storageProvider: "local", storageKey: "certificate-assets/a.png", contentSha256: "a".repeat(64), url: "/certificate-assets/a.png",
      }));
      expect(external.revalidate).toHaveBeenCalledWith("/organizer/events/event-1/certificates");
    });

    it("passes upload validation failures through as typed codes and creates no asset", async () => {
      external.upload.mockRejectedValue(Object.assign(new Error("small"), { name: "ImageUploadValidationError", code: "invalid_dimensions" }));
      await expect(importTeamLogoAsCertificateAssetAction(importInput)).resolves.toEqual({ status: "blocked", code: "invalid_dimensions" });
      external.upload.mockRejectedValue(new Error("blob store exploded"));
      await expect(importTeamLogoAsCertificateAssetAction(importInput)).resolves.toEqual({ status: "blocked", code: "upload_failed" });
      expect(external.createAsset).not.toHaveBeenCalled();
      expect(external.revalidate).not.toHaveBeenCalled();
    });
  });
});
