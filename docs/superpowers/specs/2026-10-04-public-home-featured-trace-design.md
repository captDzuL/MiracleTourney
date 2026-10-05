# Safe featured-read diagnosis

The human approved safe error recording on the homepage featured-event read followed by one targeted guarded load run. This is diagnostic instrumentation, not application fix attempt3, a gate waiver, or permission for repeated CI.

Evidence at SHA60c966e/run37171016175: /id initial4,298.152ms; /id load40@10 p952,787.236ms but3/40 content failures, discovery ready and featured read_failure. The internal failing stage is unknown. Do not infer transaction/pool error from those markers.

## Design

Reuse the existing homepage-only trace flag and safe stdout-to-pressure.json channel. Other pressure modes force tracing off. Add a focused server trace helper and separate finite featured trace collector. Emit only fixed stage identifiers, fixed error classifications, counts and capped numeric durations. No slug, ID, row, SQL, error message/stack/meta, URL, configuration, credential, email or PII. No additional client diagnostic detail.

Instrument the narrow featured reader's outer read, transaction entry/completion, joined event read, optional published revision read, projection and full-reader fallback. Trace transaction-start outside the callback and transaction-enter inside it so acquisition/entry failure can be distinguished from callback/query/projection or commit failure. A completed callback followed by transaction rejection is a distinct observation, not automatic proof of a particular Prisma error. Instrument the homepage identity-check/catch boundary sufficiently to distinguish a reader rejection from a later identity access throw.

Error classification must use an explicit allowlist: P2028 -> transaction_error; P2024 -> pool_timeout; P1001/P1002/P1017 -> connection_error; P2034 -> transaction_conflict; known validation/type failures -> validation_error or projection_error where justified by stage; all other values -> unknown_error. Never emit raw exception properties, raw names or arbitrary codes. Use per-invocation stage state, not shared mutable current-operation state. Record stage and classification together so concurrent failures cannot be attributed to another request.

Tracing is observational: preserve query arguments/order/count/bounds, RepeatableRead, transaction options, flags, projection and fallback semantics. Any catch rethrows the original error unchanged. Do not add retries, queries, connection operations, delays, transactions, caching or error-to-success conversions. Diagnostic logging must not mask the original result if logging fails.

Collector accepts only the exact allowlisted format, rejects unknown/malformed/nonfinite/oversized values, bounds partial-line storage to4,096 characters, counters to10,000 and durations to99,999ms. Store only finite aggregates in a separate featuredTrace object; retain existing discoveryTrace and failure/content evidence independently. Default mode must not serialize or emit featured diagnostics.

## Verification

TDD against real trace emission, reader promise behavior and runner collection/serialization: enabled/disabled, each error class with hostile message/meta, transaction entry versus query/projection/fallback failure, original error identity, concurrent stage isolation, unchanged result/query behavior, malformed/split/unknown lines and bounded counters/durations. No source-string-only tests. Run only new/affected trace, home reader, home rendering and pressure tests; TypeScript, changed-file ESLint, syntax and diff checks. Report exact commands/counts/durations/outputs, self-review and commit. Fresh task-scoped spec+quality review before push.

Then one normal push carrying [ci:public-v3-home] and one exact-SHA homepage CI. Same guarded fixtures, serial shared-test group, no reset/reseed/migration, no production access. Preserve original ID/EN1@1 warmups and40@10 loads, strict p95<3,000ms/zero failures,10-second fetch deadline and fail-closed content behavior. Download only safe home-evidence JSON. Report actual observed stage/class or inconclusive, not a guessed RCA. No full-public54 selection, whole-app shards, retry, next speculative fix wave, PR/READY/deployment claim from this diagnostic run.
