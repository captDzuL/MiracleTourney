import { PrismaClient } from "@prisma/client";

import {
  PRODUCTION_CLEANUP_CONFIRM_FLAG,
  deleteDummyEventTargets,
  hasPublicEventListRequest,
  hasProductionCleanupConfirmation,
  listDummyEventTargets,
  listProductionPublicEvents,
  sanitizeDatabaseTarget,
} from "../src/lib/platform/production-cleanup";

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const confirmed = hasProductionCleanupConfirmation(args);
const listPublicEvents = hasPublicEventListRequest(args);
const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
const target = sanitizeDatabaseTarget(databaseUrl);

function printTargets(events: Awaited<ReturnType<typeof listDummyEventTargets>>) {
  if (events.length === 0) {
    console.log("No matching dummy events found.");
    return;
  }

  for (const event of events) {
    console.log(
      [
        `- ${event.name}`,
        `slug=${event.slug}`,
        `status=${event.status}`,
        `teams=${event._count.teams}`,
        `matches=${event._count.matches}`,
        `submissions=${event._count.statSubmissions}`,
        `certificate=${event.certificate ? 1 : 0}`,
      ].join(" | "),
    );
  }
}

function printPublicEvents(events: Awaited<ReturnType<typeof listProductionPublicEvents>>) {
  if (events.length === 0) {
    console.log("No public events found in this database.");
    return;
  }

  for (const event of events) {
    console.log(
      [
        `- ${event.name}`,
        `slug=${event.slug}`,
        `status=${event.status}`,
        `startsAt=${event.startsAt}`,
        `venue=${event.venue}`,
        `teams=${event._count.teams}`,
        `matches=${event._count.matches}`,
      ].join(" | "),
    );
  }
}

async function main() {
  console.log("Production dummy event cleanup");
  console.log(`Target: protocol=${target.protocol} host=${target.host} database=${target.database}`);

  if (listPublicEvents) {
    const publicEvents = await listProductionPublicEvents(prisma);
    console.log(`Public events in target database: ${publicEvents.length}`);
    printPublicEvents(publicEvents);
    return;
  }

  const previewTargets = await listDummyEventTargets(prisma);
  console.log(`Matched events: ${previewTargets.length}`);
  printTargets(previewTargets);

  if (!confirmed) {
    console.log(`Dry run only. Re-run with ${PRODUCTION_CLEANUP_CONFIRM_FLAG} to delete these rows.`);
    return;
  }

  const result = await deleteDummyEventTargets(prisma);
  console.log(`Deleted events: ${result.deletedEvents}`);
  console.log(`Deleted certificates: ${result.deletedCertificates}`);

  const remainingTargets = await listDummyEventTargets(prisma);
  console.log(`Remaining matching events: ${remainingTargets.length}`);
  printTargets(remainingTargets);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
