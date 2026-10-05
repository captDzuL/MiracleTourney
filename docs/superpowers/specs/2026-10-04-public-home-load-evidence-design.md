# Homepage load evidence without hiding cold failure

Human approved “oke lanjutkan” and “sorry lanjutkan” after the proposal to measure ID/EN load while retaining the failed cold request and unchanged 3-second gate.

Only the homepage diagnostic lane may continue after a latency-only failure on a complete successful-content response. Preserve the original result with passed=false. Complete both existing homepage warmups and then /id and /en load (40 requests each, concurrency10). A measured latency-only failure can also be retained while collecting the other locale. Any content, status, request, timeout, incomplete result, invalid metric or unknown failure still aborts further scenarios. Ordinary production-like/default/full-public pressure behavior remains immediate fail-closed.

Final acceptance is unchanged: every warmup and measured result must pass, strict p95 <3,000ms and zero failures. Any retained latency failure makes the process exit nonzero and evidence.status=failed. Preserve the FIRST failure's actual stage/path/kind even when later scenarios pass; no misleading attribution to the last good /en result. Each warmup/load result remains independently recorded; do not combine cold samples with measured-load percentiles.

Use the existing homepage-only CLI route, fixtures, build, 10-second fetch/body deadline, guarded environment, serial database group, safe artifact and trace bounds. No retry, extra warmups, larger workload, raw logs/HTML/PII, database reset/seed/migration, production change, app reader/SQL/cache change, full-public or whole-app E2E.

TDD must cover continued two-locale evidence after cold latency, nonzero final failure, correct first-failure metadata, measured latency retention, content/HTTP/timeout/request/incomplete/unknown aborts, default mode isolation, passing unchanged path and safe artifact integration. Review before one normal push and one exact-SHA homepage CI run. This task gathers missing evidence; it does not fix homepage latency or grant production READY.
