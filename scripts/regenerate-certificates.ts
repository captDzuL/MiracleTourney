/**
 * Regenerates certificates for all events that have a completed Final match.
 * Deletes existing placeholder/stale certificate records and re-renders the premium template.
 * Run with: pnpm exec tsx scripts/regenerate-certificates.ts
 */

import path from "path";
import fs from "fs";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright-core";

const prisma = new PrismaClient();

// Inline build to avoid Next.js server-action restrictions in script context
async function renderCertificate(eventId: string, winnerTeamId: string): Promise<string> {
  // Dynamic import so tsconfig paths work via tsx
  const { buildCertificateHtml } = await import("../src/lib/certificate/template");
  const { getGameConfig } = await import("../src/lib/platform/config");

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new Error(`Event not found: ${eventId}`);

  const team = await prisma.team.findFirst({ where: { id: winnerTeamId } });
  if (!team) throw new Error(`Team not found: ${winnerTeamId}`);

  const game = getGameConfig(event.gameId);
  const gameName = game.name ?? event.gameId;
  const gameSlug = game.slug ?? event.gameId.replace("game-", "");

  const certCount = await prisma.certificate.count({ where: { team: { eventId: event.id } } }).catch(() => 0);
  const certId = `${gameSlug.toUpperCase().slice(0, 2)}-${new Date().getFullYear()}-${String(certCount + 1).padStart(5, "0")}`;

  const date = new Intl.DateTimeFormat("id-ID", { year: "numeric", month: "long", day: "numeric" }).format(new Date());
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

  const html = await buildCertificateHtml({
    eventName: event.name,
    gameId: event.gameId,
    gameName,
    teamName: team.name,
    accentColor: event.accentColor ?? "#2563eb",
    characterArtUrl: event.characterArtUrl ?? null,
    certId,
    date,
    eventSlug: event.slug,
    baseUrl,
  });

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1080, height: 1920 });
    await page.setContent(html, { waitUntil: "networkidle" });
    const pngBuffer = await page.screenshot({ type: "png", fullPage: false });

    const dir = path.join(process.cwd(), "public", "certificates");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filename = `${eventId}-${winnerTeamId}-${Date.now()}.png`;
    fs.writeFileSync(path.join(dir, filename), pngBuffer);
    const url = `/certificates/${filename}`;
    console.log(`  Saved: public/certificates/${filename} (${Math.round(pngBuffer.length / 1024)} KB)`);
    return url;
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log("🔍 Finding events with completed Final matches...\n");

  const finalMatches = await prisma.match.findMany({
    where: { roundLabel: "Final", winnerTeamId: { not: null } },
    include: { event: true },
  });

  if (!finalMatches.length) {
    console.log("No completed Final matches found.");
    return;
  }

  for (const match of finalMatches) {
    const eventName = match.event.name;
    console.log(`📋 Event: ${eventName}`);

    // Delete existing certificate
    const deleted = await prisma.certificate.deleteMany({ where: { eventId: match.eventId } });
    if (deleted.count > 0) {
      console.log(`  Deleted ${deleted.count} existing certificate(s).`);
    }

    console.log(`  Rendering premium certificate for winner team: ${match.winnerTeamId}...`);
    try {
      const url = await renderCertificate(match.eventId, match.winnerTeamId!);
      await prisma.certificate.create({
        data: { eventId: match.eventId, teamId: match.winnerTeamId!, imageUrl: url },
      });
      console.log(`  ✅ Certificate saved: ${url}\n`);
    } catch (err) {
      console.error(`  ❌ Failed:`, err);
    }
  }

  console.log("Done.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
