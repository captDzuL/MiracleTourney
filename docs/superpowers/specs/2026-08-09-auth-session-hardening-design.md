# Auth Session Hardening Hotfix Design

Date: August 9, 2026
Status: Draft for review

## Goal

Reduce the risk of session reuse and weak JWT handling without introducing a new session store, schema migration, or extra deployment ceremony beyond the existing Vercel auto-build flow.

This hotfix must preserve the current login experience for:
- admin users
- captain users
- browser sessions created after the fix is deployed

## Problem Summary

The current authentication flow uses a signed JWT stored in the `mfl_token` cookie. The main risks are:

1. `JWT_SECRET` still allows a known default value.
2. Session lifetime is a flat `7d` for all roles, including admin.
3. Logout relies on `cookies().delete(...)`, which is convenient but less explicit than setting a fully expired cookie with the same scope attributes.

This does not appear to be an automatic admin-login bug for new browsers. The observed behavior is consistent with an existing valid cookie being reused by the same browser.

## Non-Goals

- No database-backed revocation list
- No per-device session management
- No Prisma schema change
- No redesign of login UI or role model
- No operational requirement to rotate secrets on every normal git push

## Recommended Approach

Implement a contained hardening pass in the existing JWT auth layer.

### 1. Require an explicit, non-default `JWT_SECRET`

The app should stop accepting the fallback/default secret in runtime code.

Behavior:
- if `JWT_SECRET` is missing, app startup should fail with a clear error
- if `JWT_SECRET` matches the known default placeholder, app startup should fail with a clear error
- local and hosted environments must both provide a real secret through environment configuration

Why:
- removes the most dangerous trust assumption
- prevents forged or trivially reproducible tokens if the placeholder is known

### 2. Shorten admin session lifetime

Keep JWT-based auth, but make session duration role-aware.

Proposed durations:
- admin: `12h`
- captain: `7d`

Why:
- lowers the blast radius if an admin token is copied
- keeps captain flow convenient for daily usage
- avoids broader auth redesign

Notes:
- the JWT payload does not need new database state for this change
- the role is already known at token issuance time

### 3. Make logout cookie invalidation explicit

Instead of relying only on `delete`, overwrite the auth cookie with:
- empty value
- `maxAge: 0`
- `httpOnly: true`
- `sameSite: "lax"`
- `path: "/"`
- `secure` matching production behavior

Why:
- reduces ambiguity across browsers and frameworks
- makes invalidation behavior easier to reason about and test

### 4. Add regression coverage

Add tests around the auth/session layer to cover:
- app rejects missing `JWT_SECRET`
- app rejects default placeholder `JWT_SECRET`
- admin sign-in issues a shorter-lived token than captain sign-in
- logout writes an expired auth cookie
- protected routes still redirect unauthenticated users to login

## Design Details

### Target files

Primary:
- `src/lib/auth/session.ts`

Likely supporting tests:
- `src/lib/actions.test.ts`
- a new or existing auth/session-focused test file if needed

### Secret handling

Introduce a small runtime helper inside the auth module:
- reads `process.env.JWT_SECRET`
- trims it
- throws if missing
- throws if equal to the known placeholder

This helper becomes the only source of truth for JWT signing and verification.

### Token issuance

Current behavior signs all users with the same `7d` expiry.

New behavior:
- determine expiry based on `user.role`
- sign admin tokens with `12h`
- sign captain tokens with `7d`

The cookie `maxAge` should align with the token expiry for each role.

### Token verification

Verification logic remains stateless:
- verify signature using the configured secret
- trust JWT expiry enforcement from the verification library
- load user by `sub`
- reject if the user no longer exists or role access does not match

No schema or repository changes are required for this hotfix.

## Security Impact

This hotfix improves:
- resistance against known-default secret misuse
- containment of copied admin cookies
- logout reliability

This hotfix does not fully solve:
- session theft from an already-compromised browser
- server-side revocation of individual active JWTs
- forced logout of a single specific device without rotating the secret

Those belong to a future, larger auth upgrade if needed.

## Rollout Notes

This option is intentionally chosen to stay compatible with the current Vercel push-and-build workflow.

Required environment expectation:
- `JWT_SECRET` must already be set in Vercel and local `.env`
- the value must not be the placeholder string from `.env.example`

Rollout for this hotfix:
1. merge code
2. ensure `JWT_SECRET` is present and real in Vercel
3. let Vercel build as usual on push

No forced secret rotation is required as part of this option.

## Risks

### Risk: local dev fails immediately after the hotfix

Cause:
- developers still using the placeholder secret

Mitigation:
- update `.env.example`
- document that local `.env` must contain a unique secret

### Risk: shorter admin expiry causes surprise logouts

Cause:
- admin session duration becomes meaningfully shorter

Mitigation:
- set to `12h`, not something aggressively short like `1h`
- keep captain duration unchanged

## Test Plan

Automated:
- run auth-related unit tests
- run existing action tests affected by login/logout behavior

Manual:
- confirm fresh browser cannot open `/admin` or `/captain` without login
- confirm admin can still log in normally
- confirm logout returns user to public state
- confirm captain flow remains unchanged

## Acceptance Criteria

- app no longer accepts a missing or placeholder `JWT_SECRET`
- admin tokens expire sooner than captain tokens
- logout explicitly expires the auth cookie
- existing role-based redirects continue to work
- no Prisma migration is introduced
