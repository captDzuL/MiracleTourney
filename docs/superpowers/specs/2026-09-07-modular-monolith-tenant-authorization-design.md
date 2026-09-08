# Modular Monolith and Tenant Authorization Design

## Objective

Refactor the application into domain-owned vertical modules while preserving existing routes and user-visible behavior. Organizer data must be tenant-isolated, and only `platform_admin` may operate across organizer boundaries.

## Request Flow

Mutations follow:

`UI -> Server Action -> Service -> Policy / Repository -> Prisma -> PostgreSQL`

Server-rendered reads follow:

`UI -> Query Service -> Repository -> Prisma -> PostgreSQL`

Server Actions parse and validate external input, acquire the authenticated actor, invoke one service use case, map expected errors, invalidate caches, and redirect or return. Services coordinate policies and repositories. Policies are pure decisions over actor and resource context. Repositories own Prisma queries, row mapping, and atomic persistence.

## Module Boundaries

Modules live under `src/modules/<domain>/` and expose a narrow public API through `index.ts`. The target domains are:

- `identity`
- `events`
- `visual-assets`
- `certificates`
- `teams`
- `registration`
- `imports`
- `matches`
- `stats`

Each module creates only the files it needs from `actions.ts`, `service.ts`, `queries.ts`, `policy.ts`, `repository.ts`, `schemas.ts`, and `types.ts`.

Cross-module callers may import only another module's `index.ts`. Policies may not import Prisma, Next.js, session code, or repositories. Repositories may not import session or Server Action code. Domain row mappers and cache wrappers stay with their owning module; there is no permanent global CRUD facade or mapper collection.

Pure tournament algorithms remain under `src/lib/tournament/`. Prisma configuration, static platform configuration, and the explicitly retained demo adapter remain under `src/lib/platform/`.

## Actor and Tenant Model

The canonical application roles are `captain`, `organizer`, and `platform_admin`. The legacy `admin` role is migrated to `organizer` and then removed.

Authorization uses:

```ts
type ActorContext = {
  userId: string;
  role: "captain" | "organizer" | "platform_admin";
  tenantId: string | null;
};
```

For an organizer, `tenantId` initially equals `userId`. Callers must not derive ownership from that implementation detail so a future `Organization` and membership model can replace it without changing every service.

Only `platform_admin` has global scope. Organizer policies require matching tenant ownership. Captain policies require team or registration ownership. Middleware provides coarse route authentication only; resource authorization occurs in services and policies.

The JWT subject is a user ID. Session resolution must load the authoritative current user by ID, reject deactivated users, and derive role and tenant from the database rather than trusting stale JWT role claims.

## Ownership and Persistence

`Event.organizerUserId` is the current tenant ownership root. Before it becomes required, a preflight must identify legacy `admin` users, null event owners, and invalid references. Orphan events require an explicit mapping; they must never be assigned silently.

After a successful backfill, `Event.organizerUserId` becomes non-nullable and indexed. Deleting an organizer with owned events is restricted instead of nulling ownership.

Tenant-scoped mutation predicates must include ownership, or ownership must be rechecked inside the same transaction. A separate authorization query followed by an unscoped mutation is not sufficient for security-sensitive writes.

## Errors

Expected failures use typed errors:

- `UnauthenticatedError`
- `ForbiddenError`
- `NotFoundError`
- `ConflictError`
- domain validation errors

Server Actions and route handlers translate these errors consistently. Code must not determine behavior by comparing `error.message` with `"Not authorized"`.

## Compatibility

`src/lib/actions.ts`, `src/lib/platform/repository.ts`, and `src/lib/auth/session.ts` may temporarily re-export migrated symbols. These facades must shrink after every module migration and are deleted when all callers use module public APIs.

Existing action names, routes, localized redirects, cache TTLs and tags, transaction boundaries, demo-store fallbacks, and tournament behavior remain unchanged until their callers have migrated and equivalent tests pass.

## Verification

Policy unit tests cover every role and ownership combination. Real-database integration tests use organizer A, organizer B, captain A, platform admin, and anonymous actors. They verify list, read, mutation, review, download, and forged-ID paths.

The migration is complete only when:

- no runtime check grants global access to `admin`;
- no event has a null or invalid organizer;
- no caller imports either legacy monolith;
- no tenant-scoped mutation is unscoped;
- focused tests, `pnpm lint`, `pnpm test`, `pnpm build`, and smoke E2E pass;
- dashboard performance does not show policy-induced N+1 regressions.

## Out of Scope

This project does not introduce an `Organization` table, membership UI, delegation, impersonation, an audit-log product, or a broad UI redesign.