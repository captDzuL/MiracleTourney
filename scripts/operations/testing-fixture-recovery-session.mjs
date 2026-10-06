import { createHash, randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Prisma, PrismaClient } from '@prisma/client';
import { buildFixtureGraph, createSyntheticSchedule } from './testing-fixture-recovery.ts';
import { scoreResult } from '../../src/lib/tournament/operations/results.ts';
import { competitionProjection } from '../../src/lib/tournament/operations/result-projection.ts';
import { matchSnapshot } from '../../src/lib/tournament/operations/state.ts';
import { completeTournament } from '../../src/lib/completion/complete.ts';
import { deriveAwardCandidates } from '../../src/lib/completion/awards.ts';
import { createPrismaCompletionDependenciesInTransaction } from '../../src/lib/completion/prisma-adapter.ts';
import { CATALOG_SQL } from './testing-schema-catalog.mjs';
import { readPinnedTestingCatalogs, validateTestingCheckpoint } from './testing-schema-checkpoint.mjs';
import { checkpointSelect, oldRowProjectionSql, readReceipt } from './testing-schema-apply.mjs';
import { assertCatalogState, assertTestingBackupReceipt, buildTargetCatalog, TESTING_IDENTITY, validateTestingSourceUrl } from './testing-schema-core.mjs';
import { prepareFixedTestingExport } from './local-backup-operator.mjs';
import { PINNED_CA_PATH, verifyPinnedCaBundle } from './local-backup-ca.mjs';
import { verifyTestingFrontendTls } from './testing-schema-tls.mjs';
import { link, lstat, open, readFile, unlink } from 'node:fs/promises';

const TARGETS = Object.freeze([
  { slug: 'flashpeak-revision-published', name: 'Flashpeak Revision Published', status: 'Published', cap: 16, venue: 'Revision Arena', window: 'September 10, 2026 - September 20, 2026', starts: 'September 28, 2026', teams: 0, matches: 0 },
  { slug: 'flashpeak-revision-closed', name: 'Flashpeak Registration Closed', status: 'Registration Closed', cap: 16, venue: 'Closed Arena', window: 'September 1, 2026 - September 5, 2026', starts: 'September 15, 2026', teams: 4, matches: 3 },
  { slug: 'flashpeak-rising-64', name: 'Flashpeak Rising 64', status: 'Ongoing', cap: 64, venue: 'Flashpeak Match Hub', window: 'August 1, 2026 - August 9, 2026', starts: 'August 12, 2026', teams: 8, matches: 7 },
  { slug: 'flashpeak-champions-32', name: 'Flashpeak Champions 32', status: 'Finished', cap: 32, venue: 'Flashpeak Arena', window: 'June 1, 2026 - June 20, 2026', starts: 'June 28, 2026', teams: 8, matches: 8 },
]);
const MARKER = 'task13-synthetic-fixture-reconstruction-v1';
const SCHEDULE = {
  'flashpeak-rising-64': { timezone: 'Asia/Jakarta', eventWindow: { start: '2026-08-12T02:00:00.000Z', end: '2026-08-13T02:00:00.000Z' }, matchDurationMinutes: 45, bufferMinutes: 10, minimumRestMinutes: 15, rooms: ['Flashpeak Arena A', 'Flashpeak Arena B'] },
  'flashpeak-champions-32': { timezone: 'Asia/Jakarta', eventWindow: { start: '2026-06-28T02:00:00.000Z', end: '2026-06-28T10:00:00.000Z' }, matchDurationMinutes: 45, bufferMinutes: 10, minimumRestMinutes: 15, rooms: ['Flashpeak Arena Final A', 'Flashpeak Arena Final B'] },
};
const PUBLISHED_DATES = { registrationOpensAt: new Date('2026-09-10T02:00:00.000Z'), registrationClosesAt: new Date('2026-09-20T14:00:00.000Z'), eventStartsAt: new Date('2026-09-28T03:00:00.000Z') };
const COMPLETION_KEY = '00000000-0000-4000-8000-000000000013';
const REASON = `New synthetic fixture reconstruction (${MARKER}); not a historical result`;
const fail = code => { const error = new Error(code); error.code = code; return error; };
const json = value => JSON.parse(JSON.stringify(value));
const canonical = value => value instanceof Date ? value.toISOString() : Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, canonical(nested)])) : value;
const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const quote = value => `"${value.replaceAll('"', '""')}"`;
const byId = rows => [...rows].sort((left, right) => left.id.localeCompare(right.id));

