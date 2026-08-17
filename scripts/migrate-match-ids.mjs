/**
 * One-time migration: renames bracket match IDs from legacy format "bracket-rN-mM"
 * to event-scoped format "${eventId}-rN-mM". Also cascades the rename to MatchGame.matchId.
 *
 * Safe to re-run: rows already in the new format are skipped.
 * Run BEFORE deploying the code that generates event-scoped IDs.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const OLD_FORMAT = /^bracket-r(\d+)-m(\d+)$/;

const matches = await prisma.match.findMany({
  where: { round: { not: null }, slot: { not: null } },
  orderBy: [{ eventId: "asc" }, { round: "asc" }, { slot: "asc" }],
});

const toRename = matches.filter((m) => OLD_FORMAT.test(m.id));

console.log(`Found ${matches.length} total matches, ${toRename.length} need renaming.`);

if (toRename.length === 0) {
  console.log("Nothing to do.");
  await prisma.$disconnect();
  process.exit(0);
}

let renamed = 0;
let skipped = 0;

for (const match of toRename) {
  const newId = `${match.eventId}-r${match.round}-m${match.slot}`;

  const existing = await prisma.match.findUnique({ where: { id: newId } });
  if (existing) {
    console.log(`  SKIP ${match.id} → ${newId} (target already exists)`);
    skipped++;
    continue;
  }

  await prisma.$transaction(async (tx) => {
    // Save game rows before removing FK reference
    const games = await tx.$queryRaw`SELECT * FROM "MatchGame" WHERE "matchId" = ${match.id}`;

    // Delete children to free FK reference on old PK
    await tx.$executeRaw`DELETE FROM "MatchGame" WHERE "matchId" = ${match.id}`;

    // Rename Match PK in-place (safe now — no children referencing it)
    await tx.$executeRaw`UPDATE "Match" SET "id" = ${newId} WHERE "id" = ${match.id}`;

    // Recreate game rows with new matchId
    for (const g of games) {
      await tx.$executeRaw`INSERT INTO "MatchGame" ("id","matchId","gameNumber","homeScore","awayScore") VALUES (${g.id},${newId},${g.gameNumber},${g.homeScore},${g.awayScore})`;
    }
  });

  console.log(`  RENAMED ${match.id} → ${newId}`);
  renamed++;
}

console.log(`\nDone. Renamed: ${renamed}, Skipped: ${skipped}.`);
await prisma.$disconnect();
