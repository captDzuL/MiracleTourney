# Auth Session Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden JWT-based auth by requiring a real secret, shortening admin session lifetime, and making logout cookie invalidation explicit without introducing schema changes.

**Architecture:** Keep the existing stateless JWT auth flow, but move secret validation into a strict runtime helper and make token issuance role-aware. Preserve current action entrypoints and route guards while adding focused unit coverage around the auth module.

**Tech Stack:** Next.js 15, Vitest, jose, next/headers cookies API

## Global Constraints

- No database-backed revocation list
- No per-device session management
- No Prisma schema change
- No redesign of login UI or role model
- No operational requirement to rotate secrets on every normal git push

---

### Task 1: Add failing auth-session tests

**Files:**
- Create: `src/lib/auth/session.test.ts`
- Test: `src/lib/auth/session.test.ts`

**Interfaces:**
- Consumes: `signIn(email: string, password: string)`, `signOut()`, `getSessionUser()`
- Produces: regression coverage for secret validation, role-based expiry, and explicit logout cookie invalidation

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const cookiesMock = vi.fn();
const getUserWithPasswordByEmail = vi.fn();
const getCaptainById = vi.fn();
const getUserByEmail = vi.fn();

vi.mock("next/headers", () => ({ cookies: cookiesMock }));
vi.mock("@/lib/platform/repository", () => ({
  getUserWithPasswordByEmail,
  getCaptainById,
  getUserByEmail,
}));
vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn().mockResolvedValue(true),
  },
}));

