/**
 * Pin one event as the homepage featured event, or release the pin.
 *
 *   pnpm exec tsx scripts/set-featured-event.ts list
 *   pnpm exec tsx scripts/set-featured-event.ts pin <event-slug-or-id> [--until 2026-12-31] [--dry-run]
 *   pnpm exec tsx scripts/set-featured-event.ts unpin [--dry-run]
 *
 * A pin wins over the automatic order (stage, live match, slug). Only one event is
 * pinned at a time: pinning a new event releases the old pin. Without a pin the
 * homepage falls back to the automatic order. The homepage cache lasts 30 seconds.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const FEATURED = "featured";
const DEFAULT_PIN_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

const args = process.argv.slice(2);
const command = args[0];
const dryRun = args.includes("--dry-run");
const untilIndex = args.indexOf("--until");
const untilValue = untilIndex >= 0 ? args[untilIndex + 1] : undefined;
const eventRef = args.slice(1).find((arg, index, rest) => !arg.startsWith("--") && rest[index - 1] !== "--until");

function parseUntil(now: Date): Date {
  if (untilIndex < 0) return new Date(now.getTime() + DEFAULT_PIN_DAYS * DAY_MS);
  const parsed = untilValue ? new Date(untilValue) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) throw new Error("--until needs a date, for example 2026-12-31");
  if (parsed.getTime() <= now.getTime()) throw new Error("--until must be in the future");
  return parsed;
}

async function activePins(now: Date) {
  return prisma.eventPromotion.findMany({
    where: { type: FEATURED, active: true, startsAt: { lte: now }, endsAt: { gte: now } },
    include: { event: { select: { id: true, slug: true, name: true, status: true } } },
    orderBy: { createdAt: "asc" },
  });
}

function describePin(pin: Awaited<ReturnType<typeof activePins>>[number]) {
  return `${pin.event.slug} (${pin.event.name}, ${pin.event.status}) until ${pin.endsAt.toISOString()}`;
}

async function list(now: Date) {
  const pins = await activePins(now);
  console.log(pins.length ? `Pinned: ${pins.map(describePin).join("; ")}` : "No pinned event. Homepage uses the automatic order.");
}

async function pin(now: Date) {
  if (!eventRef) throw new Error("Usage: tsx scripts/set-featured-event.ts pin <event-slug-or-id> [--until YYYY-MM-DD] [--dry-run]");
  const event = await prisma.event.findFirst({ where: { OR: [{ id: eventRef }, { slug: eventRef }] }, select: { id: true, slug: true, name: true, status: true } });
  if (!event) throw new Error(`Event not found: ${eventRef}`);
  const endsAt = parseUntil(now);
  const current = await activePins(now);
  console.log(`Pin ${event.slug} (${event.name}, ${event.status}) until ${endsAt.toISOString()}`);
  if (current.length) console.log(`Releases: ${current.map(describePin).join("; ")}`);
  if (dryRun) return console.log("Dry run: nothing written.");
  await prisma.$transaction([
    prisma.eventPromotion.updateMany({ where: { type: FEATURED, active: true }, data: { active: false } }),
    prisma.eventPromotion.create({ data: { eventId: event.id, type: FEATURED, startsAt: now, endsAt, active: true } }),
  ]);
  console.log("Done.");
}

async function unpin(now: Date) {
  const current = await activePins(now);
  console.log(current.length ? `Releases: ${current.map(describePin).join("; ")}` : "No pin to release.");
  if (dryRun || !current.length) return dryRun ? console.log("Dry run: nothing written.") : undefined;
  const released = await prisma.eventPromotion.updateMany({ where: { type: FEATURED, active: true }, data: { active: false } });
  console.log(`Done. Released ${released.count} pin(s).`);
}

async function main() {
  const host = (() => { try { return new URL(process.env.DATABASE_URL ?? "").host; } catch { return "unknown"; } })();
  console.log(`Database host: ${host}`);
  const now = new Date();
  if (command === "list") return list(now);
  if (command === "pin") return pin(now);
  if (command === "unpin") return unpin(now);
  throw new Error("Usage: tsx scripts/set-featured-event.ts <list | pin <event> | unpin> [--until YYYY-MM-DD] [--dry-run]");
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
