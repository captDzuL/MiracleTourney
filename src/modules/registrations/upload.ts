import fs from "node:fs";
import path from "node:path";

import { redirect } from "next/navigation";

function appendActionError(basePath: string, message: string) {
  const separator = basePath.includes("?") ? "&" : "?";
  return `${basePath}${separator}error=${encodeURIComponent(message)}`;
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
      && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
      && buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a;
  }
  if (extension === "jpg") return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  return buffer.length >= 12
    && buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WEBP";
}

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

export async function uploadRegistrationImage(input: {
  file: FormDataEntryValue | null;
  folder: "payment-proofs" | "payment-qris";
  entityId: string;
  label: string;
  maxBytes: number;
  errorPath: string;
}) {
  if (!/^[a-zA-Z0-9_-]+$/.test(input.entityId)) redirect(appendActionError(input.errorPath, `Invalid ${input.label} ID.`) as never);
  if (!(input.file instanceof File) || input.file.size === 0) redirect(appendActionError(input.errorPath, `No ${input.label} file uploaded.`) as never);
  if (input.file.size > input.maxBytes) redirect(appendActionError(input.errorPath, `${input.label} file is too large.`) as never);
  const extension = getImageExtension(input.file.type);
  if (!extension) redirect(appendActionError(input.errorPath, `${input.label} must be a PNG, JPEG, or WebP image.`) as never);
  const buffer = Buffer.from(await input.file.arrayBuffer());
  if (!hasImageSignature(buffer, extension)) redirect(appendActionError(input.errorPath, `${input.label} file content does not match its image type.`) as never);
  const dimensions = await readImageDimensions(buffer);
  if (!dimensions) redirect(appendActionError(input.errorPath, `${input.label} file could not be decoded as an image.`) as never);
  const filename = `${input.entityId}-${Date.now()}.${extension}`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const result = await put(`${input.folder}/${filename}`, buffer, { access: "public", contentType: input.file.type });
    return { url: result.url, mimeType: input.file.type, ...dimensions };
  }
  const dir = path.join(process.cwd(), "public", input.folder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), buffer);
  return { url: `/${input.folder}/${filename}`, mimeType: input.file.type, ...dimensions };
}