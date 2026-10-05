import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildSourceMetadataSql, summarizeSourceMetadataLine, buildSourceDigestSql,
  summarizeSourceDigestLine } from '../../scripts/operations/local-rehearsal-source-metadata.mjs';

const schema = [{ table_name: 'User', column_name: 'id', data_type: 'text', is_nullable: 'NO', ordinal_position: 1 }];
const sha = createHash('sha256').update(JSON.stringify(schema)).digest('hex');
const tableMetadata = Object.fromEntries(['User', 'Team', 'Player', 'PlayerStat'].map(name =>
  [name, { tableFound: true, hasDropped: false, hasTimestamptz: false, hasTemporal: false, hasInterval: false,
    hasFloat: false, hasBytea: false, hasGenerated: false }]));
const settings = { TimeZone: 'UTC', DateStyle: 'ISO, MDY', IntervalStyle: 'postgres',
  extra_float_digits: '1', bytea_output: 'hex', server_encoding: 'UTF8', lc_collate: 'English_United States.1252',
  collationProvider: 'c', collationLocale: '' };

test('source metadata result emits fixed status and excludes raw schema', () => {
  const line = `MIRACLE_SOURCE_METADATA\t${JSON.stringify({ schema, settings, tableMetadata })}`;
  const result = summarizeSourceMetadataLine(line, sha);
  assert.equal(result.currentSchemaMatchesManifest, true);
  assert.deepEqual(result.settings, settings);
  assert.deepEqual(result.tableMetadata, tableMetadata);
  assert.equal(result.historicalSessionSettingsKnown, false);
  assert.equal(JSON.stringify(result).includes('column_name'), false);
  assert.equal(JSON.stringify(result).includes('email'), false);
  assert.equal(summarizeSourceMetadataLine(line, '0'.repeat(64)).currentSchemaMatchesManifest, false);
});

test('source metadata rejects malformed or extra output without echoing it', () => {
  const payload = { schema, settings, tableMetadata, secret: 'private text' };
  for (const line of [
    `MIRACLE_SOURCE_METADATA\t${JSON.stringify(payload)}`,
    `MIRACLE_SOURCE_METADATA\t${JSON.stringify({ schema, settings, tableMetadata })}\nmore`,
    `MIRACLE_SOURCE_METADATA\t${JSON.stringify({ schema: [], settings, tableMetadata })}`,
  ]) {
    assert.throws(() => summarizeSourceMetadataLine(line, sha), error =>
      error.code === 'SOURCE_METADATA_REJECTED' && !error.message.includes('private text'));
  }
});

test('source metadata SQL has one read-only transaction and catalog-only metadata', () => {
  const sql = buildSourceMetadataSql();
  assert.match(sql, /^BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;/);
  assert.match(sql, /SET LOCAL statement_timeout = '20s';/);
  assert.match(sql, /ROLLBACK;\s*$/);
  assert.doesNotMatch(sql, /pg_export_snapshot|FROM public\."(?:User|Team|Player|PlayerStat)"/);
  assert.match(sql, /information_schema\.columns/);
  assert.match(sql, /pg_attribute/);
});

test('source digest reports only equality flags for four affected tables and Event control', () => {
  const expected = Object.fromEntries(['User', 'Team', 'Player', 'PlayerStat', 'Event'].map(name => [name, 'a'.repeat(32)]));
  const actual = { ...expected, PlayerStat: 'b'.repeat(32) };
  const result = summarizeSourceDigestLine(`MIRACLE_SOURCE_DIGEST\t${JSON.stringify(actual)}`, expected);
  assert.deepEqual(result.currentMatchesManifest, {
    User: true, Team: true, Player: true, PlayerStat: false, Event: true,
  });
  assert.equal(result.historicalDataStateKnown, false);
  assert.equal(JSON.stringify(result).includes('a'.repeat(32)), false);
  assert.equal(JSON.stringify(result).includes('b'.repeat(32)), false);
});

test('source digest rejects extra output, missing table and malformed hash without echo', () => {
  const expected = Object.fromEntries(['User', 'Team', 'Player', 'PlayerStat', 'Event'].map(name => [name, 'a'.repeat(32)]));
  for (const bad of [
    { ...expected, private_data: 'x'.repeat(32) },
    { User: 'a'.repeat(32) },
    { ...expected, User: 'raw record value' },
  ]) {
    assert.throws(() => summarizeSourceDigestLine(`MIRACLE_SOURCE_DIGEST\t${JSON.stringify(bad)}`, expected),
      error => error.code === 'SOURCE_METADATA_REJECTED' && !error.message.includes('raw record value'));
  }
});

test('source digest SQL is a fixed read-only query of exactly five tables', () => {
  const sql = buildSourceDigestSql();
  assert.match(sql, /^BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;/);
  assert.match(sql, /ROLLBACK;\s*$/);
  assert.equal((sql.match(/FROM public\."(?:User|Team|Player|PlayerStat|Event)"/g) || []).length, 5);
  assert.doesNotMatch(sql, /pg_export_snapshot|UPDATE|INSERT|DELETE|CREATE/);
});
