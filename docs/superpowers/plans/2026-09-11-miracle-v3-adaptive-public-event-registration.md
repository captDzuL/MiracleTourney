# Adaptive Public Event V3 - Registration implementation

Status: implemented on feature/ui/adaptive-public-event-v3.

## Delivery

- [x] Default-off adaptive public event feature flag and E2E flag wiring.
- [x] Request-scoped public registration view model and complete CTA matrix.
- [x] Registration-phase public composition based on the approved mockup.
- [x] Separate poster and event logo, organizer identity/contact, format and slot details.
- [x] Accessible Captain login modal with server-side destination and rate limit.
- [x] Captain signup and login preserve localized event context.
- [x] Captain workspace focuses the requested event and links back to it.
- [x] Pending-payment does not reserve capacity; accepted proof reserves atomically.
- [x] All capacity-consuming paths recheck Team plus pending-review reservations in retryable Serializable transactions.
- [x] Permanent route, metadata, slug redirect, legacy fallback, and read-only preview safety.
- [x] Unique-fixture serial E2E on Neon Delicate, including mobile 360 px and both locales.
- [ ] Ongoing adaptive Match Center; waits for format-aware Match Day.
- [ ] Finished adaptive recap; waits for Results, Completion, and Certificates.

## Rollout

Keep FEATURE_FLAG_ADAPTIVE_PUBLIC_EVENT_V3=false by default. Enable it only in local test, CI, or Preview through .env.test or an equivalent Preview secret. Ongoing, Finished, and legacy events continue using the existing public renderer.

## Verification

- Full Vitest: 705 passed across 73 files.
- TypeScript/lint and production build with .env.test: passed.
- Adaptive Playwright spec: 5 passed serially on Neon Delicate.
- Full no-reset Playwright snapshot: 39 passed, 2 skipped, 6 failed, and 4 not run; failures are documented in public/snapshot.md and are outside the adaptive registration spec.
- Independent review: no blocking findings remain.

Use .env.test only. Run preflight before browser tests. Do not reset Delicate while another registration session is active. Never run database operations against the production Neon host.
