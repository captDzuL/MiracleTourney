import fs from "fs";
import path from "path";

import { redirect } from "next/navigation";

const LABEL = "Character art";
const FOLDER = "character-art";
const MAX_CHARACTER_ART_BYTES = 5 * 1024 * 1024;
const ERROR_PATH = "/admin";

function isSafeEntityId(id: string) {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

function getImageExtension(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/webp") return "webp";
  return null;
}

function hasImageSignature(buffer: Buffer, extension: "png" | "jpg" | "webp") {
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

function appendActionError(basePath: string, message: string) {
  const separator = basePath.includes("?") ? "&" : "?";
  return `${basePath}${separator}error=${encodeURIComponent(message)}`;
}

/** Returns true when the bytes are a decodable image (also validates real, non-spoofed content). */
async function readImageDimensions(buffer: Buffer): Promise<{ width: number; height: number } | null> {
  try {
    const sharp = (await import("sharp")).default;
    const metadata = await sharp(buffer).metadata();
    if (!metadata.width || !metadata.height) return null;
    return { width: metadata.width, height: metadata.height };
  } catch {
    return null;
  }
}

export type UploadedCharacterArtAsset = {
  url: string;
  mimeType: string;
};

/**
 * Single validation + storage boundary for event character-art uploads. Checks, in order: entity
 * id shape, presence, byte size, declared MIME, magic bytes, and finally real decodability through
 * `sharp`.
 */
export async function uploadCharacterArtImage({
  file,
  entityId,
}: {
  file: FormDataEntryValue | null;
  entityId: string;
}): Promise<UploadedCharacterArtAsset> {
  if (!isSafeEntityId(entityId)) {
    redirect(appendActionError(ERROR_PATH, `Invalid ${LABEL} ID.`) as never);
  }
  if (!(file instanceof File) || file.size === 0) {
    redirect(appendActionError(ERROR_PATH, `No ${LABEL} file uploaded.`) as never);
  }
  if (file.size > MAX_CHARACTER_ART_BYTES) {
    redirect(appendActionError(ERROR_PATH, `${LABEL} file is too large.`) as never);
  }

  const extension = getImageExtension(file.type);
  if (!extension) {
    redirect(appendActionError(ERROR_PATH, `${LABEL} must be a PNG, JPEG, or WebP image.`) as never);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!hasImageSignature(buffer, extension)) {
    redirect(appendActionError(ERROR_PATH, `${LABEL} file content does not match its image type.`) as never);
  }

  const mimeType = file.type || "image/png";
  const dimensions = await readImageDimensions(buffer);
  if (!dimensions) {
    redirect(appendActionError(ERROR_PATH, `${LABEL} file could not be decoded as an image.`) as never);
  }

  const filename = `${entityId}-${Date.now()}.${extension}`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const result = await put(`${FOLDER}/${filename}`, buffer, { access: "public", contentType: mimeType });
    return { url: result.url, mimeType };
  }

  const dir = path.join(process.cwd(), "public", FOLDER);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), buffer);
  return { url: `/${FOLDER}/${filename}`, mimeType };
}
