import fs from "fs";
import path from "path";

import { getGameConfig } from "@/lib/platform/config";
import {
  countCertificatesForGame,
  getCertificateByEvent,
  getLeaderboardForEvent,
  recordCertificateFailure,
  recordCertificateSuccess,
} from "@/lib/platform/repository";
import { prisma } from "@/lib/platform/db";
import { launchCertificateBrowser } from "./browser";
import { resolveMvpForCertificate } from "./mvp";
import { renderCertificatePng } from "./renderer";
import { buildCertificateHtml } from "./template";
import { buildMiracleV3CertificateHtml, getMiracleV3CertificateFingerprint, type MiracleV3CertificateData } from "./templates/miracle-v3";

export interface MiracleV3CertificateRenderRequest { readonly data: MiracleV3CertificateData }
export type MiracleV3CertificateIdentity = Readonly<Pick<MiracleV3CertificateData, "certificateId" | "eventId" | "certificateType" | "recipientId" | "version">>;
export interface MiracleV3GenerationDependencies {
  /** Atomically claim the exact draft version, or return its existing immutable asset.
   * The repository must prevent publication during a claim and allocate a unique attemptId.
   * Task 6 supplies the durable adapter; there is intentionally no default here. */
  claimGeneration(identity: MiracleV3CertificateIdentity): Promise<
    { status: "claimed"; attemptId: string } | { status: "ready" | "published"; imageUrl: string }
  >;
  render?: (html: string) => Promise<Buffer>;
  /** Must enforce create-only storage, including on retry/concurrent execution. */
  storeArtifact(artifact: { filename: string; png: Buffer; overwrite: false }): Promise<string>;
  /** Both writes must compare the identity and active attempt; never update a published row. */
  recordSuccess(result: { identity: MiracleV3CertificateIdentity; attemptId: string; imageUrl: string; fingerprint: string }): Promise<void>;
  recordFailure(result: { identity: MiracleV3CertificateIdentity; attemptId: string; message: string }): Promise<void>;
}

/** Render one claimed certificate version; set orchestration and publication live in Task 6. */
export async function generateMiracleV3Certificate(
  request: MiracleV3CertificateRenderRequest,
  dependencies: MiracleV3GenerationDependencies,
): Promise<string> {
  // Snapshot caller-owned data before the first asynchronous operation.
  const data = { ...request.data, branding: { ...request.data.branding } };
  const fingerprint = getMiracleV3CertificateFingerprint(data);
  const identity: MiracleV3CertificateIdentity = Object.freeze({
    certificateId: data.certificateId, eventId: data.eventId, certificateType: data.certificateType,
    recipientId: data.recipientId, version: data.version,
  });
  const claim = await dependencies.claimGeneration(identity);
  if (claim.status !== "claimed") return claim.imageUrl;
  try {
    if (!claim.attemptId.trim()) throw new Error("Generation claim requires an attempt ID");
    const html = await buildMiracleV3CertificateHtml(data);
    const png = await (dependencies.render ?? renderCertificatePng)(html);
    const segment = (value: string) => /^\.+$/.test(value) ? value.replace(/\./g, "%2E") : encodeURIComponent(value);
    const filename = `certificates/${segment(data.eventId)}/${data.certificateType}/${segment(data.recipientId)}/v${data.version}/${segment(claim.attemptId)}.png`;
    const imageUrl = await dependencies.storeArtifact({ filename, png, overwrite: false });
    await dependencies.recordSuccess({ identity, attemptId: claim.attemptId, imageUrl, fingerprint });
    return imageUrl;
  } catch (error) {
    try {
      await dependencies.recordFailure({ identity, attemptId: claim.attemptId, message: error instanceof Error ? error.message : "Certificate generation failed" });
    } catch (persistenceError) {
      console.error("Certificate failure persistence failed", { ...identity, attemptId: claim.attemptId, error: persistenceError });
    }
    throw error;
  }
}

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
    try {
      await recordCertificateFailure(eventId, winnerTeamId, message);
    } catch (persistenceError) {
      console.error("Certificate failure persistence failed", { eventId, winnerTeamId, error: persistenceError });
    }
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

  // Manually uploaded character art (admin panel) always wins over the auto-picked MVP portrait.
  let mvp = null;
  if (!event.characterArtUrl) {
    const leaderboard = await getLeaderboardForEvent(eventId, event.gameId);
    mvp = resolveMvpForCertificate(event.gameId, leaderboard, winnerTeamId);
  }

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
    mvpArtUrl: mvp?.url ?? null,
    mvpName: mvp?.name ?? null,
    mvpRoleLabel: mvp?.roleLabel ?? null,
  });

  // Reuse the renderer's PNG conversion and cleanup with the origin launch policy.
  // The launcher returns Playwright on every host, including Vercel/Lambda.
  const pngBuffer = await renderCertificatePng(html, {
    isVercel: false,
    loadPlaywrightChromium: async () => ({
      launch: async () => {
        const browser = await launchCertificateBrowser();
        return {
          newPage: async () => {
            const page = await browser.newPage();
            return {
              setViewportSize: (viewport) => page.setViewportSize(viewport),
              // Bound font loading so a slow CDN leaves time to persist a retryable failure.
              setContent: (content, options) => page.setContent(content, { ...options, timeout: 20_000 }),
              screenshot: (options) => page.screenshot(options),
            };
          },
          close: () => browser.close(),
        };
      },
    }),
  });

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
}