describe("auth session hardening", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects missing JWT_SECRET", async () => {
    delete process.env.JWT_SECRET;
    const { signIn } = await import("./session");
    getUserWithPasswordByEmail.mockResolvedValue({
      id: "admin-1",
      email: "admin@test.com",
      name: "Admin",
      role: "admin",
      passwordHash: "$hash",
    });
    cookiesMock.mockResolvedValue({ set: vi.fn() });

    await expect(signIn("admin@test.com", "secret123")).rejects.toThrow("JWT_SECRET");
  });

  it("gives admin a shorter cookie lifetime than captain", async () => {
    process.env.JWT_SECRET = "unit-test-secret-with-32-characters!!";
    const cookieStore = { set: vi.fn(), get: vi.fn(), delete: vi.fn() };
    cookiesMock.mockResolvedValue(cookieStore);
    const { signIn } = await import("./session");

    getUserWithPasswordByEmail.mockResolvedValueOnce({
      id: "admin-1",
      email: "admin@test.com",
      name: "Admin",
      role: "admin",
      passwordHash: "$hash",
    });
    await signIn("admin@test.com", "secret123");

    getUserWithPasswordByEmail.mockResolvedValueOnce({
      id: "captain-1",
      email: "captain@test.com",
      name: "Captain",
      role: "captain",
      passwordHash: "$hash",
    });
    await signIn("captain@test.com", "secret123");

    const adminOptions = cookieStore.set.mock.calls[0][2];
    const captainOptions = cookieStore.set.mock.calls[1][2];

    expect(adminOptions.maxAge).toBeLessThan(captainOptions.maxAge);
  });

  it("expires the auth cookie explicitly on logout", async () => {
    process.env.JWT_SECRET = "unit-test-secret-with-32-characters!!";
    const cookieStore = { set: vi.fn(), get: vi.fn(), delete: vi.fn() };
    cookiesMock.mockResolvedValue(cookieStore);
    const { signOut } = await import("./session");

    await signOut();

    expect(cookieStore.set).toHaveBeenCalledWith(
      "mfl_token",
      "",
      expect.objectContaining({ maxAge: 0, path: "/" }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/auth/session.test.ts`
Expected: FAIL because `src/lib/auth/session.test.ts` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// Create src/lib/auth/session.test.ts with the cases above, then run it.
// At this stage the tests should fail on current production behavior:
// - missing/default secret is still accepted
// - admin and captain both get 7d
// - signOut uses delete rather than explicit expiry
```

- [ ] **Step 4: Run test to verify it passes through the red phase**

Run: `pnpm test src/lib/auth/session.test.ts`
Expected: FAIL with assertions showing current auth behavior is too permissive.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/session.test.ts
git commit -m "test: cover auth session hardening"
```

### Task 2: Harden JWT secret handling and role-based session expiry

**Files:**
- Modify: `src/lib/auth/session.ts`
- Test: `src/lib/auth/session.test.ts`

**Interfaces:**
- Consumes: `getUserWithPasswordByEmail(email)`, `cookies()`, `bcrypt.compare(password, hash)`
- Produces: `signIn(email, password)` with role-aware expiry and strict secret validation

- [ ] **Step 1: Write the failing test**

```ts
it("rejects the placeholder JWT secret", async () => {
  process.env.JWT_SECRET = "miracle-tourney-jwt-secret-change-in-production-32chars-min";
  const { signIn } = await import("./session");
  getUserWithPasswordByEmail.mockResolvedValue({
    id: "admin-1",
    email: "admin@test.com",
    name: "Admin",
    role: "admin",
    passwordHash: "$hash",
  });
  cookiesMock.mockResolvedValue({ set: vi.fn() });

  await expect(signIn("admin@test.com", "secret123")).rejects.toThrow("JWT_SECRET");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/auth/session.test.ts`
Expected: FAIL because the placeholder secret is still accepted.

- [ ] **Step 3: Write minimal implementation**

```ts
const DEFAULT_JWT_SECRET = "miracle-tourney-jwt-secret-change-in-production-32chars-min";
const ADMIN_SESSION_MAX_AGE = 60 * 60 * 12;
const CAPTAIN_SESSION_MAX_AGE = 60 * 60 * 24 * 7;

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret || secret === DEFAULT_JWT_SECRET) {
    throw new Error("JWT_SECRET must be set to a unique non-default value.");
  }
  return new TextEncoder().encode(secret);
}

function getSessionMaxAge(role: string) {
  return role === "admin" ? ADMIN_SESSION_MAX_AGE : CAPTAIN_SESSION_MAX_AGE;
}
```

Then update signing and verification to call `getJwtSecret()` and set cookie `maxAge` from `getSessionMaxAge(user.role)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/auth/session.test.ts`
Expected: PASS for secret validation and role-based expiry assertions.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/session.ts src/lib/auth/session.test.ts
git commit -m "fix: harden JWT session secret handling"
```

### Task 3: Make logout explicitly expire the auth cookie and verify regression safety

**Files:**
- Modify: `src/lib/auth/session.ts`
- Test: `src/lib/auth/session.test.ts`
- Test: `src/lib/actions.test.ts`

**Interfaces:**
- Consumes: `signOut()`, `logoutAction()`
- Produces: explicit cookie expiration behavior while preserving existing redirect flow

- [ ] **Step 1: Write the failing test**

```ts
it("keeps logoutAction behavior unchanged for callers", async () => {
  await expect(logoutAction()).rejects.toThrow("REDIRECT:/");
  expect(signOut).toHaveBeenCalledTimes(1);
});
```

If the equivalent assertion already exists in `src/lib/actions.test.ts`, keep it and rely on `session.test.ts` as the new failing behavior test.

- [ ] **Step 2: Run test to verify it fails or confirms existing coverage**

Run: `pnpm test src/lib/auth/session.test.ts src/lib/actions.test.ts`
Expected: `session.test.ts` shows the missing explicit-expiry behavior; `actions.test.ts` remains green.

- [ ] **Step 3: Write minimal implementation**

```ts
export async function signOut() {
  const store = await cookies();
  store.set(JWT_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/auth/session.test.ts src/lib/actions.test.ts`
Expected: PASS with logout redirect behavior intact and explicit cookie expiry verified.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/session.ts src/lib/auth/session.test.ts src/lib/actions.test.ts
git commit -m "fix: expire auth cookie explicitly on logout"
```

### Task 4: Verify the full hotfix and update supporting env guidance

**Files:**
- Modify: `.env.example`
- Test: `src/lib/auth/session.test.ts`
- Test: `src/lib/actions.test.ts`

**Interfaces:**
- Consumes: env var documentation for local setup
- Produces: clear guidance that `JWT_SECRET` must be replaced with a real value

- [ ] **Step 1: Write the failing test**

```ts
// No new runtime test required here.
// The red state is the documentation gap: .env.example still encourages a placeholder-like value.
```

- [ ] **Step 2: Run verification scope before editing docs**

Run: `pnpm test src/lib/auth/session.test.ts src/lib/actions.test.ts`
Expected: PASS before touching documentation.

- [ ] **Step 3: Write minimal implementation**

```env
# JWT signing secret — generate with: openssl rand -base64 32 (required)
JWT_SECRET=replace-this-with-a-unique-random-secret-before-running
```

- [ ] **Step 4: Run final verification**

Run: `pnpm test src/lib/auth/session.test.ts src/lib/actions.test.ts`
Expected: PASS

Run: `pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add .env.example src/lib/auth/session.ts src/lib/auth/session.test.ts src/lib/actions.test.ts
git commit -m "docs: clarify JWT secret requirement"
```