/** Translate only the already-approved libpq testing source for this Prisma 6 engine. */
export function buildPinnedTestingPrismaUrl(sourceUrl, verifiedCaPath) {
  validateTestingSourceUrl(sourceUrl);
  if (verifiedCaPath !== PINNED_CA_PATH) throw fail('SOURCE_REJECTED');
  const url = new URL(sourceUrl);
  url.searchParams.delete('sslrootcert');
  url.searchParams.set('sslmode', 'require');
  url.searchParams.set('sslaccept', 'strict');
  url.searchParams.set('sslcert', verifiedCaPath);
  return url.href;
}

function ownedNewState(states) {
  return states.map(state => ({
    event: state.event,
    matches: byId(state.matches),
    phases: byId(state.phases).map(phase => {
      const configuration = { ...phase.configuration };
      delete configuration.ownedStateSha256;
      return { ...phase, configuration };
    }),
    dependencies: byId(state.dependencies), schedules: byId(state.schedules), revisions: byId(state.revisions),
    completion: state.completion ? { ...state.completion,
      podiumPlacements: byId(state.completion.podiumPlacements),
      awards: byId(state.completion.awards), auditEntries: byId(state.completion.auditEntries) } : null,
  }));
}

async function marker(tx, sql, name) {
  const rows = await tx.$queryRawUnsafe(sql);
  const value = Object.values(rows[0] || {})[0];
  if (typeof value !== 'string' || !value.startsWith(`${name}\t`)) throw fail('CHECKPOINT_DRIFT');
  try { return JSON.parse(value.slice(name.length + 1)); }
  catch { throw fail('CHECKPOINT_DRIFT'); }
}

async function stateFor(tx, event) {
  const eventId = event.id;
  const [teams, players, matches, games, stats, certificates, phases, dependencies, schedules, revisions,
    completion, publications, generation, actions, incidents, readiness, audits, editRevisions, previewTokens] = await Promise.all([
    tx.team.findMany({ where: { eventId }, orderBy: { id: 'asc' } }),
    tx.player.findMany({ where: { eventId }, orderBy: { id: 'asc' } }),
    tx.match.findMany({ where: { eventId }, orderBy: { id: 'asc' } }),
    tx.matchGame.findMany({ where: { match: { eventId } }, orderBy: [{ matchId: 'asc' }, { gameNumber: 'asc' }] }),
    tx.playerStat.findMany({ where: { match: { eventId } } }),
    tx.certificate.findMany({ where: { eventId } }),
    tx.competitionPhase.findMany({ where: { eventId } }),
    tx.matchDependency.findMany({ where: { eventId } }),
    tx.scheduleRevision.findMany({ where: { eventId } }),
    tx.matchResultRevision.findMany({ where: { eventId } }),
    tx.tournamentCompletion.findUnique({ where: { eventId }, include: { podiumPlacements: true, awards: { include: { decision: true } }, auditEntries: true } }),
    tx.certificatePublication.count({ where: { eventId } }),
    tx.certificateGenerationMutation.count({ where: { eventId } }),
    tx.competitionActionItem.count({ where: { eventId } }),
    tx.competitionIncident.count({ where: { eventId } }),
    tx.matchReadiness.count({ where: { eventId } }),
    tx.competitionAuditLog.count({ where: { eventId } }),
    tx.eventEditRevision.count({ where: { eventId } }),
    tx.eventPreviewToken.count({ where: { eventId } }),
  ]);
  return { event, teams, players, matches, games, stats, certificates, phases, dependencies, schedules, revisions,
    completion, publications, generation, actions, incidents, readiness, audits, editRevisions, previewTokens };
}

