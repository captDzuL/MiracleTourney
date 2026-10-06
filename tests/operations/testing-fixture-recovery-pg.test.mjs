import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { generateCompetitionGraph } from '../../src/lib/tournament/competition/index.ts';
import { TOURNAMENT_FORMAT_PRESETS } from '../../src/lib/tournament/formats/types.ts';
import { loadExpectedLedger } from '../../scripts/operations/local-backup-snapshot.mjs';
import { readPinnedTestingCatalogs, runTestingCheckpointSession } from '../../scripts/operations/testing-schema-checkpoint.mjs';
import { TESTING_IDENTITY, TESTING_SOURCE } from '../../scripts/operations/testing-schema-core.mjs';
import { runFixtureRecoverySession } from '../../scripts/operations/testing-fixture-recovery-session.mjs';

const url = process.env.TASK13_SYNTHETIC_URL;
const identity = { database: 'task12_reference', branch: null };
const fixedDate = new Date('2026-01-01T00:00:00.000Z');
const finishedFormat = { version: 1, kind: 'single_elimination', bestOf: { earlyRounds: 1, semifinals: 3, thirdPlace: 1, final: 5 }, thirdPlace: 'required' };
const specs = [
  { slug: 'flashpeak-revision-published', id: 'fixture-published', status: 'Published', name: 'Flashpeak Revision Published', venue: 'Revision Arena', cap: 16, window: 'September 10, 2026 - September 20, 2026', starts: 'September 28, 2026', teams: 0 },
  { slug: 'flashpeak-revision-closed', id: 'fixture-closed', status: 'Registration Closed', name: 'Flashpeak Registration Closed', venue: 'Closed Arena', cap: 16, window: 'September 1, 2026 - September 5, 2026', starts: 'September 15, 2026', teams: 4 },
  { slug: 'flashpeak-rising-64', id: 'fixture-rising', status: 'Ongoing', name: 'Flashpeak Rising 64', venue: 'Flashpeak Match Hub', cap: 64, window: 'August 1, 2026 - August 9, 2026', starts: 'August 12, 2026', teams: 8 },
  { slug: 'flashpeak-champions-32', id: 'fixture-finished', status: 'Finished', name: 'Flashpeak Champions 32', venue: 'Flashpeak Arena', cap: 32, window: 'June 1, 2026 - June 20, 2026', starts: 'June 28, 2026', teams: 8 },
];

