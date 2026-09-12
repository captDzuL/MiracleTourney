import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const event = await prisma.event.findFirst({ where: { slug: "mfl-blitz-s1" } });
if (!event) throw new Error("Event mfl-blitz-s1 tidak ditemukan");

// From QF results: R1S3 winner = Always Compete, R1S4 winner = Medioker FC
const HOME_TEAM_ID = "cmsug3noh0008k0041c7jdjqw"; // Always Compete
const AWAY_TEAM_ID = "cmsu5nols0002l804h54qg4ae"; // Medioker FC
const MATCH_ID = `${event.id}-sf-r2m2`;

console.log(`Inserting Semifinal Match 2 for ${event.name}`);

await prisma.$transaction(async (tx) => {
  await tx.match.upsert({
    where: { id: MATCH_ID },
    update: { homeScore: 2, awayScore: 0, status: "Completed", winnerTeamId: HOME_TEAM_ID },
    create: {
      id: MATCH_ID,
      eventId: event.id,
      roundLabel: "Semifinal",
      homeTeamId: HOME_TEAM_ID,
      awayTeamId: AWAY_TEAM_ID,
      homeScore: 2,
      awayScore: 0,
      status: "Completed",
      winnerTeamId: HOME_TEAM_ID,
      round: 2,
      slot: 2,
    },
  });

  await tx.matchGame.deleteMany({ where: { matchId: MATCH_ID } });
  await tx.matchGame.createMany({
    data: [
      { matchId: MATCH_ID, gameNumber: 1, homeScore: 3, awayScore: 2 },
      { matchId: MATCH_ID, gameNumber: 2, homeScore: 1, awayScore: 0 },
    ],
  });
});

const all = await prisma.match.findMany({
  where: { eventId: event.id },
  include: { games: true },
  orderBy: [{ round: "asc" }, { slot: "asc" }],
});
const teams = await prisma.team.findMany({ where: { eventId: event.id } });
const name = (id) => teams.find(t => t.id === id)?.name ?? id.slice(-6);

console.log(`\nAll matches for ${event.name}:`);
for (const m of all) {
  console.log(`  R${m.round}S${m.slot} ${m.roundLabel}: ${name(m.homeTeamId)} ${m.homeScore}-${m.awayScore} ${name(m.awayTeamId)} | ${m.status} | games: ${m.games.map(g => `G${g.gameNumber} ${g.homeScore}-${g.awayScore}`).join(", ")}`);
}

await prisma.$disconnect();