function validateLegacy(state, spec) {
  const { event, teams, players, matches, games, stats, certificates } = state;
  if (event.slug !== spec.slug || event.name !== spec.name || event.status !== spec.status ||
      event.format !== 'Single Elimination' || event.gameId !== 'game-flashpeak' || event.gameModeId !== 'mode-flashpeak-5v5' ||
      event.participantCap !== spec.cap || event.venue !== spec.venue || event.registrationWindow !== spec.window ||
      event.startsAt !== spec.starts || event.organizerName !== 'Flashpeak Organizer' || !event.organizerVerified ||
      !event.organizerUserId || teams.length !== spec.teams || players.length !== spec.teams || matches.length !== spec.matches ||
      players.some(player => player.eventId !== event.id || !teams.some(team => team.id === player.teamId)) ||
      new Set(players.map(player => player.teamId)).size !== players.length) throw fail('FIXTURE_DRIFT');
  if (spec.status === 'Finished') {
    if (games.length !== 12 || stats.length !== 1 || certificates.length !== 1 ||
        stats[0].source !== 'admin' || stats[0].lastUpdatedBy !== event.organizerUserId ||
        !players.some(player => player.id === stats[0].playerId && player.teamId === stats[0].teamId &&
          player.displayName === stats[0].playerName && player.position === stats[0].position) ||
        !matches.some(match => match.id === stats[0].matchId && match.winnerTeamId === stats[0].teamId) ||
        stats[0].gameSlug !== 'flashpeak' ||
        ['goal', 'assist', 'passing', 'defense'].some(key => !Number.isFinite(stats[0].stats?.[key]) || stats[0].stats[key] < 0) ||
        certificates[0].eventId !== event.id) throw fail('FIXTURE_DRIFT');
  } else if (games.length || stats.length || certificates.length) throw fail('FIXTURE_DRIFT');
  return spec.matches ? buildFixtureGraph(event, teams, matches) : null;
}

