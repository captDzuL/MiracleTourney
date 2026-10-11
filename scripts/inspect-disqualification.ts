/**
 * Read-only check before disqualifying teams in a running event.
 *
 *   pnpm exec tsx scripts/inspect-disqualification.ts <event-slug-or-id> [--team <team-id-or-name>]...
 *
 * Prints the current group standings, then for every --team the same impact the
 * organizer sees in the app (voided matches, ignored results, blockers, changed
 * playoff slots, standings afterwards). It never writes. Apply the disqualification
 * from Organizer > Competition. Previews are independent: when two teams are in the
 * same group, preview the second one again in the app after confirming the first.
 */
import { PrismaClient } from "@prisma/client";
import { disqualificationPreview } from "../src/lib/tournament/operations/disqualification";
import { competitionProjection } from "../src/lib/tournament/operations/result-projection";
import type { CompetitionGraph } from "../src/lib/tournament/competition";

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const eventRef = args.find((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--team");
const teamRefs = args.flatMap((arg, index) => (arg === "--team" && args[index + 1] ? [args[index + 1]] : []));

async function main() {
  if (!eventRef) throw new Error("Usage: tsx scripts/inspect-disqualification.ts <event-slug-or-id> [--team <team-id-or-name>]...");
  const event = await prisma.event.findFirst({ where: { OR: [{ id: eventRef }, { slug: eventRef }] } });
  if (!event) throw new Error(`Event not found: ${eventRef}`);
  const [teams, matches, phase] = await Promise.all([
    prisma.team.findMany({ where: { eventId: event.id }, select: { id: true, name: true } }),
    prisma.match.findMany({ where: { eventId: event.id } }),
    prisma.competitionPhase.findFirst({ where: { eventId: event.id, sequence: 1 } }),
  ]);
  const graph = (phase?.configuration as { graph?: CompetitionGraph } | null)?.graph;
  if (!graph) throw new Error("This event has no V3 competition graph.");
  const name = (id: string) => teams.find(team => team.id === id)?.name ?? (id || "(TBD)");
  console.log(`Event ${event.name} (${event.id}) · status ${event.status} · competition revision ${event.competitionVersion}`);
  console.log(`Already disqualified: ${(graph.disqualifications ?? []).map(d => `${name(d.teamId)} (${d.reason})`).join(", ") || "none"}`);

  const projection = competitionProjection(graph, matches);
  for (const table of projection.standings) {
    const group = graph.groups.find(item => item.id === table.groupId);
    console.log(`\n== ${group ? `Group ${group.label}` : "Table"} · ${table.complete ? "complete" : "NOT complete"} · qualifying ranks ${group?.qualificationCutline ?? "-"}`);
    for (const row of table.rows) console.log(`  ${row.rank}. ${name(row.teamId)}${row.tied ? " (tied)" : ""} · played ${row.played} · ${row.points} pts · diff ${row.scoreDifference}`);
    const open = graph.matches.filter(match => match.groupId === table.groupId && match.status === "pending").filter(match => !matches.find(row => row.id === match.id)?.resultVersion);
    if (open.length) console.log(`  unplayed: ${open.map(match => { const row = matches.find(item => item.id === match.id)!; return `${name(row.homeTeamId)} vs ${name(row.awayTeamId)} [${row.status}]`; }).join("; ")}`);
  }

  for (const ref of teamRefs) {
    const team = teams.find(item => item.id === ref) ?? teams.find(item => item.name.toLowerCase() === ref.toLowerCase());
    if (!team) { console.log(`\n!! Team not found: ${ref}`); continue; }
    const impact = await prisma.$transaction(tx => disqualificationPreview(tx, event.id, team.id, event.competitionVersion));
    console.log(`\n== Impact of disqualifying ${team.name} (${team.id})`);
    console.log(`  matches to cancel: ${impact.voidedMatchIds.length}`);
    for (const id of impact.voidedMatchIds) { const row = matches.find(item => item.id === id)!; console.log(`    - ${name(row.homeTeamId)} vs ${name(row.awayTeamId)}`); }
    console.log(`  played results that stop counting: ${impact.ignoredResultMatchIds.length}`);
    for (const id of impact.ignoredResultMatchIds) { const row = matches.find(item => item.id === id)!; console.log(`    - ${name(row.homeTeamId)} ${row.homeScore}-${row.awayScore} ${name(row.awayTeamId)}`); }
    console.log(`  BLOCKERS: ${impact.blockers.length ? "" : "none"}`);
    for (const blocker of impact.blockers) console.log(`    ! [${blocker.code}] ${blocker.message}`);
    console.log(`  playoff slots that change: ${impact.participants.length ? "" : "none"}`);
    for (const change of impact.participants) console.log(`    ${change.matchId}: ${name(change.before.homeTeamId)} vs ${name(change.before.awayTeamId)}  ->  ${name(change.after.homeTeamId)} vs ${name(change.after.awayTeamId)}`);
    const table = impact.standings.find(item => item.disqualified?.includes(team.id));
    if (table) {
      const group = graph.groups.find(item => item.id === table.groupId);
      console.log(`  standings afterwards${table.complete ? "" : " (not complete yet)"}:`);
      for (const row of table.rows) console.log(`    ${row.rank}. ${name(row.teamId)} · played ${row.played} · ${row.points} pts${group && row.rank <= group.qualificationCutline ? " · qualifies" : ""}`);
      if (group && table.rows.length < group.qualificationCutline) console.log(`    ! only ${table.rows.length} team(s) left for ${group.qualificationCutline} qualifying slots`);
    }
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
