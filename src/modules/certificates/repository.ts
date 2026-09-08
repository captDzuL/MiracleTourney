import fs from "fs";
import path from "path";

import { getGameConfig } from "@/lib/platform/config";
import { prisma } from "@/lib/platform/db";
import type { ActorContext } from "@/modules/identity";
import { ForbiddenError, NotFoundError } from "@/modules/identity";
import { resolveEventAccessScope } from "@/modules/events";

import { launchCertificateBrowser } from "../../lib/certificate/browser";
import { buildCertificateHtml } from "../../lib/certificate/template";

import type { Certificate, CertificateAssetUpdates } from "./types";

/** Longest error message we persist on a failed certificate row. */
const MAX_CERTIFICATE_ERROR_LENGTH = 500;

type CertificateRow = {
  id: string;
  eventId: string;
  teamId: string;
  imageUrl: string;
  status: string;
  lastError: string | null;
  attemptCount: number;
  createdAt: Date;
  updatedAt: Date;
};

function toCertificate(row: CertificateRow): Certificate {
  return {
    id: row.id,
    eventId: row.eventId,
    teamId: row.teamId,
    imageUrl: row.imageUrl,
    status: row.status === "failed" ? "failed" : "ready",
    lastError: row.lastError,
    attemptCount: row.attemptCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Organizer access is scoped to the actor's tenant; only `platform_admin` has
 * global event access. Reuses the events module's access-scope resolver so
 * ownership semantics never drift between the two modules.
 */
export async function assertActorCanManageCertificateEvent(actor: ActorContext | null, eventId: string): Promise<void> {
  const scope = resolveEventAccessScope(actor);

  if (scope.kind === "platform_admin") return;

  if (scope.kind !== "organizer") {
    throw new ForbiddenError("Not authorized");
  }

  const row = await prisma.event.findFirst({
    where: { id: eventId, organizerUserId: scope.organizerUserId },
    select: { id: true },
  });

  if (!row) {
    throw new ForbiddenError("Not authorized");
  }
}

/**
 * Updates character art / accent color for an event's certificate assets.
 *
 * Ownership is enforced at the write itself rather than by a separate
 * preflight-then-write pair: for organizers, the `WHERE` clause only matches
 * rows they own, so a mismatched tenant id updates zero rows and the caller
 * is denied. There is no check-then-write window a race could exploit.
 */
export async function updateCertificateAssetsForActor(
  actor: ActorContext | null,
  eventId: string,
  updates: CertificateAssetUpdates,
): Promise<void> {
  const scope = resolveEventAccessScope(actor);

  if (scope.kind === "platform_admin") {
    await prisma.event.update({ where: { id: eventId }, data: updates });
    return;
  }

  if (scope.kind !== "organizer") {
    throw new ForbiddenError("Not authorized");
  }

  const result = await prisma.event.updateMany({
    where: { id: eventId, organizerUserId: scope.organizerUserId },
    data: updates,
  });

  if (result.count === 0) {
    throw new ForbiddenError("Not authorized");
  }
}

/**
 * Actor-less compatibility surface matching the original legacy contract:
 * the caller is expected to have already checked ownership itself (e.g. an
 * operator-run script). Manager-facing Server Actions in this module use the
 * ownership-scoped `updateCertificateAssetsForActor` instead — never wire
 * this export to a manager-facing Server Action.
 */
export async function updateEventCertificateAssets(eventId: string, updates: CertificateAssetUpdates): Promise<void> {
  await prisma.event.update({ where: { id: eventId }, data: updates });
}

/** Marks an event's certificate as successfully generated, clearing any previous failure. */
export async function recordCertificateSuccess(eventId: string, teamId: string, imageUrl: string): Promise<Certificate> {
  const row = await prisma.certificate.upsert({
    where: { eventId },
    update: { teamId, imageUrl, status: "ready", lastError: null, attemptCount: { increment: 1 } },
    create: { eventId, teamId, imageUrl, status: "ready", lastError: null, attemptCount: 1 },
  });
  return toCertificate(row);
}

/**
 * Records a failed generation attempt so the admin panel can surface the reason and offer a retry.
 * Keeps the row (and its unique eventId slot) so the failure is visible instead of looking like
 * "no certificate yet".
 */
export async function recordCertificateFailure(eventId: string, teamId: string, message: string): Promise<Certificate> {
  const lastError = message.slice(0, MAX_CERTIFICATE_ERROR_LENGTH);
  const row = await prisma.certificate.upsert({
    where: { eventId },
    update: { teamId, status: "failed", lastError, attemptCount: { increment: 1 } },
    create: { eventId, teamId, imageUrl: "", status: "failed", lastError, attemptCount: 1 },
  });
  return toCertificate(row);
}

/** Returns the certificate for an event, or null if none has been generated. */
export async function getCertificateByEvent(eventId: string): Promise<Certificate | null> {
  const row = await prisma.certificate.findUnique({ where: { eventId } });
  if (!row) return null;
  return toCertificate(row);
}

/** Batch-fetches generated certificates for multiple events. */
export async function getCertificatesForEvents(eventIds: string[]): Promise<Map<string, Certificate | null>> {
  const certificates = new Map(eventIds.map((eventId) => [eventId, null as Certificate | null]));
  if (!eventIds.length) return certificates;

  try {
    const rows = await prisma.certificate.findMany({ where: { eventId: { in: eventIds } } });
    for (const row of rows) {
      certificates.set(row.eventId, toCertificate(row));
    }
  } catch {
    await Promise.all(
      eventIds.map(async (eventId) => {
        certificates.set(eventId, await getCertificateByEvent(eventId));
      }),
    );
  }

  return certificates;
}

/**
 * Counts successfully generated certificates for a given game prefix (e.g. "game-flashpeak")
 * to generate sequential IDs. Failed attempts are excluded so the sequence has no gaps.
 */
export async function countCertificatesForGame(gameId: string): Promise<number> {
  return prisma.certificate.count({ where: { status: "ready", event: { gameId } } });
}

async function renderAndStoreCertificate(eventId: string, winnerTeamId: string): Promise<string> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new Error(`Event not found: ${eventId}`);

  // The winner must belong to the same event the certificate is generated for. A team id from a
  // different event (bug, or a manipulated call) must never reach the renderer.
  const team = await prisma.team.findFirst({ where: { id: winnerTeamId, eventId } });
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

/**
 * Core certificate generator — renders HTML via Chromium, uploads the PNG to Vercel Blob (or
 * writes it locally in dev).
 *
 * Any rendering or upload failure is persisted on the certificate row before being rethrown, so
 * the caller (an admin action or the automatic post-match trigger) can see the reason; generation
 * never rolls back the match result that triggered it.
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

/**
 * Generates a certificate for the champion team if the match is the Final and has a winner.
 *
 * A previous *failed* attempt does not block a retry — only a certificate that is already `ready`
 * is treated as done.
 *
 * Internal/system path: not actor-gated. Only ever called from already-authorized match-result
 * Server Actions in `@/lib/actions`, after their own event-ownership check has already passed for
 * the match write itself. Must never be wired directly to a manager-facing Server Action — doing
 * so would bypass certificate authorization entirely.
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
 * Re-renders the champion certificate for an event, replacing whatever is stored. Used to recover
 * from a failed generation or to pick up a new accent color/character art. Skips the
 * `generateCertificateIfFinal` idempotency check by design — that is the entire point of a manual
 * regenerate. The winner lookup is constrained to the authorized event and the Final round only.
 */
export async function regenerateCertificateForActor(actor: ActorContext | null, eventId: string): Promise<string> {
  await assertActorCanManageCertificateEvent(actor, eventId);

  const finalMatch = await prisma.match.findFirst({
    where: { eventId, roundLabel: "Final", winnerTeamId: { not: null } },
    select: { winnerTeamId: true },
  });
  const winnerTeamId = finalMatch?.winnerTeamId;
  if (!winnerTeamId) {
    throw new NotFoundError("Belum ada juara. Simpan hasil match Final terlebih dahulu.");
  }

  return generateCertificate(eventId, winnerTeamId);
}