async function validateReconstructed(tx, states, graphs, oldRowsSha256, backupSha256) {
  const ownedStateSha256 = states[1]?.phases[0]?.configuration?.ownedStateSha256;
  if (!/^[a-f0-9]{64}$/.test(ownedStateSha256 || '') || hash(ownedNewState(states)) !== ownedStateSha256) return false;
  for (const [index, state] of states.entries()) {
    const spec = TARGETS[index], graph = graphs[index]?.graph;
    if (state.publications || state.generation || state.actions || state.incidents || state.readiness || state.audits ||
        state.editRevisions || state.previewTokens || state.event.competitionVersion !== (spec.status === 'Finished' ? 2 : spec.matches ? 1 : 0) ||
        state.event.timezone !== 'Asia/Jakarta') return false;
    if (spec.matches === 0) {
      if (state.phases.length || state.dependencies.length || state.schedules.length || state.revisions.length ||
          hash(state.event.formatConfig) !== hash(graphs[1].graph.config) ||
          state.event.publishedScheduleVersion !== null ||
          Object.entries(PUBLISHED_DATES).some(([key, date]) => state.event[key]?.getTime() !== date.getTime())) return false;
    } else {
      const expectedConfiguration = { ...graph.phases[0], graph, drawing: { teams: graphs[index].seeds },
        syntheticReconstruction: MARKER, oldRowsSha256, backupSha256, ownedStateSha256 };
      if (state.phases.length !== 1 || state.phases[0].id !== graph.phases[0].id ||
          state.phases[0].eventId !== state.event.id || state.phases[0].sequence !== 1 ||
          state.phases[0].label !== graph.phases[0].kind || state.phases[0].status !== 'active' ||
          hash(state.phases[0].configuration) !== hash(expectedConfiguration) ||
          state.dependencies.length !== graph.dependencies.length || hash(state.event.formatConfig) !== hash(graph.config) ||
          graph.dependencies.some(dep => !state.dependencies.some(row => row.id === dep.id && row.sourceMatchId === dep.sourceMatchId && row.targetMatchId === dep.targetMatchId && row.outcome === dep.outcome && row.targetSlot === dep.targetSlot))) return false;
      for (const match of state.matches) {
        if (match.phaseId !== graph.phases[0].id || match.groupId !== null ||
            hash(match.scheduleMetadata) !== hash({ graphMatch: graph.matches.find(node => node.id === match.id), syntheticReconstruction: MARKER })) return false;
      }
    }
    if (spec.status === 'Ongoing' || spec.status === 'Finished') {
      const expectedSnapshot = {
        draft: createSyntheticSchedule(graph, state.matches, SCHEDULE[spec.slug]),
        input: SCHEDULE[spec.slug],
        baseMatches: matchSnapshot(state.matches.map(match => ({ ...match, scheduleStatus: 'estimated', resultVersion: 0,
          scheduledAt: null, scheduledEndsAt: null, scheduleRoom: null }))),
        syntheticReconstruction: MARKER,
      };
      if (state.schedules.length !== 1 || state.schedules[0].version !== 1 || state.schedules[0].status !== 'published' ||
          state.schedules[0].idempotencyKey !== `${MARKER}:${spec.slug}:schedule` ||
          state.event.publishedScheduleVersion !== 1 || hash(state.schedules[0].snapshot) !== hash(expectedSnapshot) ||
          state.schedules[0].createdById !== state.event.organizerUserId ||
          state.schedules[0].publishedById !== state.event.organizerUserId || !state.schedules[0].publishedAt ||
          state.event.eventStartsAt?.toISOString() !== SCHEDULE[spec.slug].eventWindow.start ||
          state.event.registrationOpensAt !== null || state.event.registrationClosesAt !== null) return false;
      for (const match of state.matches) {
        const assignment = state.schedules[0].snapshot.draft.assignments.find(row => row.matchId === match.id);
        if (!assignment || match.scheduleVersion !== 1 || match.scheduleRoom !== assignment.roomId ||
            match.scheduledAt?.toISOString() !== assignment.start || match.scheduledEndsAt?.toISOString() !== assignment.end ||
            match.scheduleStatus !== (match.status === 'Live' ? 'live' : match.status === 'Completed' ? 'completed' : 'confirmed') ||
            match.actualStartedAt || match.actualEndedAt) return false;
      }
    } else if (state.schedules.length || state.event.publishedScheduleVersion !== null ||
        spec.matches && (state.event.eventStartsAt !== null || state.matches.some(match =>
          match.scheduleStatus !== 'estimated' || match.scheduledAt || match.scheduledEndsAt || match.scheduleRoom ||
          match.scheduleVersion || match.actualStartedAt || match.actualEndedAt))) return false;
    if (spec.status === 'Finished') {
      const scores = validateResults(state, graph);
      const podium = competitionProjection(graph, state.matches).placements;
      if (state.revisions.length !== 8 || state.revisions.some(rev => rev.version !== 1 || rev.reason !== REASON ||
          rev.eventId !== state.event.id || rev.actorUserId !== state.event.organizerUserId ||
          rev.idempotencyKey !== `${MARKER}:${rev.matchId}:result` ||
          rev.createdAt.getTime() !== state.schedules[0].publishedAt.getTime() ||
          rev.homeScore !== scores.get(rev.matchId)?.homeScore || rev.awayScore !== scores.get(rev.matchId)?.awayScore ||
          rev.winnerTeamId !== scores.get(rev.matchId)?.winnerTeamId ||
          hash(rev.scoreSnapshot) !== hash(scores.get(rev.matchId))) ||
          state.matches.some(match => match.resultVersion !== 1 || !match.resultConfirmedAt ||
            match.resultConfirmedAt.getTime() !== state.schedules[0].publishedAt.getTime() ||
            !state.revisions.some(rev => rev.matchId === match.id) || hash(match.resultSnapshot) !== hash(scores.get(match.id))) ||
          !state.completion || state.completion.status !== 'completed' || state.completion.podiumPlacements.length !== 3 ||
          state.completion.awards.length !== 4 || state.completion.awards.some(award => award.status !== 'approved' || !award.decision) ||
          new Set(state.completion.awards.map(award => award.type)).size !== 4 ||
          ['mvp', 'top_scorer', 'top_defender', 'top_assist'].some(type => !state.completion.awards.some(award => award.type === type)) ||
          state.completion.podiumPlacements.some(row => row.teamId !== podium.find(item => item.rank === row.rank)?.teamId ||
            row.teamName !== state.teams.find(team => team.id === row.teamId)?.name || row.source !== 'official_playoff') ||
          state.completion.awards.some(award => award.decision.recipientId !== state.stats[0].playerId || award.decision.reason !== REASON) ||
          state.completion.auditEntries.length !== 1 || state.completion.auditEntries[0].idempotencyKey !== COMPLETION_KEY) return false;
      const actor = { id: state.event.organizerUserId, role: 'organizer' };
      const source = await createPrismaCompletionDependenciesInTransaction(actor, tx)
        .transaction(state.event.id, transaction => transaction.loadSource());
      const candidates = deriveAwardCandidates(source.statistics);
      const awardNames = ['mvp', 'top_scorer', 'top_defender', 'top_assist'];
      const expectedPodium = podium.map(row => ({ rank: row.rank, teamId: row.teamId,
        teamName: state.teams.find(team => team.id === row.teamId)?.name }));
      const expectedAwards = awardNames.map(award => ({ award,
        recipient: candidates[award].find(row => row.playerId === state.stats[0].playerId),
        candidates: candidates[award], reason: REASON }));
      const expectedSnapshot = { eventId: state.event.id, version: 2, actor, podium: expectedPodium,
        awards: expectedAwards, source };
      const completion = state.completion;
      if (hash(completion.sourceSnapshot) !== hash(expectedSnapshot) || completion.eventId !== state.event.id ||
          completion.format !== graph.config.kind || completion.completedByUserId !== actor.id ||
          !completion.completedAt || completion.completedAt < state.schedules[0].publishedAt ||
          completion.certificateRevision !== 0 || completion.reopenedAt || completion.reopenedByUserId ||
          completion.reopenReason) return false;
      for (const award of completion.awards) {
        const chosen = expectedAwards.find(row => row.award === award.type);
        const recipient = chosen?.recipient;
        if (!recipient || hash(award.candidateSnapshot) !== hash(chosen.candidates) ||
            award.decision.recipientKind !== 'player' || award.decision.recipientId !== recipient.playerId ||
            award.decision.recipientName !== recipient.playerName || award.decision.teamId !== recipient.teamId ||
            award.decision.teamName !== recipient.teamName || award.decision.decidedByUserId !== actor.id ||
            award.decision.reason !== REASON || !award.decision.decidedAt) return false;
      }
      const decisionRows = awardNames.map(award => ({ award, playerId: state.stats[0].playerId, reason: REASON }));
      const fingerprint = JSON.stringify({ action: 'complete', expectedVersion: 1, decisions: decisionRows });
      const audit = completion.auditEntries[0];
      const result = { status: 'completed', eventId: state.event.id, version: 2, snapshot: expectedSnapshot };
      if (audit.action !== 'completed' || audit.actorUserId !== actor.id || audit.reason !== null ||
          audit.fingerprint !== fingerprint || hash(audit.result) !== hash(result) ||
          hash(audit.details) !== hash({ actorRole: actor.role, fingerprint, result }) ||
          audit.createdAt < completion.completedAt) return false;
    } else if (state.revisions.length || state.completion || state.matches.some(match =>
      match.resultVersion !== 0 || match.resultSnapshot !== null || match.resultConfirmedAt !== null)) return false;
  }
  return true;
}

