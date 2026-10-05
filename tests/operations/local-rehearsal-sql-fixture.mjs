import { buildCandidatePostcheckSql, buildSyntheticFlowSql } from '../../scripts/operations/local-rehearsal-runner.mjs';
import { buildSourceMetadataSql } from '../../scripts/operations/local-rehearsal-source-metadata.mjs';
import { PG18_DLL_SHA256 } from '../../scripts/operations/pg18-dll-hashes.mjs';

if (process.argv[2] === 'postcheck' && process.argv.length === 3) {
  process.stdout.write(buildCandidatePostcheckSql());
} else if (process.argv[2] === 'flow' && /^[a-f0-9]{32}$/.test(process.argv[3] || '') && process.argv.length === 4) {
  process.stdout.write(buildSyntheticFlowSql(process.argv[3]));
} else if (process.argv[2] === 'dllhashes' && process.argv.length === 3) {
  process.stdout.write(JSON.stringify(PG18_DLL_SHA256));
} else if (process.argv[2] === 'source-metadata' && process.argv.length === 3) {
  process.stdout.write(buildSourceMetadataSql());
} else {
  process.exitCode = 1;
}
