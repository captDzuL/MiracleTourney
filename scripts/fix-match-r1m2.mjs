import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// ── Step 1: Revert corruption on bracket-r1-m2 (belongs to another event) ──
// My previous script changed winnerTeamId to Real Edi fc's ID — revert it.
const damagedRow = await prisma.match.findUnique({ where: { id: "bracket-r1-m2" }, include: { games: true } });
console.log("bracket-r1-m2 current state:", JSON.stringify(damagedRow, null, 2));

if (damagedRow) {
  // Find the correct winner from game scores (whoever won more games)
  const homeWins = damagedRow.games.filter(g => g.homeScore > g.awayScore).length;
  const awayWins = damagedRow.games.filter(g => g.awayScore > g.homeScore).length;
  const correctWinner = homeWins > awayWins
    ? damagedRow.homeTeamId
    : awayWins > homeWins
    ? damagedRow.awayTeamId
    : null;

  console.log(`\nReverting winner: ${damagedRow.winnerTeamId} → ${correctWinner}`);
  await prisma.match.update({
    where: { id: "bracket-r1-m2" },
    data: { winnerTeamId: correctWinner },
  });
  console.log("Reverted.");
}

// ── Step 2: Insert correct row for Flash Peak MFL S1 Quarterfinal Match 2 ──
const event = await prisma.event.findFirst({ where: { slug: "mfl-blitz-s1" } });
if (!event) throw new Error("Event mfl-blitz-s1 tidak ditemukan");

const HOME_TEAM_ID = "cmsuasv1a0002l504r110dht8"; // Real Edi fc
const AWAY_TEAM_ID = "cmsug3noh0004k004hf97smll"; // AVOID CITY

// Generate a unique ID so it doesn't collide with other events
const NEW_MATCH_ID = `${event.id}-qf-r1m2`;

console.log(`\nCreating match ${NEW_MATCH_ID} for ${event.name} (${event.id})`);

await prisma.$transaction(async (tx) => {
  await tx.match.upsert({
    where: { id: NEW_MATCH_ID },
    update: {
      homeScore: 2,
      awayScore: 0,
      status: "Completed",
      winnerTeamId: HOME_TEAM_ID,
    },
    create: {
      id: NEW_MATCH_ID,
      eventId: event.id,
      roundLabel: "Quarterfinal",
      homeTeamId: HOME_TEAM_ID,
      awayTeamId: AWAY_TEAM_ID,
      homeScore: 2,
      awayScore: 0,
      status: "Completed",
      winnerTeamId: HOME_TEAM_ID,
      round: 1,
      slot: 2,
    },
  });

  await tx.matchGame.deleteMany({ where: { matchId: NEW_MATCH_ID } });
  await tx.matchGame.createMany({
    data: [
      { matchId: NEW_MATCH_ID, gameNumber: 1, homeScore: 1, awayScore: 0 },
      { matchId: NEW_MATCH_ID, gameNumber: 2, homeScore: 2, awayScore: 0 },
    ],
  });
});

const saved = await prisma.match.findUnique({ where: { id: NEW_MATCH_ID }, include: { games: true } });
console.log("Saved match:", JSON.stringify(saved, null, 2));

// ── Step 3: Verify all QF matches for this event ──
const allMatches = await prisma.match.findMany({
  where: { eventId: event.id },
  include: { games: true },
  orderBy: [{ round: "asc" }, { slot: "asc" }],
});
console.log(`\nAll matches for ${event.name}:`);
for (const m of allMatches) {
  console.log(`  [${m.id}] R${m.round}S${m.slot} ${m.roundLabel}: ${m.homeTeamId.slice(-6)} ${m.homeScore}-${m.awayScore} ${m.awayTeamId.slice(-6)} | ${m.status} | games: ${m.games.length}`);
}

await prisma.$disconnect();
