// Image upload pipeline shared by the server actions: validation, storage and the errors it raises.
// Plain module on purpose: not a server action file, so callers outside actions.ts can use it without importing actions.ts.
// Moved out of actions.ts without changes (refactor PR 1.5).

import { isSafeEntityId } from "./ids";
import { withServerActionLog } from "@/lib/observability/logger";
import fs from "fs";
import { redirect } from "next/navigation";
import { createHash, randomUUID } from "node:crypto";
import path from "path";

export function getImageExtension(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/webp") return "webp";
  return null;
}

export function hasImageSignature(buffer: Buffer, extension: "png" | "jpg" | "webp") {
  if (extension === "png") {
    return buffer.length >= 8
      && buffer[0] === 0x89
      && buffer[1] === 0x50
      && buffer[2] === 0x4e
      && buffer[3] === 0x47
      && buffer[4] === 0x0d
      && buffer[5] === 0x0a
      && buffer[6] === 0x1a
      && buffer[7] === 0x0a;
  }
  if (extension === "jpg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  return buffer.length >= 12
    && buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WEBP";
}

export type UploadedImageAsset = {
  url: string;
  mimeType: string;
  width: number;
  height: number;
  byteSize: number;
  storageProvider: "vercel_blob" | "local";
  storageKey: string;
  contentSha256: string;
};

export function appendActionError(basePath: string, message: string) {
  const separator = basePath.includes("?") ? "&" : "?";
  return `${basePath}${separator}error=${encodeURIComponent(message)}`;
}

export type ImageUploadValidationCode =
  | "invalid_entity_id" | "missing_file" | "file_too_large" | "unsupported_type"
  | "signature_mismatch" | "decode_failed" | "invalid_dimensions";

export class ImageUploadValidationError extends Error {
  readonly code: ImageUploadValidationCode;
  constructor(code: ImageUploadValidationCode, message: string) {
    super(message);
    this.name = "ImageUploadValidationError";
    this.code = code;
  }
}

export function rejectImageUpload(code: ImageUploadValidationCode, message: string, validationMode: "redirect" | "throw", errorPath: string): never {
  if (validationMode === "throw") throw new ImageUploadValidationError(code, message);
  redirect(appendActionError(errorPath, message) as never);
}

/**
 * Single validation + storage boundary for every admin image upload.
 * Checks, in order: entity id shape, presence, byte size, declared MIME,
 * magic bytes, and image dimensions through `sharp`. Callers can opt into
 * full pixel decoding before storage to reject truncated image payloads.
 */
// The only places an upload may be stored. The folder becomes part of the storage path, so it must never come from
// user input; the type keeps callers honest and the check below stops anything that slips through a cast.
export const UPLOAD_FOLDERS = [
  "bracket-backgrounds",
  "certificate-assets",
  "character-art",
  "event-backgrounds",
  "event-logos",
  "event-payment-qris",
  "event-revision-backgrounds",
  "event-revision-logos",
  "payment-proofs",
  "payment-qris",
  "team-logos",
] as const;
export type UploadFolder = (typeof UPLOAD_FOLDERS)[number];

export type UploadImageAssetInput = {
  file: FormDataEntryValue | null;
  folder: UploadFolder;
  entityId: string;
  label: string;
  maxBytes: number;
  minDimension?: number;
  maxDimension?: number;
  validatePixels?: boolean;
  validationMode?: "redirect" | "throw";
  errorPath?: string;
};

export async function uploadImageAssetImpl({
  file,
  folder,
  entityId,
  label,
  maxBytes,
  minDimension,
  maxDimension,
  validatePixels = false,
  validationMode = "redirect",
  errorPath = "/admin",
}: UploadImageAssetInput): Promise<UploadedImageAsset> {
  if (!(UPLOAD_FOLDERS as readonly string[]).includes(folder)) {
    throw new Error(`Unknown upload folder: ${String(folder)}`);
  }
  if (!isSafeEntityId(entityId)) {
    rejectImageUpload("invalid_entity_id", `Invalid ${label} ID.`, validationMode, errorPath);
  }
  if (!(file instanceof File) || file.size === 0) {
    rejectImageUpload("missing_file", `No ${label} file uploaded.`, validationMode, errorPath);
  }
  if (file.size > maxBytes) {
    rejectImageUpload("file_too_large", `${label} file is too large.`, validationMode, errorPath);
  }

  const extension = getImageExtension(file.type);
  if (!extension) {
    rejectImageUpload("unsupported_type", `${label} must be a PNG, JPEG, or WebP image.`, validationMode, errorPath);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentSha256 = createHash("sha256").update(buffer).digest("hex");
  if (!hasImageSignature(buffer, extension)) {
    rejectImageUpload("signature_mismatch", `${label} file content does not match its image type.`, validationMode, errorPath);
  }

  const mimeType = file.type || "image/png";
  const dimensions = await readImageDimensions(buffer, validatePixels);
  if (!dimensions) {
    rejectImageUpload("decode_failed", `${label} file could not be decoded as an image.`, validationMode, errorPath);
  }
  if ((minDimension !== undefined && (dimensions.width < minDimension || dimensions.height < minDimension))
    || (maxDimension !== undefined && (dimensions.width > maxDimension || dimensions.height > maxDimension))) {
    rejectImageUpload("invalid_dimensions", `${label} dimensions are outside the allowed range.`, validationMode, errorPath);
  }

  const filename = `${entityId}-${contentSha256}-${randomUUID()}.${extension}`;
  const storageKey = folder + "/" + filename;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const result = await put(`${folder}/${filename}`, buffer, {
      access: "public",
      contentType: mimeType,
      addRandomSuffix: false,
      allowOverwrite: false,
    });
    return { url: result.url, mimeType, ...dimensions, byteSize: file.size, storageProvider: "vercel_blob", storageKey, contentSha256 };
  }

  const dir = path.join(process.cwd(), "public", folder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), buffer, { flag: "wx" });
  return { url: "/" + storageKey, mimeType, ...dimensions, byteSize: file.size, storageProvider: "local", storageKey, contentSha256 };
}

export async function uploadImageAsset(input: UploadImageAssetInput): Promise<UploadedImageAsset> {
  return withServerActionLog("image_upload", "/server-actions/image-upload", () => uploadImageAssetImpl(input));
}

/** Returns image dimensions, optionally requiring all pixels to decode, or null on failure. */
export async function readImageDimensions(buffer: Buffer, validatePixels = false): Promise<{ width: number; height: number } | null> {
  try {
    const sharp = (await import("sharp")).default;
    const metadata = await sharp(buffer).metadata();
    if (!metadata.width || !metadata.height) return null;
    if (validatePixels) await sharp(buffer, { failOn: "error" }).stats();
    return { width: metadata.width, height: metadata.height };
  } catch {
    return null;
  }
}