function validateEmptyV3(states) {
  for (const state of states) {
    const event = state.event;
    if (state.phases.length || state.dependencies.length || state.schedules.length || state.revisions.length || state.completion ||
        state.publications || state.generation || state.actions || state.incidents || state.readiness || state.audits ||
        state.editRevisions || state.previewTokens || event.formatConfig !== null || event.competitionVersion !== 0 ||
        event.publishedScheduleVersion !== null || event.registrationOpensAt || event.registrationClosesAt || event.eventStartsAt ||
        state.matches.some(match => match.phaseId || match.groupId || match.scheduledAt || match.scheduledEndsAt ||
          match.actualStartedAt || match.actualEndedAt || match.scheduleRoom || match.scheduleVersion || match.scheduleMetadata ||
          match.resultVersion !== 0 || match.resultSnapshot || match.resultConfirmedAt || match.scheduleStatus !== 'estimated')) throw fail('UNKNOWN_V3_STATE');
  }
}

function validateResults(state, graph) {
  const result = new Map();
  for (const match of state.matches) {
    const node = graph.matches.find(row => row.id === match.id);
    const games = state.games.filter(row => row.matchId === match.id).map(row => ({ gameNumber: row.gameNumber, homeScore: row.homeScore, awayScore: row.awayScore }));
    if (games.some(game => !Number.isSafeInteger(game.homeScore) || game.homeScore < 0 ||
      !Number.isSafeInteger(game.awayScore) || game.awayScore < 0)) throw fail('FIXTURE_DRIFT');
    const score = scoreResult(match, node, games);
    if (score.homeScore !== match.homeScore || score.awayScore !== match.awayScore || score.winnerTeamId !== match.winnerTeamId ||
        games.length !== (node.bestOf === 1 ? 1 : Math.ceil(node.bestOf / 2))) throw fail('FIXTURE_DRIFT');
    result.set(match.id, score);
  }
  return result;
}

