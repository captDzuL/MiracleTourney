/**
 * Script: insert Final match result + generate e-certificate simultaneously.
 *
 * Usage:
 *   node scripts/fix-final-and-certificate.mjs <home_score> <away_score> [g1h g1a] [g2h g2a] [g3h g3a]
 *
 * Home = Medioker FC Divisi 2
 * Away = Always Compete
 *
 * Example (Medioker menang 2-1, G1: 3-2, G2: 1-3, G3: 2-1):
 *   node scripts/fix-final-and-certificate.mjs 2 1 3 2 1 3 2 1
 *
 * Example (Always Compete menang 2-0, G1: 5-2, G2: 4-1):
 *   node scripts/fix-final-and-certificate.mjs 0 2 5 2 4 1
 */
import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";

// ── Parse args ────────────────────────────────────────────────────────────────

const [homeScoreArg, awayScoreArg, ...gameScoreArgs] = process.argv.slice(2);

if (homeScoreArg === undefined || awayScoreArg === undefined) {
  console.error("Usage: node fix-final-and-certificate.mjs <home_score> <away_score> [g1h g1a ...]");
  process.exit(1);
}

const homeScore = parseInt(homeScoreArg, 10);
const awayScore = parseInt(awayScoreArg, 10);

if (isNaN(homeScore) || isNaN(awayScore) || homeScore === awayScore) {
  console.error("Score harus angka dan tidak boleh seri.");
  process.exit(1);
}

const games = [];
for (let i = 0; i < gameScoreArgs.length; i += 2) {
  const gh = parseInt(gameScoreArgs[i], 10);
  const ga = parseInt(gameScoreArgs[i + 1], 10);
  if (!isNaN(gh) && !isNaN(ga)) games.push({ gameNumber: games.length + 1, homeScore: gh, awayScore: ga });
}

// ── DB ────────────────────────────────────────────────────────────────────────

const prisma = new PrismaClient();

const event = await prisma.event.findFirst({ where: { slug: "mfl-blitz-s1" } });
if (!event) throw new Error("Event mfl-blitz-s1 tidak ditemukan");

const teams = await prisma.team.findMany({ where: { eventId: event.id } });
const find = (kw) => teams.find(t => t.name.toLowerCase().includes(kw.toLowerCase()));

const medioker = find("Medioker FC Divisi");
const alwaysCompete = find("Always Compete");
if (!medioker) throw new Error("Medioker FC Divisi 2 tidak ditemukan");
if (!alwaysCompete) throw new Error("Always Compete tidak ditemukan");

const HOME_TEAM_ID = medioker.id;
const AWAY_TEAM_ID = alwaysCompete.id;
const WINNER_ID = homeScore > awayScore ? HOME_TEAM_ID : AWAY_TEAM_ID;
const winnerName = homeScore > awayScore ? medioker.name : alwaysCompete.name;
const MATCH_ID = `${event.id}-final-r3m1`;

console.log(`\n📋 Final: ${medioker.name} ${homeScore} - ${awayScore} ${alwaysCompete.name}`);
console.log(`🏆 Pemenang: ${winnerName}`);
if (games.length > 0) {
  console.log(`🎮 Games: ${games.map(g => `G${g.gameNumber} ${g.homeScore}-${g.awayScore}`).join(", ")}`);
}

// ── Step 1: Save Final match ──────────────────────────────────────────────────

console.log(`\n⏳ Menyimpan Final match ke DB...`);
await prisma.$transaction(async (tx) => {
  await tx.match.upsert({
    where: { id: MATCH_ID },
    update: { homeScore, awayScore, status: "Completed", winnerTeamId: WINNER_ID },
    create: {
      id: MATCH_ID,
      eventId: event.id,
      roundLabel: "Final",
      homeTeamId: HOME_TEAM_ID,
      awayTeamId: AWAY_TEAM_ID,
      homeScore,
      awayScore,
      status: "Completed",
      winnerTeamId: WINNER_ID,
      round: 3,
      slot: 1,
    },
  });

  if (games.length > 0) {
    await tx.matchGame.deleteMany({ where: { matchId: MATCH_ID } });
    await tx.matchGame.createMany({ data: games.map(g => ({ matchId: MATCH_ID, ...g })) });
  }
});

console.log(`✅ Final match tersimpan: [${MATCH_ID}]`);

// ── Print current bracket state ───────────────────────────────────────────────

const allMatches = await prisma.match.findMany({
  where: { eventId: event.id },
  include: { games: true },
  orderBy: [{ round: "asc" }, { slot: "asc" }],
});
const name = (id) => teams.find(t => t.id === id)?.name ?? id.slice(-6);
console.log(`\n📊 Semua match ${event.name}:`);
for (const m of allMatches) {
  const gs = m.games.map(g => `G${g.gameNumber} ${g.homeScore}-${g.awayScore}`).join(", ");
  console.log(`  R${m.round}S${m.slot} ${m.roundLabel}: ${name(m.homeTeamId)} ${m.homeScore}-${m.awayScore} ${name(m.awayTeamId)} | ${m.status}${gs ? ` | ${gs}` : ""}`);
}

await prisma.$disconnect();

// ── Step 2: Generate Certificate (via tsx) ────────────────────────────────────

console.log(`\n⏳ Generating e-certificate untuk ${winnerName}...`);
try {
  execSync(
    `npx tsx scripts/generate-certificate.ts ${event.id} ${WINNER_ID}`,
    { stdio: "inherit", cwd: process.cwd() }
  );
} catch (err) {
  console.error("❌ Certificate generation gagal. Jalankan manual:");
  console.error(`   npx tsx scripts/generate-certificate.ts ${event.id} ${WINNER_ID}`);
  process.exit(1);
}
