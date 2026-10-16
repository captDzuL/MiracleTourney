/**
 * Read-only audit of old events (for example MFL Season 1-3) against what the V3 public pages need.
 *
 *   pnpm exec tsx scripts/inspect-legacy-seasons.ts                      # every event whose slug starts with "mfl"
 *   pnpm exec tsx scripts/inspect-legacy-seasons.ts mfl-blitz-s1 <slug>  # named events (slug or id)
 *   pnpm exec tsx scripts/inspect-legacy-seasons.ts --json report.json   # also write the full report as JSON
 *
 * It never writes: every query runs in one transaction that is set READ ONLY, so the database
 * itself refuses any write. Use DIRECT_URL/DATABASE_URL of a read-only role or a Neon branch if you can.
 *
 * What it reports per event:
 *  - whether V3 structures exist (phase + graph, completion, podium, awards, certificate publication)
 *  - how the old match rows look (rounds, results, games, third-place match, rows without a winner)
 *  - player statistics and submissions that feed the leaderboard and awards
 *  - certificates (type, template, status, verification code) and whether the public verify page accepts them
 *  - whether the old fixtures map exactly onto a V3 graph (seeds inferred from first-round slots),
 *    using the same diagnosis the organizer app uses, with the results taken out
 */
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { inferLegacySeeds, structuralOnly } from "../src/lib/tournament/operations/legacy-audit";
import { diagnoseLegacyCompetition } from "../src/lib/tournament/operations/legacy-compatibility";
import { tournamentFormatConfigSchema } from "../src/lib/tournament/formats/types";
import { MIRACLE_V3_CERTIFICATE_TYPES } from "../src/lib/certificate/templates/miracle-v3-contract";

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const jsonIndex = args.indexOf("--json");
const jsonPath = jsonIndex >= 0 ? args[jsonIndex + 1] : null;
const refs = args.filter((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--json");

type Row = Record<string, unknown>;

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1;
  return out;
}

async function audit(tx: PrismaClient, event: Awaited<ReturnType<PrismaClient["event"]["findFirstOrThrow"]>>) {
  const eventId = event.id;
  const [teams, players, matches, roundConfigs, phases, groups, completion, certificates, publications, statSubs, statCount] = await Promise.all([
    tx.team.findMany({ where: { eventId }, select: { id: true, name: true } }),
    tx.player.count({ where: { eventId } }),
    tx.match.findMany({ where: { eventId }, orderBy: [{ round: "asc" }, { slot: "asc" }, { id: "asc" }] }),
    tx.eventRoundConfig.findMany({ where: { eventId } }),
    tx.competitionPhase.findMany({ where: { eventId }, orderBy: { sequence: "asc" } }),
    tx.competitionGroup.count({ where: { eventId } }),
    tx.tournamentCompletion.findUnique({
      where: { eventId },
      include: { podiumPlacements: { orderBy: { rank: "asc" } }, awards: { include: { decision: true } } },
    }),
    tx.certificate.findMany({ where: { eventId }, orderBy: [{ type: "asc" }, { version: "asc" }] }),
    tx.certificatePublication.findMany({ where: { eventId }, orderBy: { version: "desc" }, take: 1 }),
    tx.statSubmission.findMany({ where: { eventId }, select: { status: true } }),
    tx.playerStat.count({ where: { match: { eventId } } }),
  ]);
  const matchIds = matches.map((match) => match.id);
  const [gameCount, resultRevisionCount, dependencyCount] = await Promise.all([
    tx.matchGame.count({ where: { matchId: { in: matchIds } } }),
    tx.matchResultRevision.count({ where: { eventId } }),
    tx.matchDependency.count({ where: { eventId } }),
  ]);

  const names = new Map(teams.map((team) => [team.id, team.name]));
  const name = (id: string | null | undefined) => (id ? names.get(id) ?? `?${id}` : "(none)");
  const formatConfig = tournamentFormatConfigSchema.safeParse(event.formatConfig);
  const lastRound = Math.max(0, ...matches.map((match) => match.round ?? 0));
  const finals = matches.filter((match) => match.round === lastRound);
  const decided = matches.filter((match) => match.winnerTeamId);
  const finishedWithoutWinner = matches.filter((match) =>
    /^(completed|finished|done)$/i.test(match.status) && !match.winnerTeamId);
  const thirdPlace = matches.filter((match) => /third|3rd|ketiga|perunggu|bronze/i.test(`${match.roundLabel} ${match.scheduledLabel ?? ""}`));
  const graph = phases[0]?.configuration && typeof phases[0].configuration === "object"
    ? (phases[0].configuration as { graph?: unknown }).graph
    : undefined;

  const inferred = inferLegacySeeds(teams.map((team) => team.id), matches);
  const sanitized = structuralOnly(matches);
  const diagnosis = diagnoseLegacyCompetition(
    { id: eventId, format: event.format, formatConfig: event.formatConfig },
    inferred.seeds,
    sanitized,
    { roundConfigs, matchGames: [] },
  );

  const certificateRows = certificates.map((certificate) => ({
    id: certificate.id,
    type: certificate.type,
    recipient: certificate.recipientName,
    version: certificate.version,
    template: certificate.templateVersion,
    status: certificate.status,
    hasImage: Boolean(certificate.publishedUrl || certificate.imageUrl),
    publishedAt: certificate.publishedAt?.toISOString() ?? null,
    superseded: certificate.supersededByVersion,
    completionId: certificate.completionId,
    verificationCode: certificate.verificationCode,
    // Same rules as resolvePublicCertificateVerification: ready/published/superseded + publishedAt + known type.
    publicVerifyWorks: ["ready", "published", "superseded"].includes(certificate.status)
      && certificate.publishedAt !== null
      && (MIRACLE_V3_CERTIFICATE_TYPES as readonly string[]).includes(certificate.type),
  }));

  const v3Complete = Boolean(completion?.status === "completed" && graph);
  return {
    event: {
      id: eventId, slug: event.slug, name: event.name, status: event.status, format: event.format,
      formatConfigValid: formatConfig.success, publishedAt: event.publishedAt?.toISOString() ?? null,
      eventStartsAt: event.eventStartsAt?.toISOString() ?? null, competitionVersion: event.competitionVersion,
      organizerUserId: event.organizerUserId,
    },
    counts: { teams: teams.length, players, matches: matches.length, matchGames: gameCount, playerStats: statCount, statSubmissions: countBy(statSubs, (row) => row.status) },
    matches: {
      byStatus: countBy(matches, (match) => match.status),
      rounds: lastRound,
      roundLabels: [...new Set(matches.map((match) => match.roundLabel))],
      withWinner: decided.length,
      finishedWithoutWinner: finishedWithoutWinner.map((match) => match.id),
      withResultVersion: matches.filter((match) => match.resultVersion > 0).length,
      withPhaseId: matches.filter((match) => match.phaseId).length,
      thirdPlaceMatches: thirdPlace.map((match) => `${match.roundLabel}: ${name(match.homeTeamId)} ${match.homeScore}-${match.awayScore} ${name(match.awayTeamId)}`),
      final: finals.map((match) => `${match.roundLabel}: ${name(match.homeTeamId)} ${match.homeScore}-${match.awayScore} ${name(match.awayTeamId)} -> winner ${name(match.winnerTeamId)}`),
      roundConfigs: roundConfigs.map((row) => `${row.roundLabel}=BO${row.bestOf}`),
    },
    v3: {
      phases: phases.map((phase) => ({ sequence: phase.sequence, status: phase.status, hasGraph: Boolean((phase.configuration as { graph?: unknown } | null)?.graph) })),
      groups, dependencies: dependencyCount, resultRevisions: resultRevisionCount,
      completion: completion ? {
        status: completion.status,
        podium: completion.podiumPlacements.map((row) => `${row.rank}. ${row.teamName}`),
        awards: completion.awards.map((award) => `${award.type}:${award.status}${award.decision ? ` -> ${award.decision.recipientName}` : ""}`),
      } : null,
      publication: publications[0] ? { version: publications[0].version, certificates: Array.isArray(publications[0].certificateIds) ? (publications[0].certificateIds as unknown[]).length : 0 } : null,
      publicFinishedPageShowsV3: v3Complete,
    },
    certificates: certificateRows,
    upgrade: {
      seedInference: inferred.note,
      seedsComplete: inferred.complete,
      diagnosisIgnoringResults: diagnosis.reason,
      canMapOntoGraph: diagnosis.status === "ready",
    },
  } satisfies Row;
}

async function main() {
  const report = await prisma.$transaction(async (tx) => {
    // The database enforces read-only: any accidental write below fails the whole audit.
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const events = await tx.event.findMany({
      where: refs.length
        ? { OR: refs.flatMap((ref) => [{ id: ref }, { slug: ref }]) }
        : { slug: { startsWith: "mfl" } },
      orderBy: { createdAt: "asc" },
    });
    return Promise.all(events.map((event) => audit(tx as unknown as PrismaClient, event)));
  }, { timeout: 120_000 });

  if (!report.length) {
    console.log("No events found. Pass slugs or ids as arguments.");
    return;
  }
  for (const item of report) {
    console.log(`\n=== ${item.event.name}  [${item.event.slug}]  status=${item.event.status}  format=${item.event.format}`);
    console.log(`teams ${item.counts.teams} · players ${item.counts.players} · matches ${item.counts.matches} (${JSON.stringify(item.matches.byStatus)}) · games ${item.counts.matchGames}`);
    console.log(`results: ${item.matches.withWinner} with winner · ${item.matches.withResultVersion} with V3 result version · ${item.matches.finishedWithoutWinner.length} finished without winner`);
    console.log(`round labels: ${item.matches.roundLabels.join(" | ")}   round rules: ${item.matches.roundConfigs.join(", ") || "none"}`);
    console.log(`final: ${item.matches.final.join(" ; ") || "none"}`);
    console.log(`third place match: ${item.matches.thirdPlaceMatches.join(" ; ") || "NONE"}`);
    console.log(`stats: ${item.counts.playerStats} player rows · submissions ${JSON.stringify(item.counts.statSubmissions)}`);
    console.log(`V3: phases ${JSON.stringify(item.v3.phases)} · groups ${item.v3.groups} · completion ${item.v3.completion ? item.v3.completion.status : "none"} · publication ${item.v3.publication ? `v${item.v3.publication.version} (${item.v3.publication.certificates} certs)` : "none"}`);
    if (item.v3.completion) console.log(`  podium ${item.v3.completion.podium.join(", ") || "none"} · awards ${item.v3.completion.awards.join(", ") || "none"}`);
    console.log(`V3 finished page for this event: ${item.v3.publicFinishedPageShowsV3 ? "yes" : "NO (falls back to the old page)"}`);
    console.log(`certificates (${item.certificates.length}):`);
    for (const cert of item.certificates) {
      console.log(`  - ${cert.type} v${cert.version} ${cert.template} ${cert.status} -> ${cert.recipient} · image ${cert.hasImage ? "yes" : "no"} · verify ${cert.publicVerifyWorks ? `OK /certificates/verify/${cert.verificationCode}` : "NOT accepted"}`);
    }
    console.log(`upgrade check (results ignored): seeds ${item.upgrade.seedInference}; diagnosis = ${item.upgrade.diagnosisIgnoringResults}; maps onto V3 graph: ${item.upgrade.canMapOntoGraph ? "yes" : "no"}`);
  }
  if (jsonPath) {
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    console.log(`\nFull report written to ${jsonPath}`);
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
