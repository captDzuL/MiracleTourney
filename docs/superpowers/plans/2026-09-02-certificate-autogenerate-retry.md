# Certificate Auto-Generate and Retry Implementation Plan

## Global Constraints

- Preserve all pre-existing local changes in the dirty feature branch.
- Never generate a certificate against production during implementation or automated tests.
- Keep automatic generation after a completed Final result.
- The admin button is retry-only: it appears only when a completed Final has a valid winner and no certificate exists.
- The winner is always derived server-side from the event Final; the browser never submits a trusted team ID.
- Existing certificates are never overwritten or deleted.
- No database migration.

## Task 1: Serverless certificate renderer

- Add pinned production dependencies `puppeteer-core@25.1.0` and `@sparticuz/chromium@149.0.0`.
- Extract PNG rendering behind a focused helper with dependency injection suitable for unit tests.
- On Vercel, launch Puppeteer with Sparticuz arguments and executable path; locally, retain the existing Playwright renderer.
- Keep the PNG viewport at 1080x1920 and always close the browser.
- Externalize the serverless browser packages in Next.js config.
- Use TDD: add and observe failing renderer-selection tests before production changes.

## Task 2: Event-based generation service and admin action

- Add a service that resolves a completed `Final` with a winner by `eventId`, validates the winner belongs to the event, refuses existing certificates, and returns `generated`, `already-exists`, or `not-ready`.
- Route both automatic generation and manual retry through the same service.
- Add `adminGenerateCertificateAction` accepting only `eventId`, enforcing admin/organizer authorization, revalidating relevant pages, and redirecting with sanitized success/error feedback.
- Preserve a successfully saved Final if certificate rendering fails, but surface a clear admin error and log full event/match context.
- Use TDD for eligibility, idempotency, authorization, error, and revalidation behavior.

## Task 3: Admin certificate status and retry UI

- Batch-load completed Final winner summaries for manageable events without N+1 queries.
- In Review & Publish certificate settings, show waiting, ready/retry, and certificate-ready states.
- Show the resolved winner name when ready.
- Render a labeled `Generate Certificate` form only when no certificate exists and the Final is eligible; use pending label `Membuat sertifikat...` and prevent duplicate clicks through the existing SubmitButton.
- Keep the existing certificate URL view and omit any replace/regenerate control after success.
- Add UI tests for all states and feedback.

## Task 4: Verification and review

- Run focused certificate, action, admin-page, and bundle tests.
- Run the full unit suite, TypeScript check, and production build.
- Review the complete implementation against this plan and the existing dirty-worktree baseline.
- Do not deploy or mutate production data; report the preview/production verification steps for the user.
