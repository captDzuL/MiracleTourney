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
    // Create new row with event-scoped ID
    await tx.match.create({
      data: {
        id: newId,
        eventId: match.eventId,
        roundLabel: match.roundLabel,
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        status: match.status,
        slot: match.slot,
        round: match.round,
        winnerTeamId: match.winnerTeamId,
        scheduledLabel: match.scheduledLabel,
        createdAt: match.createdAt,
        updatedAt: match.updatedAt,
      },
    });

    // Migrate child MatchGame rows
    await tx.matchGame.updateMany({
      where: { matchId: match.id },
      data: { matchId: newId },
    });

    // Delete the old row (after children are migrated)
    await tx.match.delete({ where: { id: match.id } });
  });

  console.log(`  RENAMED ${match.id} → ${newId}`);
  renamed++;
}

console.log(`\nDone. Renamed: ${renamed}, Skipped: ${skipped}.`);
await prisma.$disconnect();
