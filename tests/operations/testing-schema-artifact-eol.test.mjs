import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const pinned = [
  ['scripts/operations/testing-schema-baseline.json', '3cfe0977aae5e81852de23b73be5f73958b964456be141352bef0a211dbaf757'],
  ['scripts/operations/testing-schema-reference.json', 'a1d76982fd70ae25de73d86a34f99bc160540205a1926b543592df7aee82949f'],
  ['scripts/operations/testing-schema-repair.sql', '7a171cbf94e535d9cf34012ead6dec9b9b553d809dfb179ecdf4f2e931192a25'],
];
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('fresh Windows checkout preserves LF bytes for the three pinned schema artifacts', () => {
  const paths = pinned.map(([path]) => path);
  const attrs = execFileSync('git', ['-c', 'core.autocrlf=true', 'check-attr', 'eol', '--', ...paths], { encoding: 'utf8' });
  assert.deepEqual(attrs.trim().split(/\r?\n/), paths.map((path) => `${path}: eol: lf`));
  for (const [path, pin] of pinned) {
    const bytes = readFileSync(path);
    assert.equal(digest(bytes), pin);
    assert.notEqual(digest(Buffer.from(bytes.toString('utf8').replaceAll('\n', '\r\n'))), pin);
  }
});