async function seed(db) {
  await db.user.create({ data: { id: 'fixture-organizer', email: 'fixture-organizer@example.test', name: 'Fixture Organizer', role: 'organizer', passwordHash: 'synthetic-hash' } });
  await db.event.create({ data: { id: 'fixture-unrelated', slug: 'fixture-unrelated', name: 'Unrelated', description: 'Synthetic control', gameId: 'game-flashpeak', gameModeId: 'mode-flashpeak-5v5', format: 'Single Elimination', status: 'Draft', participantCap: 2, registrationWindow: 'later', startsAt: 'later', venue: 'Elsewhere', organizerUserId: 'fixture-organizer' } });
  for (const spec of specs) {
    await db.event.create({ data: { id: spec.id, slug: spec.slug, name: spec.name, description: 'Synthetic fixture', gameId: 'game-flashpeak', gameModeId: 'mode-flashpeak-5v5', format: 'Single Elimination', status: spec.status, participantCap: spec.cap, registrationWindow: spec.window, startsAt: spec.starts, venue: spec.venue, organizerUserId: 'fixture-organizer', organizerName: 'Flashpeak Organizer', organizerVerified: true, updatedAt: fixedDate } });
    if (!spec.teams) continue;
    const teams = Array.from({ length: spec.teams }, (_, index) => ({ id: `team-${spec.slug}-${index + 1}`, seed: index + 1 }));
    for (const team of teams) {
      await db.team.create({ data: { id: team.id, eventId: spec.id, name: `Team ${team.seed}`, logoText: `T${team.seed}`, tag: `T${team.seed}`, source: 'demo' } });
      await db.player.create({ data: { id: `player-${spec.slug}-${team.seed}`, eventId: spec.id, teamId: team.id, displayName: `Player ${team.seed}`, nickname: `P${team.seed}`, position: 'player' } });
    }
    const graph = generateCompetitionGraph({ eventId: spec.id, config: spec.status === 'Finished' ? finishedFormat : TOURNAMENT_FORMAT_PRESETS.singleElimination, teams });
    const winner = new Map();
    const sides = (source) => source.kind === 'team' ? source.teamId : source.kind === 'match'
      ? source.outcome === 'winner' ? winner.get(source.matchId)?.winner ?? '' : winner.get(source.matchId)?.loser ?? '' : '';
    const rounds = new Map();
    for (const [index, node] of graph.matches.entries()) {
      const key = `${node.phaseId}:${node.bracket}:${node.round}:${node.leg}`;
      if (!rounds.has(key)) rounds.set(key, rounds.size + 1);
      const home = sides(node.home), away = sides(node.away);
      const completed = spec.status === 'Finished';
      await db.match.create({ data: { id: node.id, eventId: spec.id, roundLabel: `${node.bracket} ${node.round}`, round: rounds.get(key), slot: index + 1, homeTeamId: home, awayTeamId: away, status: completed ? 'Completed' : spec.status === 'Ongoing' && index === 0 ? 'Live' : 'Scheduled', homeScore: completed ? node.bestOf === 1 ? 2 : Math.ceil(node.bestOf / 2) : 0, awayScore: 0, winnerTeamId: completed ? home : null, createdAt: fixedDate, updatedAt: fixedDate } });
      if (completed) {
        winner.set(node.id, { winner: home, loser: away });
        for (let gameNumber = 1; gameNumber <= Math.ceil(node.bestOf / 2); gameNumber++) {
          await db.matchGame.create({ data: { id: `game-${node.id}-${gameNumber}`, matchId: node.id, gameNumber, homeScore: 2, awayScore: 0 } });
        }
      }
    }
    if (spec.status === 'Finished') {
      const third = graph.matches.find((node) => node.bracket === 'third_place');
      const thirdHome = winner.get(third.id).winner;
      const player = await db.player.findFirstOrThrow({ where: { teamId: thirdHome, eventId: spec.id } });
      await db.playerStat.create({ data: { id: 'fixture-admin-stat', matchId: third.id, playerId: player.id, playerName: player.displayName, teamId: player.teamId, position: player.position, gameSlug: 'flashpeak', stats: { goal: 10, assist: 10, passing: 10, defense: 10 }, source: 'admin', lastUpdatedBy: 'fixture-organizer' } });
      await db.certificate.create({ data: { id: 'fixture-legacy-certificate', eventId: spec.id, teamId: teams[0].id, type: 'champion', recipientKind: 'team', recipientId: teams[0].id, recipientName: 'Team 1', verificationCode: 'fixture-legacy-certificate', imageUrl: '/legacy-certificate.png' } });
    }
  }
}

