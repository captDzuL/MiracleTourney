# Task 5 brief — event-local organizer registration actions

Base: `90d2e07`

## Scope

Extract the organizer registration read and write boundaries for the canonical event workspace. The queue, import history, payment-proof review, and event QRIS reader are event-local and owner/admin authorized. CSV/XLSX parsing and import persistence remain delegated to the existing intake and batch repositories. Event QRIS writes use Task 4 `EventPaymentSettings` compare-and-swap services. Payment review mutations use pending/status and `updatedAt` preconditions, while legacy admin actions remain compatibility adapters.

## Planned files

- `src/lib/registration/organizer-workspace-read.ts` and tests
- `src/lib/actions/registration-v3-actions.ts` and tests
- `src/lib/platform/repository.ts` and tests
- `src/lib/actions.ts`

## Verification contract

Use strict RED → GREEN evidence for queue filters/pagination, import history, payment review, QRIS isolation, ownership, safe localized return URLs, stale mutations, targeted revalidation, and legacy action compatibility. Do not modify Task 6 UI or the protected release verification note.
