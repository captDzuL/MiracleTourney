import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PINNED_CA_PATH } from '../../scripts/operations/local-backup-ca.mjs';
import * as recovery from '../../scripts/operations/testing-fixture-recovery-session.mjs';

const exact = 'postgresql://operator:synthetic-password@ep-delicate-forest-azuodo4q.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full&sslrootcert=system&channel_binding=require';

test('fixed testing Prisma connection requires strict TLS with the verified pinned CA and preserves channel binding', () => {
  const translated = new URL(recovery.buildPinnedTestingPrismaUrl(exact, PINNED_CA_PATH));
  assert.equal(translated.hostname, 'ep-delicate-forest-azuodo4q.c-3.ap-southeast-1.aws.neon.tech');
  assert.equal(translated.pathname, '/neondb');
  assert.equal(translated.searchParams.get('sslmode'), 'require');
  assert.equal(translated.searchParams.get('sslaccept'), 'strict');
  assert.equal(translated.searchParams.get('sslcert'), PINNED_CA_PATH);
  assert.equal(translated.searchParams.get('channel_binding'), 'require');
  assert.equal(translated.searchParams.has('sslrootcert'), false);
  assert.deepEqual([...translated.searchParams.keys()].sort(), ['channel_binding', 'sslaccept', 'sslcert', 'sslmode']);
  assert.throws(() => recovery.buildPinnedTestingPrismaUrl(exact, 'E:/unverified-ca.pem'), /SOURCE_REJECTED/);
  assert.throws(() => recovery.buildPinnedTestingPrismaUrl(exact.replace('channel_binding=require', 'channel_binding=prefer'), PINNED_CA_PATH), /SOURCE_REJECTED/);
  assert.throws(() => recovery.buildPinnedTestingPrismaUrl(exact.replace('delicate-forest', 'sparkling-night'), PINNED_CA_PATH), /SOURCE_REJECTED/);
});
