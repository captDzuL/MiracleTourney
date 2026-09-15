import fs from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";

const blobPut = vi.hoisted(() => vi.fn());
vi.mock("@vercel/blob", () => ({ put: blobPut }));
vi.mock("next/navigation", () => ({ redirect: (url: string): never => { throw new Error(`REDIRECT:${url}`); } }));

import { uploadImageAsset } from "./actions";

async function imageFile(width: number, height: number) {
  const bytes = await sharp({ create: { width, height, channels: 4, background: "#aa8bff" } }).png().toBuffer();
  return { bytes, file: new File([bytes], "asset.png", { type: "image/png" }) };
}

describe("uploadImageAsset immutable storage", () => {
  it.each([
    ["text/plain", "not an image", "unsupported_type"],
    ["image/png", "not an image", "signature_mismatch"],
    ["image/png", "\\x89PNG\\r\\n\\x1a\\n", "decode_failed"],
  ])("rejects QRIS %s invalid content before storage", async (type, content, code) => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    const bytes = content.startsWith("\\x89") ? Buffer.from([137,80,78,71,13,10,26,10]) : Buffer.from(content);
    await expect(uploadImageAsset({ file: new File([bytes], "qris.png", { type }), folder: "event-payment-qris", entityId: "event-1", label: "QRIS", maxBytes: 5 * 1024 * 1024, validationMode: "throw" })).rejects.toMatchObject({ code });
    expect(blobPut).not.toHaveBeenCalled();
  });
  afterEach(() => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    vi.restoreAllMocks();
    blobPut.mockReset();
  });

  it("uses a UUID/content-addressed create-only Blob pathname after decoding dimensions", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    blobPut.mockResolvedValue({ url: "https://store.public.blob.vercel-storage.com/certificate-assets/stored.png" });
    const { bytes, file } = await imageFile(64, 64);
    const result = await uploadImageAsset({ file, folder: "certificate-assets", entityId: "event-1", label: "Certificate asset",
      maxBytes: 5 * 1024 * 1024, minDimension: 32, maxDimension: 4096, validationMode: "throw" });
    const expectedHash = createHash("sha256").update(bytes).digest("hex");
    expect(result.storageKey).toMatch(new RegExp(`^certificate-assets/event-1-${expectedHash}-[0-9a-f-]{36}\\.png$`));
    expect(blobPut).toHaveBeenCalledWith(result.storageKey, expect.any(Buffer), {
      access: "public", contentType: "image/png", addRandomSuffix: false, allowOverwrite: false,
    });
    expect(result).toMatchObject({ width: 64, height: 64, contentSha256: expectedHash });
  });

  it("rejects decoded dimensions before Blob storage", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    const { file } = await imageFile(16, 16);
    await expect(uploadImageAsset({ file, folder: "certificate-assets", entityId: "event-1", label: "Certificate asset",
      maxBytes: 5 * 1024 * 1024, minDimension: 32, maxDimension: 4096, validationMode: "throw" })).rejects.toMatchObject({ name: "ImageUploadValidationError", code: "invalid_dimensions" });
    expect(blobPut).not.toHaveBeenCalled();
  });

  it("uses an exclusive local write and fails safely on a pathname collision", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    const collision = Object.assign(new Error("exists"), { code: "EEXIST" });
    const write = vi.spyOn(fs, "writeFileSync").mockImplementation(() => { throw collision; });
    const { file } = await imageFile(64, 64);
    await expect(uploadImageAsset({ file, folder: "certificate-assets", entityId: "event-1", label: "Certificate asset",
      maxBytes: 5 * 1024 * 1024, minDimension: 32, maxDimension: 4096, validationMode: "throw" })).rejects.toBe(collision);
    expect(write).toHaveBeenCalledWith(expect.any(String), expect.any(Buffer), { flag: "wx" });
    expect(write).toHaveBeenCalledTimes(1);
  });
});
