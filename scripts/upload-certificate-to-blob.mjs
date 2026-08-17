/**
 * Upload certificate PNG yang sudah ada di public/certificates/ ke Vercel Blob,
 * lalu update row Certificate di DB dengan URL baru.
 *
 * Usage:
 *   BLOB_READ_WRITE_TOKEN=xxx node scripts/upload-certificate-to-blob.mjs
 *
 * Atau taruh BLOB_READ_WRITE_TOKEN di .env lalu:
 *   node scripts/upload-certificate-to-blob.mjs
 */
import { PrismaClient } from "@prisma/client";
import { put } from "@vercel/blob";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env manually if token not set
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  const envPath = path.resolve(__dirname, "../.env");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const [key, ...rest] = line.split("=");
      if (key && rest.length) process.env[key.trim()] = rest.join("=").trim().replace(/^"|"$/g, "");
    }
  }
}

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("❌ BLOB_READ_WRITE_TOKEN tidak ditemukan.");
  console.error("   Set via: BLOB_READ_WRITE_TOKEN=xxx node scripts/upload-certificate-to-blob.mjs");
  console.error("   Atau tambahkan ke .env file.");
  process.exit(1);
}

const prisma = new PrismaClient();

const event = await prisma.event.findFirst({ where: { slug: "mfl-blitz-s1" } });
if (!event) throw new Error("Event mfl-blitz-s1 tidak ditemukan");

// Find the latest local certificate for this event
const certDir = path.resolve(__dirname, "../public/certificates");
const files = fs.readdirSync(certDir)
  .filter(f => f.startsWith(event.id) && f.endsWith(".png"))
  .sort()
  .reverse();

if (files.length === 0) {
  console.error("❌ Tidak ada file certificate lokal ditemukan di public/certificates/");
  process.exit(1);
}

const localFile = files[0];
const localPath = path.join(certDir, localFile);
console.log(`📄 File lokal: ${localFile}`);

const pngBuffer = fs.readFileSync(localPath);
const blobFilename = `certificates/${localFile}`;

console.log(`⏳ Uploading ke Vercel Blob...`);
const result = await put(blobFilename, pngBuffer, { access: "public", contentType: "image/png" });
console.log(`✅ Uploaded: ${result.url}`);

// Update DB Certificate row
const certRow = await prisma.certificate.findUnique({ where: { eventId: event.id } });
if (certRow) {
  await prisma.certificate.update({
    where: { eventId: event.id },
    data: { imageUrl: result.url },
  });
  console.log(`✅ DB Certificate diupdate dengan URL baru.`);
} else {
  console.log(`⚠️  Tidak ada row Certificate di DB — jalankan generate-certificate.ts dulu.`);
}

console.log(`\n🎉 Done! Certificate URL: ${result.url}`);
await prisma.$disconnect();