async function applyMetadata(tx, states, graphs, now, oldRowsSha256, backupSha256) {
  for (const [index, state] of states.entries()) {
    const spec = TARGETS[index], { event, matches } = state;
    if (!spec.matches) {
      await tx.event.update({ where: { id: event.id }, data: { ...PUBLISHED_DATES, formatConfig: graphs[1].graph.config, updatedAt: event.updatedAt } });
      continue;
    }
    const { graph, seeds } = graphs[index];
    const scheduleInput = SCHEDULE[spec.slug];
    const draft = scheduleInput ? createSyntheticSchedule(graph, matches, scheduleInput) : null;
    const resultScores = spec.status === 'Finished' ? validateResults(state, graph) : null;
    for (const phase of graph.phases) await tx.competitionPhase.create({ data: { id: phase.id, eventId: event.id, label: phase.kind, sequence: phase.sequence, status: 'active', configuration: json({ ...phase, graph, drawing: { teams: seeds }, syntheticReconstruction: MARKER, oldRowsSha256, backupSha256 }) } });
    for (const dependency of graph.dependencies) await tx.matchDependency.create({ data: { ...dependency, eventId: event.id } });
    if (draft) await tx.scheduleRevision.create({ data: { eventId: event.id, version: 1, status: 'published', snapshot: json({ draft, input: scheduleInput, baseMatches: matchSnapshot(matches), syntheticReconstruction: MARKER }), idempotencyKey: `${MARKER}:${spec.slug}:schedule`, createdById: event.organizerUserId, publishedById: event.organizerUserId, publishedAt: now } });
    for (const match of matches) {
      const node = graph.matches.find(row => row.id === match.id);
      const assignment = draft?.assignments.find(row => row.matchId === match.id);
      const score = resultScores?.get(match.id);
      if (score) await tx.matchResultRevision.create({ data: { eventId: event.id, matchId: match.id, version: 1, homeScore: score.homeScore, awayScore: score.awayScore, winnerTeamId: score.winnerTeamId, scoreSnapshot: json(score), actorUserId: event.organizerUserId, reason: REASON, idempotencyKey: `${MARKER}:${match.id}:result`, createdAt: now } });
      await tx.match.update({ where: { id: match.id }, data: { phaseId: node.phaseId, scheduleMetadata: json({ graphMatch: node, syntheticReconstruction: MARKER }),
        ...(assignment ? { scheduledAt: new Date(assignment.start), scheduledEndsAt: new Date(assignment.end), scheduleRoom: assignment.roomId, scheduleVersion: 1,
          scheduleStatus: match.status === 'Live' ? 'live' : match.status === 'Completed' ? 'completed' : 'confirmed' } : {}),
        ...(score ? { resultVersion: 1, resultSnapshot: json(score), resultConfirmedAt: now } : {}), updatedAt: match.updatedAt } });
    }
    await tx.event.update({ where: { id: event.id }, data: { formatConfig: json(graph.config), competitionVersion: 1,
      ...(draft ? { publishedScheduleVersion: 1, eventStartsAt: new Date(scheduleInput.eventWindow.start) } : {}), updatedAt: event.updatedAt } });
  }
  const finished = states[3];
  const actor = { id: finished.event.organizerUserId, role: 'organizer' };
  const decisions = ['mvp', 'top_scorer', 'top_defender', 'top_assist'].map(award => ({ award, playerId: finished.stats[0].playerId, reason: REASON }));
  const completion = await completeTournament(finished.event.id, decisions, 1, COMPLETION_KEY,
    createPrismaCompletionDependenciesInTransaction(actor, tx));
  if (completion.status !== 'completed') throw fail('COMPLETION_REJECTED');
  await tx.event.update({ where: { id: finished.event.id }, data: { updatedAt: finished.event.updatedAt } });
}

