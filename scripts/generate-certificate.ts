/**
 * Standalone certificate generator — called by fix-final-and-certificate.mjs via tsx.
 * Can also be run directly:
 *   npx tsx scripts/generate-certificate.ts <eventId> <winnerTeamId>
 */
import { generateCertificate } from "@/lib/certificate/generate";
import { getCertificateByEvent } from "@/lib/platform/repository";

async function main() {
  const [eventId, winnerTeamId] = process.argv.slice(2);

  if (!eventId || !winnerTeamId) {
    console.error("Usage: npx tsx scripts/generate-certificate.ts <eventId> <winnerTeamId>");
    process.exit(1);
  }

  const existing = await getCertificateByEvent(eventId);
  if (existing) {
    console.log(`ℹ️  Certificate sudah ada: ${existing.imageUrl}`);
    console.log("   Hapus row Certificate di DB untuk regenerate.");
    process.exit(0);
  }

  const url = await generateCertificate(eventId, winnerTeamId);
  console.log(`🎉 Certificate generated!`);
  console.log(`📄 URL: ${url}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
