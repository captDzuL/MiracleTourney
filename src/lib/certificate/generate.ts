import fs from "fs";
import path from "path";

import { getGameConfig } from "@/lib/platform/config";
import {
  countCertificatesForGame,
  getCertificateByEvent,
  recordCertificateFailure,
  recordCertificateSuccess,
} from "@/lib/platform/repository";
import { prisma } from "@/lib/platform/db";
import { launchCertificateBrowser } from "./browser";
import { buildCertificateHtml } from "./template";

/**
 * Generates a certificate for the champion team if the match is the Final and has a winner.
 *
 * A previous *failed* attempt does not block a retry — only a certificate that is already
 * `ready` is treated as done.
 */
export async function generateCertificateIfFinal(matchId: string, eventId: string): Promise<void> {
  const match = await prisma.match.findFirst({ where: { id: matchId, eventId } });
  if (!match || !match.winnerTeamId) return;
  if (match.roundLabel !== "Final") return;

  const existing = await getCertificateByEvent(eventId);
  if (existing?.status === "ready") return;

  await generateCertificate(eventId, match.winnerTeamId);
}

/**
 * Core certificate generator — renders HTML via Chromium, uploads the PNG to Vercel Blob.
 *
 * Any rendering or upload failure is persisted on the certificate row before being rethrown, so
 * the admin panel can show the reason and offer a retry.
 */
export async function generateCertificate(eventId: string, winnerTeamId: string): Promise<string> {
  try {
    return await renderAndStoreCertificate(eventId, winnerTeamId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Certificate generation failed";
    await recordCertificateFailure(eventId, winnerTeamId, message);
    throw err;
  }
}

async function renderAndStoreCertificate(eventId: string, winnerTeamId: string): Promise<string> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new Error(`Event not found: ${eventId}`);

  const team = await prisma.team.findFirst({ where: { id: winnerTeamId } });
  if (!team) throw new Error(`Team not found: ${winnerTeamId}`);

  const game = getGameConfig(event.gameId);
  const gameName = game.name ?? event.gameId;
  const gameSlug = game.slug ?? event.gameId.replace("game-", "");

  const certCount = await countCertificatesForGame(event.gameId);
  const certId = `${gameSlug.toUpperCase().slice(0, 2)}-${new Date().getFullYear()}-${String(certCount + 1).padStart(5, "0")}`;

  const date = new Intl.DateTimeFormat("id-ID", { year: "numeric", month: "long", day: "numeric" }).format(new Date());
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://miracle-league.fun";

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

  const browser = await launchCertificateBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1080, height: 1920 });
    // The template pulls webfonts from Google Fonts, so "networkidle" is what guarantees the
    // poster is fully styled before the screenshot. Bound it explicitly: the default 30s would
    // eat the whole function budget on a slow font CDN, and failing fast lets the admin retry
    // instead of the request being killed with nothing recorded.
    await page.setContent(html, { waitUntil: "networkidle", timeout: 20_000 });
    const pngBuffer = await page.screenshot({ type: "png", fullPage: false });

    let url: string;
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const filename = `certificates/${eventId}-${winnerTeamId}-${Date.now()}.png`;
      const { put } = await import("@vercel/blob");
      const result = await put(filename, pngBuffer, { access: "public", contentType: "image/png" });
      url = result.url;
    } else {
      // Local dev fallback: write to public/certificates/
      const dir = path.join(process.cwd(), "public", "certificates");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const filename = `${eventId}-${winnerTeamId}-${Date.now()}.png`;
      fs.writeFileSync(path.join(dir, filename), pngBuffer);
      url = `/certificates/${filename}`;
    }

    await recordCertificateSuccess(eventId, winnerTeamId, url);
    return url;
  } finally {
    await browser.close();
  }
}
