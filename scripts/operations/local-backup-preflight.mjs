import { buildCheckpointSql, LEGACY_TABLES, runCheckpointOnly } from './local-backup-snapshot.mjs';
import { prepareFixedPreflight } from './local-backup-operator.mjs';

function fail(code) { const error = new Error(code); error.code = code; return error; }

async function main() {
  if (process.argv.length !== 2) throw fail('CONFIG_REJECTED');
  const config = await prepareFixedPreflight();
  const result = await runCheckpointOnly({
    path: config.psqlPath,
    args: ['-X', '-q', '-A', '-t', '-w', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate'],
    env: config.pgEnv, sql: buildCheckpointSql(), timeoutMs: 1_500_000,
  }, config.expectedLedger, LEGACY_TABLES);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch(error => {
  const allowed = new Set(['CONFIG_REJECTED', 'SOURCE_REJECTED', 'OUTPUT_REJECTED', 'CAPACITY_REJECTED', 'KEY_NOT_READY', 'TOOL_REJECTED', 'CHECKPOINT_DRIFT', 'CHECKPOINT_FAILED']);
  const code = allowed.has(error?.code) ? error.code : 'BACKUP_PREFLIGHT_FAILED';
  const diagnostics = new Set(['TIMEOUT', 'TLS_CHAIN', 'TLS_HOSTNAME', 'TLS_CA_LOAD', 'AUTH', 'TLS_OTHER', 'SQL', 'UNKNOWN']);
  const suffix = code === 'CHECKPOINT_FAILED' && diagnostics.has(error?.diagnostic) ? `:${error.diagnostic}` : '';
  process.stderr.write(`${code}${suffix}\n`);
  process.exitCode = 1;
});
