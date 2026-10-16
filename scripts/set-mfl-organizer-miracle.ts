/**
 * Make old MFL events belong to the platform ("Miracle") and mark the organizer as trusted.
 *
 *   pnpm exec tsx --env-file=<env file> scripts/set-mfl-organizer-miracle.ts                  # DRY RUN, slugs starting with "mfl"
 *   pnpm exec tsx --env-file=<env file> scripts/set-mfl-organizer-miracle.ts mfl-s3 <slug>    # named events (slug or id)
 *   pnpm exec tsx --env-file=<env file> scripts/set-mfl-organizer-miracle.ts --apply
 *
 * Per event it sets organizerUserId = NULL (platform-owned: shown as "Miracle" and verified on the public pages),
 * organizerName = "Miracle" and organizerVerified = true. Admin and platform_admin accounts can still manage
 * and complete these events; organizer accounts no longer see them. Nothing else is touched.
 */
import { PrismaClient } from "@prisma/client";

const PLATFORM_ORGANIZER_NAME = "Miracle";
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const unknownFlags = args.filter((arg) => arg.startsWith("--") && arg !== "--apply");
const refs = args.filter((arg) => !arg.startsWith("--"));

const prisma = new PrismaClient();

const selection = {
  id: true, slug: true, name: true, organizerUserId: true, organizerName: true, organizerVerified: true,
} as const;

function databaseHost(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? "").host || "(unknown)";
  } catch {
    return "(unset or unreadable)";
  }
}

const describe = (event: { organizerUserId: string | null; organizerName: string | null; organizerVerified: boolean }) =>
  `owner=${event.organizerUserId ?? "NULL"} name=${event.organizerName ?? "NULL"} verified=${event.organizerVerified}`;

const alreadyPlatformOwned = (event: { organizerUserId: string | null; organizerName: string | null; organizerVerified: boolean }) =>
  event.organizerUserId === null && event.organizerName === PLATFORM_ORGANIZER_NAME && event.organizerVerified;

async function main() {
  if (unknownFlags.length) throw new Error(`Unknown option: ${unknownFlags.join(", ")}`);
  console.log(apply ? "APPLY: events will be changed." : "DRY RUN: nothing is written. Add --apply to write.");
  console.log(`database host: ${databaseHost()}`);
  const events = await prisma.event.findMany({
    where: refs.length ? { OR: refs.flatMap((ref) => [{ id: ref }, { slug: ref }]) } : { slug: { startsWith: "mfl" } },
    select: selection,
    orderBy: { createdAt: "asc" },
  });
  if (!events.length) {
    console.log("No events found. Pass slugs or ids as arguments.");
    return;
  }
  for (const event of events) {
    console.log(`\n=== ${event.name}  [${event.slug}]`);
    console.log(`  now:    ${describe(event)}`);
    if (alreadyPlatformOwned(event)) {
      console.log("  SKIP: already owned by Miracle and verified");
      continue;
    }
    console.log(`  after:  owner=NULL name=${PLATFORM_ORGANIZER_NAME} verified=true`);
    if (!apply) continue;
    const result = await prisma.event.updateMany({
      where: { id: event.id, organizerUserId: event.organizerUserId },
      data: { organizerUserId: null, organizerName: PLATFORM_ORGANIZER_NAME, organizerVerified: true },
    });
    console.log(result.count === 1 ? "  APPLIED" : "  SKIPPED: the event changed meanwhile, run again");
  }
}

main()
  .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