/** Fixed-target reconstruction; admission is already verified by the caller. No retry. */
export async function runFixtureRecoverySession(db, admission) {
  const { baseline, reference, expectedLedger, identity, manifest, verified } = admission;
  return db.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '120s'");
    await tx.$executeRawUnsafe("SET LOCAL idle_in_transaction_session_timeout = '180s'");
    const tables = buildTargetCatalog(baseline, reference).tables.map(row => `public.${quote(row.name)}`).join(', ');
    await tx.$executeRawUnsafe(`LOCK TABLE ${tables} IN ACCESS EXCLUSIVE MODE NOWAIT`);
    const current = await marker(tx, checkpointSelect(), 'MIRACLE_CHECKPOINT');
    const validated = validateTestingCheckpoint(current, expectedLedger, baseline, reference, identity);
    if (validated.state !== 'repaired') throw fail('CATALOG_DRIFT');
    const catalog = await tx.$queryRawUnsafe(`SELECT (${CATALOG_SQL})::text AS catalog`);
    if (assertCatalogState(JSON.parse(catalog[0].catalog), baseline, reference, 'after') !== 'repaired') throw fail('CATALOG_DRIFT');
    const source = await tx.$queryRawUnsafe("SELECT current_database() AS database, current_setting('neon.branch_id', true) AS branch, (SELECT count(*)::int FROM pg_stat_activity WHERE datname=current_database() AND pid <> pg_backend_pid() AND state <> 'idle') AS other_active");
    if (source[0].database !== identity.database || source[0].branch !== identity.branch || source[0].other_active !== 0) throw fail('SOURCE_REJECTED');
    const events = await tx.event.findMany({ where: { slug: { in: TARGETS.map(spec => spec.slug) } }, orderBy: { slug: 'asc' } });
    if (events.length !== 4 || new Set(events.map(event => event.id)).size !== 4) throw fail('FIXTURE_DRIFT');
    const states = [];
    const graphs = [];
    for (const spec of TARGETS) {
      const event = events.find(row => row.slug === spec.slug);
      if (!event) throw fail('FIXTURE_DRIFT');
      const state = await stateFor(tx, event);
      states.push(state);
      graphs.push(validateLegacy(state, spec));
    }
    if (new Set(states.map(state => state.event.organizerUserId)).size !== 1) throw fail('FIXTURE_DRIFT');
    const organizer = await tx.user.findUnique({ where: { id: states[0].event.organizerUserId } });
    if (!organizer || organizer.role !== 'organizer' || organizer.deactivatedAt || organizer.mustChangePassword) throw fail('SOURCE_REJECTED');
    assertTestingBackupReceipt(manifest, verified, manifest.checkpoint);
    if (manifest.checkpoint.ledgerSha256 !== validated.checkpoint.ledgerSha256 ||
        manifest.checkpoint.schemaSha256 !== validated.checkpoint.schemaSha256) throw fail('BACKUP_REJECTED');
    const oldSql = oldRowProjectionSql(baseline, reference);
    const oldBefore = await marker(tx, oldSql, 'TASK12_ROWS');
    const oldRowsSha256 = hash(oldBefore);
    if (await validateReconstructed(tx, states, graphs, oldRowsSha256, manifest.sha256)) return { status: 'TESTING_FIXTURES_ALREADY_RECONSTRUCTED', ledgerSha256: validated.checkpoint.ledgerSha256, oldRowsSha256, newRowsSha256: states[1].phases[0].configuration.ownedStateSha256, reconstructedAt: states[3].schedules[0].publishedAt.toISOString() };
    validateEmptyV3(states);
    assertTestingBackupReceipt(manifest, verified, validated.checkpoint);
    await applyMetadata(tx, states, graphs, new Date(), oldRowsSha256, manifest.sha256);
    const oldAfter = await marker(tx, oldSql, 'TASK12_ROWS');
    if (hash(oldBefore) !== hash(oldAfter)) throw fail('ROW_DRIFT');
    const after = [];
    for (const state of states) after.push(await stateFor(tx, await tx.event.findUniqueOrThrow({ where: { id: state.event.id } })));
    const newRowsSha256 = hash(ownedNewState(after));
    for (const state of after.filter(row => row.phases.length)) {
      const phase = state.phases[0];
      await tx.competitionPhase.update({ where: { id: phase.id }, data: {
        configuration: json({ ...phase.configuration, ownedStateSha256: newRowsSha256 }), updatedAt: phase.updatedAt,
      } });
    }
    const final = [];
    for (const state of states) final.push(await stateFor(tx, await tx.event.findUniqueOrThrow({ where: { id: state.event.id } })));
    if (!await validateReconstructed(tx, final, graphs, oldRowsSha256, manifest.sha256)) throw fail('RECONSTRUCTION_DRIFT');
    return { status: 'TESTING_FIXTURES_RECONSTRUCTED', ledgerSha256: validated.checkpoint.ledgerSha256,
      oldRowsSha256, newRowsSha256, reconstructedAt: final[3].schedules[0].publishedAt.toISOString() };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 240_000 });
}

