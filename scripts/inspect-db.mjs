import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const events = await prisma.event.findMany({
  include: { teams: { include: { players: true } }, matches: { include: { games: true } }, roundConfigs: true },
});
for (const e of events) {
  console.log(`\nEVENT: ${e.name}`);
  console.log(`  slug: ${e.slug} | gameId: ${e.gameId} | format: ${e.format} | status: ${e.status} | cap: ${e.participantCap}`);
  console.log(`  characterArtUrl: ${e.characterArtUrl ?? "(none)"}`);
  console.log(`  accentColor: ${e.accentColor ?? "(none)"}`);
  console.log(`  Teams (${e.teams.length}):`);
  for (const t of e.teams) {
    console.log(`    [${t.id}] ${t.name} (tag: ${t.tag}, players: ${t.players.length}, source: ${t.source}, captainId: ${t.captainId ?? "none"})`);
  }
  console.log(`  Round configs: ${e.roundConfigs.map(r => r.roundLabel + "=BO" + r.bestOf).join(", ") || "(none)"}`);
  console.log(`  Matches (${e.matches.length}):`);
  for (const m of e.matches) {
    const homeTeam = e.teams.find(t => t.id === m.homeTeamId);
    const awayTeam = e.teams.find(t => t.id === m.awayTeamId);
    console.log(`    [${m.id}] R${m.round}S${m.slot} ${m.roundLabel}: ${homeTeam?.name ?? m.homeTeamId.slice(-6)} ${m.homeScore}-${m.awayScore} ${awayTeam?.name ?? m.awayTeamId.slice(-6)} | ${m.status} | winner: ${m.winnerTeamId ? (e.teams.find(t => t.id === m.winnerTeamId)?.name ?? m.winnerTeamId.slice(-6)) : "none"} | games: ${m.games.length}`);
  }
}
await prisma.$disconnect();
