import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const event = await prisma.event.findFirst({ where: { slug: "mfl-blitz-s1" } });
if (!event) throw new Error("Event mfl-blitz-s1 tidak ditemukan");

// Find teams by name
const teams = await prisma.team.findMany({ where: { eventId: event.id } });
const find = (name) => teams.find(t => t.name.toLowerCase().includes(name.toLowerCase()));

const medioker = find("Medioker FC Divisi");
const realEdi = find("Real Edi");

if (!medioker) throw new Error("Medioker FC Divisi 2 tidak ditemukan");
if (!realEdi) throw new Error("Real Edi fc tidak ditemukan");

console.log(`Home: ${medioker.name} (${medioker.id})`);
console.log(`Away: ${realEdi.name} (${realEdi.id})`);

// Semifinal Match 1 = Round 2, Slot 1
const MATCH_ID = `${event.id}-sf-r2m1`;
const HOME_TEAM_ID = medioker.id;
const AWAY_TEAM_ID = realEdi.id;
const WINNER_ID = medioker.id; // Medioker wins 2-0

console.log(`\nInserting ${MATCH_ID} for ${event.name}`);

await prisma.$transaction(async (tx) => {
  await tx.match.upsert({
    where: { id: MATCH_ID },
    update: { homeScore: 2, awayScore: 0, status: "Completed", winnerTeamId: WINNER_ID },
    create: {
      id: MATCH_ID,
      eventId: event.id,
      roundLabel: "Semifinal",
      homeTeamId: HOME_TEAM_ID,
      awayTeamId: AWAY_TEAM_ID,
      homeScore: 2,
      awayScore: 0,
      status: "Completed",
      winnerTeamId: WINNER_ID,
      round: 2,
      slot: 1,
    },
  });

  await tx.matchGame.deleteMany({ where: { matchId: MATCH_ID } });
  await tx.matchGame.createMany({
    data: [
      { matchId: MATCH_ID, gameNumber: 1, homeScore: 4, awayScore: 2 },
      { matchId: MATCH_ID, gameNumber: 2, homeScore: 5, awayScore: 1 },
    ],
  });
});

const all = await prisma.match.findMany({
  where: { eventId: event.id },
  include: { games: true },
  orderBy: [{ round: "asc" }, { slot: "asc" }],
});
const name = (id) => teams.find(t => t.id === id)?.name ?? id.slice(-6);

console.log(`\nAll matches for ${event.name}:`);
for (const m of all) {
  console.log(`  R${m.round}S${m.slot} ${m.roundLabel}: ${name(m.homeTeamId)} ${m.homeScore}-${m.awayScore} ${name(m.awayTeamId)} | ${m.status} | games: ${m.games.map(g => `G${g.gameNumber} ${g.homeScore}-${g.awayScore}`).join(", ")}`);
}

await prisma.$disconnect();