function receiptFor(result, backupSha256) {
  return {
    format: 'task13-synthetic-fixture-recovery-v1', sourceBase: 'ccc78acf37697fb6e4ba79037ba85a4162cc3e35',
    backupSha256, ledgerSha256: result.ledgerSha256, oldRowsSha256: result.oldRowsSha256,
    newRowsSha256: result.newRowsSha256, reconstructedAt: result.reconstructedAt, provenance: MARKER,
  };
}

async function publishRecoveryReceipt(directory, name, expected) {
  const target = join(directory, name);
  async function verifyExisting() {
    let entry;
    try { entry = await lstat(target); }
    catch (error) { if (error?.code === 'ENOENT') return false; throw error; }
    if (!entry.isFile() || entry.isSymbolicLink() || !(await readFile(target)).equals(expected)) throw fail('RECEIPT_CONFLICT');
    return true;
  }
  if (await verifyExisting()) return 'verified';
  const temporary = join(directory, `.task13-receipt-${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(expected);
    await handle.sync();
    await handle.close(); handle = undefined;
    try { await link(temporary, target); }
    catch (error) {
      if (error?.code === 'EEXIST' && await verifyExisting()) return 'verified';
      throw error;
    }
    return 'created';
  } finally {
    if (handle) await handle.close().catch(() => {});
    await unlink(temporary).catch(() => {});
  }
}

/** After a committed DB result, receipt failure is an explicit recoverable status. */
export async function runFixtureRecoveryWithReceipt(db, admission, directory, publisher = publishRecoveryReceipt) {
  const databaseResult = await runFixtureRecoverySession(db, admission);
  const name = `task13-fixture-recovery-${admission.manifest.sha256}.json`;
  const bytes = Buffer.from(`${JSON.stringify(receiptFor(databaseResult, admission.manifest.sha256))}\n`, 'utf8');
  try {
    const receiptStatus = await publisher(directory, name, bytes);
    return { ...databaseResult, receiptStatus };
  } catch (error) {
    return { status: error?.code === 'RECEIPT_CONFLICT' ? 'TESTING_FIXTURES_COMMITTED_RECEIPT_CONFLICT' : 'TESTING_FIXTURES_COMMITTED_RECEIPT_PENDING',
      databaseStatus: databaseResult.status, backupSha256: admission.manifest.sha256, receiptName: name };
  }
}

async function main() {
  if (process.argv.length !== 4 || process.argv[2] !== '--manifest') throw fail('CONFIG_REJECTED');
  const config = await prepareFixedTestingExport();
  await verifyTestingFrontendTls();
  const { manifest, verified } = await readReceipt(config.output, process.argv[3]);
  const { baseline, reference } = await readPinnedTestingCatalogs();
  const expectedLedger = config.expectedLedger;
  const pinnedCa = await verifyPinnedCaBundle();
  const db = new PrismaClient({ datasources: { db: { url: buildPinnedTestingPrismaUrl(config.source.url, pinnedCa) } } });
  try {
    const result = await runFixtureRecoveryWithReceipt(db,
      { baseline, reference, expectedLedger, identity: TESTING_IDENTITY, manifest, verified }, config.output);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.status === 'TESTING_FIXTURES_COMMITTED_RECEIPT_PENDING' ||
        result.status === 'TESTING_FIXTURES_COMMITTED_RECEIPT_CONFLICT') process.exitCode = 2;
  } finally { await db.$disconnect(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  const allowed = new Set(['CONFIG_REJECTED', 'SOURCE_REJECTED', 'BACKUP_REJECTED', 'CHECKPOINT_DRIFT', 'CATALOG_DRIFT', 'FIXTURE_DRIFT', 'UNKNOWN_V3_STATE', 'ROW_DRIFT', 'RECONSTRUCTION_DRIFT', 'COMPLETION_REJECTED']);
  process.stderr.write(`${allowed.has(error?.code) ? error.code : 'FIXTURE_RECOVERY_FAILED'}\n`);
  process.exitCode = 1;
});
