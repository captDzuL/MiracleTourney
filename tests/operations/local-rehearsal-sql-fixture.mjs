import { buildCandidatePostcheckSql, buildSyntheticFlowSql } from '../../scripts/operations/local-rehearsal-runner.mjs';
import { buildSourceMetadataSql, buildSourceDigestSql,
  buildDeepComparisonSql, buildSourceRecoveryReferenceSql,
  buildLocalLogicalSql } from '../../scripts/operations/local-rehearsal-source-metadata.mjs';
import { LEGACY_TABLES } from '../../scripts/operations/local-backup-snapshot.mjs';
import { PG18_DLL_SHA256 } from '../../scripts/operations/pg18-dll-hashes.mjs';

if (process.argv[2] === 'postcheck' && process.argv.length === 3) {
  process.stdout.write(buildCandidatePostcheckSql());
} else if (process.argv[2] === 'flow' && /^[a-f0-9]{32}$/.test(process.argv[3] || '') && process.argv.length === 4) {
  process.stdout.write(buildSyntheticFlowSql(process.argv[3]));
} else if (process.argv[2] === 'dllhashes' && process.argv.length === 3) {
  process.stdout.write(JSON.stringify(PG18_DLL_SHA256));
} else if (process.argv[2] === 'source-metadata' && process.argv.length === 3) {
  process.stdout.write(buildSourceMetadataSql());
} else if (process.argv[2] === 'source-digest' && process.argv.length === 3) {
  process.stdout.write(buildSourceDigestSql());
} else if (process.argv[2] === 'deep-source' && process.argv.length === 3) {
  process.stdout.write(buildDeepComparisonSql('source'));
} else if (process.argv[2] === 'deep-local' && process.argv.length === 3) {
  process.stdout.write(buildDeepComparisonSql('local'));
} else if (process.argv[2] === 'recovery-source' && process.argv.length === 3) {
  process.stdout.write(buildSourceRecoveryReferenceSql());
} else if (process.argv[2] === 'recovery-local' && process.argv.length === 3) {
  process.stdout.write(buildLocalLogicalSql());
} else if (process.argv[2] === 'legacy-tables' && process.argv.length === 3) {
  process.stdout.write(JSON.stringify(LEGACY_TABLES));
} else {
  process.exitCode = 1;
}
