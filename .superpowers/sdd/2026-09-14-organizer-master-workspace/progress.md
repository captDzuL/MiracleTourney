# SDD ledger — plan: docs/superpowers/plans/2026-09-14-organizer-master-workspace.md

Started: 2026-09-15 Asia/Jakarta
Worktree: E:\dev\MiracleTourney-gitnative\.worktrees\miracle-ui-release-1.0-full
Branch: feature/ui/release/1.0
Task 1: in progress
Baseline: pnpm install --frozen-lockfile (exit 0); pnpm test (162 files passed, 2 skipped; 1759 tests passed, 6 skipped; 39.34s)
Task 1: review needs fixes — duplicate navigation labels; non-true flag values untested
Task 1: cross-task check — physical route resolution deferred to Tasks 6/10 and final E2E
Task 1: fix round 1/5 (2 addressed, 0 open; commits a48d581..041c82e)
Task 1: complete (commits e02c7a1..041c82e, review clean)
Task 2: in progress
Task 2: review needs fix — hardcoded Match Day copy in Indonesian edit setup
Task 2: fix round 1/5 (1 addressed, 0 open; commits f2f74cb..9ef3f8d)
Task 2: complete (commits 041c82e..9ef3f8d, review clean)
Task 3: in progress
Task 3: complete (905999c, review approved)
Task 4: in progress (base 905999c)
Task 4: complete (868a62a, review approved)
Task 4: fix round 1 in progress — confirmed P1 legacy global captain registration reader
Task 4: fix round 1 complete (90d2e07, route wired and review evidence green)
Task 4: complete (90d2e07, review approved)
Task 5: in progress (base 90d2e07)
Task 5: reviewer fix round 1 in progress — secure all event-local repository reads, restore legacy parser/mapping/expiry/repository semantics, and add faithful contract evidence
Task 5: reviewer fix round 1 RED — 7 failed, 145 passed in compatibility/contract tests before production fixes
Task 5: reviewer fix round 1 GREEN — focused 4 files/271 passed; contract evidence 1 file/5 passed; full 172 files passed/2 skipped, 1,893 passed/6 skipped
Task 5: reviewer fix round 1 complete — dedicated fix commit 7e28b1e3045b528d83224c46388596af056f8d53; no live DB claim, injected Prisma boundary limitation documented in task-5-report.md
Task 5: reviewer fix round 2 in progress — precise missing-mapping labels and exact legacy event-not-found redirect
Task 5: reviewer fix round 2 RED — 2 failed, 152 passed in affected contract/actions tests before production corrections
Task 5: reviewer fix round 2 GREEN — affected 2 files/154 passed; required focused 4 files/272 passed; full 172 files passed/2 skipped, 1,895 passed/6 skipped
Task 5: reviewer fix round 2 complete — dedicated fix commit bce4f53193cbb148e02016c98171dbf99f900036
Task 5: reviewer fix round 3 in progress - real shared-core missing-event lookup contract coverage
Task 5: reviewer fix round 3 GREEN - affected 2 files/155 passed; required focused 4 files/272 passed; full 172 files passed/2 skipped, 1,896 passed/6 skipped
Task 5: reviewer fix round 3 complete - dedicated fix commit pending handoff; no production source change required
Task 5: complete (7122cf1ea0d43469e4fc1570f61524393b24c64b, review approved)
Task 6: in progress (approved base 7122cf1ea0d43469e4fc1570f61524393b24c64b)
Task 6: RED/GREEN — routes, preview/upload adapter, components, conflicts, URL restoration and localized file controls verified; latest focused 9 files / 72 passed
Task 6: verification in progress — full production-component ID/EN browser matrix, final source commit and committed-HEAD full suite
Task 6: implementation complete — 3c25255128fd512cd9a18df80341c05b1f47f950; independent review pending
Task 6: GREEN — focused 9 files / 72 tests; browser 60 cases with no overflow/undersized targets/errors; committed-HEAD full 174 files passed / 2 skipped, 1,934 tests passed / 6 skipped; lint/typecheck/diff-check pass
Task 6: reviewer fix round 1 in progress — payment route-to-reader statuses, captain credential handoff, import pagination and cross-page retained selection
Task 6: reviewer fix round 1 RED/GREEN — payment 7 RED -> 14 GREEN; credentials 3 RED -> 16 GREEN; pagination 1 RED -> 17 GREEN
Task 6: reviewer fix round 1 verified — expanded 10 files / 88 tests; browser 12 cases ID/EN at 360/390/1280 with paging/selection/download/filter-refresh checks; lint/typecheck/diff-check pass; full 174 files passed / 2 skipped, 1,945 passed / 6 skipped
Task 6: reviewer fix round 1 implementation complete — dedicated fix commit follows 6feef6b; committed-HEAD full rerun and independent review handoff
Task 6: complete (135802f9db49e657c89059fb707ce5299b71cd0e, review approved)
Task 7: in progress (approved base 135802f9db49e657c89059fb707ce5299b71cd0e)
Task 7: RED/GREEN — 15 initial failures; lifecycle/active-phase/schedule-version and localized diagnostics regressions proved before fixes; final required 4 files / 90 passed
Task 7: Task 5 integration correction approved — Next use-server direct re-exports replaced by async wrappers; 1 RED -> 170 GREEN with existing action suites; commit 19c871011d49a57b252ca10448a0d438ecc26cae
Task 7: final browser matrix — 120 cases ID/EN, four formats, three screens and five widths; overflow/target/keyboard/selection checks pass
Task 7: safe Match Day E2E — exact chromium project command exposes existing config mismatch; unnamed msedge 10/10 pass with master off and 10/10 pass with master on, no flaky retries
Task 7: implementation verified — focused 90; full 1,971 passed / 6 skipped; typecheck/diff pass; lint 0 errors with one pre-existing actions.ts unused-function warning; independent review and committed-HEAD rerun follow
Task 7: reviewer fix round 1 in progress — preserve event-level tiebreak reason and blocked qualification detail, and route to canonical standings context
Task 7: reviewer fix round 1 RED/GREEN — 4 failing localized group/league cases before fix; required focused 4 files / 94 passed afterward
Task 7: reviewer fix round 1 browser — 8 ID/EN group/league cases at 360/1440 passed for reason/detail, canonical standings destination, keyboard activation and geometry; lint/typecheck/diff pass
Task 7: complete (465192fa8527b6463bccaee1ff0f27443292a9b7, review approved)
Task 8: in progress (approved base 465192fa8527b6463bccaee1ff0f27443292a9b7)
Task 8: implementation commit 2a7a70ef53d30580ed3a5227a06f9ded8f2ecf05; authorized guarded stat core, combined URL views, preserved authoritative result/delay/readiness operations
Task 8: final self-check RED/GREEN — event-timezone regression 2 failed then required focused 5 files / 322 passed; browser 110 ID/EN cases passed after fix; typecheck/lint/Prisma/diff checks pass
Task 8: legacy E2E readiness root cause — master-OFF pre-fix repetitions 8 passed / 1 failed; trace and inert-input reproduction prove ignored early fill; approved test-only readiness helper retains DB assertions, corrected master-ON repetitions 9/9 passed
Task 8: final master-ON full specs 23/23 passed; chained master-OFF session 59639 still running at low-limit user handoff
Task 8: latest full unit before final timezone regressions 179 files passed / 2 skipped, 2020 tests passed / 6 skipped; final committed-HEAD full rerun and independent review remain pending
