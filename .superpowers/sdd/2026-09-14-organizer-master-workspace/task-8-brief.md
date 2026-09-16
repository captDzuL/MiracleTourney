# Task 8 implementation brief

Approved base: 465192fa8527b6463bccaee1ff0f27443292a9b7.
Implement URL-backed result/statistics/history match detail using authoritative result controls and MatchGame data. Preserve Miracle tokens/Montserrat and complete next-intl ID/EN.

Captain and organizer share canonical parser. Claim pending status before PlayerStat writes in one Serializable transaction. Controller approved guard expansion using existing event lock and CompetitionAuditLog receipt, no schema/new engine. Legacy production callers use same authorized core. V3 enforces expected event/result/submission versions and operation replay.

Strict RED/GREEN, focused suite, non-production preflight/E2E master on/off, ID/EN five-width browser matrix, lint/typecheck/Prisma/diff/full committed-HEAD suite. No Task9, production, or protected report changes.