test('reconstructs exact synthetic fixture metadata atomically and preserves old rows on rerun', { skip: !url }, async () => {
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    await seed(db);
    const unrelatedBefore = await db.event.findUniqueOrThrow({ where: { id: 'fixture-unrelated' } });
    const matchesBefore = await db.match.findMany({ where: { eventId: { in: specs.map((spec) => spec.id) } }, orderBy: { id: 'asc' } });
    const gamesBefore = await db.matchGame.findMany({ where: { match: { eventId: 'fixture-finished' } }, orderBy: { id: 'asc' } });
    const { baseline, reference } = await readPinnedTestingCatalogs();
    const names = (await readdir(resolve('prisma/migrations'), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    const expectedLedger = await loadExpectedLedger(resolve('prisma/migrations'), names);
    const checkpoint = await runTestingCheckpointSession({ path: process.env.TASK13_PSQL_PATH, args: ['-X', '-q', '-A', '-t', '-w', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate'], env: process.env, timeoutMs: 30_000 }, expectedLedger, baseline, reference, identity, ({ checkpoint: row }) => row);
    const manifest = { format: 'pg_dump-custom+age-v1', source: TESTING_SOURCE, testing: TESTING_IDENTITY, bytes: 10, sha256: 'a'.repeat(64), checkpoint };
    const verified = { bytes: 10, sha256: 'a'.repeat(64) };
    const admission = { baseline, reference, expectedLedger, identity, manifest, verified };
    await assert.rejects(runFixtureRecoverySession(db, { ...admission, manifest: { ...manifest, source: 'wrong-source' } }), /BACKUP_REJECTED/);
    assert.equal(await db.competitionPhase.count(), 0);
    await db.event.update({ where: { id: 'fixture-unrelated' }, data: { description: 'changed after backup' } });
    await assert.rejects(runFixtureRecoverySession(db, admission), /BACKUP_REJECTED/);
    await db.event.update({ where: { id: 'fixture-unrelated' }, data: { description: unrelatedBefore.description, updatedAt: unrelatedBefore.updatedAt } });
    const badMatch = matchesBefore.find((match) => match.eventId === 'fixture-closed');
    await db.match.update({ where: { id: badMatch.id }, data: { homeTeamId: 'wrong-team', updatedAt: badMatch.updatedAt } });
    await assert.rejects(runFixtureRecoverySession(db, admission), /FIXTURE_DRIFT/);
    await db.match.update({ where: { id: badMatch.id }, data: { homeTeamId: badMatch.homeTeamId, updatedAt: badMatch.updatedAt } });
    await db.competitionPhase.create({ data: { id: 'foreign-phase', eventId: 'fixture-closed', label: 'single_elimination', sequence: 1, status: 'draft' } });
    await assert.rejects(runFixtureRecoverySession(db, admission), /UNKNOWN_V3_STATE/);
    await db.competitionPhase.delete({ where: { id: 'foreign-phase' } });
    await db.playerStat.update({ where: { id: 'fixture-admin-stat' }, data: { source: 'captain' } });
    await assert.rejects(runFixtureRecoverySession(db, admission), /FIXTURE_DRIFT/);
    await db.playerStat.update({ where: { id: 'fixture-admin-stat' }, data: { source: 'admin' } });
    const badGame = gamesBefore[0];
    await db.matchGame.update({ where: { id: badGame.id }, data: { awayScore: badGame.homeScore } });
    const changedCheckpoint = await runTestingCheckpointSession({ path: process.env.TASK13_PSQL_PATH, args: ['-X', '-q', '-A', '-t', '-w', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate'], env: process.env, timeoutMs: 30_000 }, expectedLedger, baseline, reference, identity, ({ checkpoint: row }) => row);
    await assert.rejects(runFixtureRecoverySession(db, { ...admission, manifest: { ...manifest, checkpoint: changedCheckpoint } }), /Elimination games cannot draw/);
    assert.equal(await db.competitionPhase.count(), 0, 'mid-transaction failure rolled back earlier phase writes');
    await db.matchGame.update({ where: { id: badGame.id }, data: { awayScore: badGame.awayScore } });
    const first = await runFixtureRecoverySession(db, admission);
    assert.equal(first.status, 'TESTING_FIXTURES_RECONSTRUCTED');
    assert.equal(await db.competitionPhase.count({ where: { eventId: { in: specs.map((spec) => spec.id) } } }), 3);
    assert.equal(await db.matchResultRevision.count({ where: { eventId: 'fixture-finished' } }), 8);
    assert.equal(await db.tournamentCompletion.count({ where: { eventId: 'fixture-finished' } }), 1);
    assert.deepEqual(await db.event.findUniqueOrThrow({ where: { id: 'fixture-unrelated' } }), unrelatedBefore);
    const matchesAfter = await db.match.findMany({ where: { eventId: { in: specs.map((spec) => spec.id) } }, orderBy: { id: 'asc' } });
    for (const [index, before] of matchesBefore.entries()) {
      const after = matchesAfter[index];
      for (const key of ['id', 'eventId', 'roundLabel', 'round', 'slot', 'homeTeamId', 'awayTeamId', 'homeScore', 'awayScore', 'status', 'winnerTeamId', 'scheduledLabel', 'createdAt', 'updatedAt']) assert.deepEqual(after[key], before[key], `${before.id}.${key}`);
    }
    assert.deepEqual(await db.matchGame.findMany({ where: { match: { eventId: 'fixture-finished' } }, orderBy: { id: 'asc' } }), gamesBefore);
    const second = await runFixtureRecoverySession(db, admission);
    assert.equal(second.status, 'TESTING_FIXTURES_ALREADY_RECONSTRUCTED');
    assert.equal(await db.matchResultRevision.count({ where: { eventId: 'fixture-finished' } }), 8);
    assert.equal(await db.completionAuditEntry.count({ where: { completion: { eventId: 'fixture-finished' } } }), 1);
    const phase = await db.competitionPhase.findFirstOrThrow({ where: { eventId: 'fixture-closed' } });
    await db.competitionPhase.update({ where: { id: phase.id }, data: { configuration: { ...phase.configuration, syntheticReconstruction: 'foreign' } } });
    await assert.rejects(runFixtureRecoverySession(db, admission), /UNKNOWN_V3_STATE/);
    await db.competitionPhase.update({ where: { id: phase.id }, data: { configuration: phase.configuration, updatedAt: phase.updatedAt } });
    await db.event.update({ where: { id: 'fixture-unrelated' }, data: { description: 'post-recovery drift' } });
    await assert.rejects(runFixtureRecoverySession(db, admission), /UNKNOWN_V3_STATE/);
    await db.event.update({ where: { id: 'fixture-unrelated' }, data: { description: unrelatedBefore.description, updatedAt: unrelatedBefore.updatedAt } });
    assert.equal((await runFixtureRecoverySession(db, admission)).status, 'TESTING_FIXTURES_ALREADY_RECONSTRUCTED');
  } finally { await db.$disconnect(); }
});
