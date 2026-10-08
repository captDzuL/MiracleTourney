import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * End-to-end contract of the email password reset for captains and organizers.
 *
 * Real modules: the two server actions, token issue/consume, sendEmail, bcrypt.
 * Mocked boundaries only: Resend, the database (in-memory), Next runtime, rate limit.
 */

type StoredUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  passwordHash: string;
  tempPassword: string | null;
  mustChangePassword: boolean;
  sessionVersion: number;
  deactivatedAt: Date | null;
};
type StoredToken = { userId: string; token: string; tokenFormat: string; expiresAt: Date; createdAt: Date; usedAt: Date | null };

const db = vi.hoisted(() => ({
  users: new Map<string, { id: string; email: string; name: string; role: string; passwordHash: string; tempPassword: string | null; mustChangePassword: boolean; sessionVersion: number; deactivatedAt: Date | null }>(),
  tokens: [] as Array<{ userId: string; token: string; tokenFormat: string; expiresAt: Date; createdAt: Date; usedAt: Date | null }>,
}));
const mocks = vi.hoisted(() => ({
  afterCallbacks: [] as Array<() => unknown | Promise<unknown>>,
  resendSend: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock("next/server", () => ({ after: (callback: () => unknown) => { mocks.afterCallbacks.push(callback); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string): never => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/auth/session", () => ({ requireRole: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("@vercel/blob", () => ({ put: vi.fn() }));
vi.mock("resend", () => ({ Resend: class { emails = { send: mocks.resendSend }; } }));
vi.mock("@/lib/platform/repository", () => ({
  getUserByEmail: async (email: string) => {
    const row = [...db.users.values()].find((user) => user.email === email);
    if (!row) return null;
    return {
      id: row.id, email: row.email, name: row.name, role: row.role,
      ...(row.deactivatedAt ? { deactivatedAt: row.deactivatedAt } : {}),
    };
  },
}));
vi.mock("@/lib/platform/db", () => {
  const prisma = {
    passwordResetToken: {
      upsert: async ({ where, update, create }: { where: { userId: string }; update: Partial<StoredToken>; create: Omit<StoredToken, "createdAt" | "usedAt"> }) => {
        const existing = db.tokens.find((row) => row.userId === where.userId);
        if (existing) return Object.assign(existing, update);
        const row = { ...create, createdAt: new Date(), usedAt: null };
        db.tokens.push(row);
        return row;
      },
      findUnique: async ({ where }: { where: { token: string } }) => {
        const row = db.tokens.find((candidate) => candidate.token === where.token);
        return row ? { ...row } : null;
      },
      updateMany: async ({ where, data }: { where: { token: string; usedAt: null; expiresAt: { gt: Date }; createdAt?: { gt: Date } }; data: { usedAt: Date } }) => {
        const row = db.tokens.find((candidate) =>
          candidate.token === where.token && candidate.usedAt === null
          && candidate.expiresAt.getTime() > where.expiresAt.gt.getTime()
          && (!where.createdAt || candidate.createdAt.getTime() > where.createdAt.gt.getTime()));
        if (!row) return { count: 0 };
        row.usedAt = data.usedAt;
        return { count: 1 };
      },
    },
    user: {
      update: async ({ where, data }: { where: { id: string }; data: { passwordHash: string; tempPassword: null; mustChangePassword: boolean; sessionVersion: { increment: number } } }) => {
        const user = db.users.get(where.id);
        if (!user) throw new Error("user missing");
        user.passwordHash = data.passwordHash;
        user.tempPassword = data.tempPassword;
        user.mustChangePassword = data.mustChangePassword;
        user.sessionVersion += data.sessionVersion.increment;
        return user;
      },
    },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
  };
  return { prisma };
});

import { requestPasswordResetAction, resetPasswordAction } from "./actions";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

async function redirectOf(action: Promise<unknown>): Promise<string> {
  try {
    await action;
  } catch (error) {
    const message = (error as Error).message;
    if (message.startsWith("REDIRECT:")) return message.slice("REDIRECT:".length);
    throw error;
  }
  throw new Error("expected a redirect");
}

async function runDeferredWork() {
  while (mocks.afterCallbacks.length) await mocks.afterCallbacks.shift()?.();
}

async function seedUser(overrides: Partial<StoredUser> & Pick<StoredUser, "id" | "email" | "role">): Promise<StoredUser> {
  const user: StoredUser = {
    name: "Test User",
    passwordHash: await bcrypt.hash("OldPassword123!", 4),
    tempPassword: null,
    mustChangePassword: false,
    sessionVersion: 3,
    deactivatedAt: null,
    ...overrides,
  };
  db.users.set(user.id, user);
  return user;
}

function emailedToken(callIndex = 0): string {
  const html = String(mocks.resendSend.mock.calls[callIndex]?.[0]?.html);
  const match = html.match(/href="([^"]+)"/);
  expect(match, "email contains a reset link").not.toBeNull();
  const url = new URL(match![1]);
  return url.searchParams.get("token") ?? "";
}

describe("email password reset flow (captain and organizer)", () => {
  beforeEach(() => {
    db.users.clear();
    db.tokens.length = 0;
    mocks.afterCallbacks.length = 0;
    mocks.resendSend.mockReset().mockResolvedValue({ data: { id: "email-1" }, error: null });
    mocks.checkRateLimit.mockReset().mockResolvedValue(true);
    vi.stubEnv("FEATURE_FLAG_EMAIL_PASSWORD_RESET", "true");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM_EMAIL", "no-reply@miracle.example");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://miracle.example");
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each(["organizer", "captain"])("lets a %s reset the password from the emailed link and sign in with the new one", async (role) => {
    const user = await seedUser({ id: "u-1", email: "person@example.com", role, tempPassword: "Temporary123!", mustChangePassword: role === "organizer" });

    expect(await redirectOf(requestPasswordResetAction(form({ email: "Person@Example.com" })))).toBe("/forgot-password?sent=1");
    expect(mocks.resendSend).not.toHaveBeenCalled();
    await runDeferredWork();

    expect(mocks.resendSend).toHaveBeenCalledTimes(1);
    expect(mocks.resendSend).toHaveBeenCalledWith(expect.objectContaining({
      from: "no-reply@miracle.example",
      to: "person@example.com",
      subject: "Reset Password Miracle League",
    }));
    const token = emailedToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(String(mocks.resendSend.mock.calls[0]?.[0]?.html)).toContain("https://miracle.example/forgot-password/reset?token=");
    expect(db.tokens).toHaveLength(1);
    expect(db.tokens[0]?.token).not.toBe(token);

    const redirect = await redirectOf(resetPasswordAction(form({ token, password: "BrandNewPass456!", confirmPassword: "BrandNewPass456!" })));
    expect(redirect).toBe("/login?reset=success");

    expect(await bcrypt.compare("BrandNewPass456!", user.passwordHash)).toBe(true);
    expect(await bcrypt.compare("OldPassword123!", user.passwordHash)).toBe(false);
    expect(user.tempPassword).toBeNull();
    expect(user.mustChangePassword).toBe(false);
    expect(user.sessionVersion).toBe(4);
  });

  it("rejects the same link a second time and keeps the first new password", async () => {
    const user = await seedUser({ id: "u-1", email: "organizer@example.com", role: "organizer" });
    await redirectOf(requestPasswordResetAction(form({ email: "organizer@example.com" })));
    await runDeferredWork();
    const token = emailedToken();

    await redirectOf(resetPasswordAction(form({ token, password: "FirstNewPass456!", confirmPassword: "FirstNewPass456!" })));
    const reuse = await redirectOf(resetPasswordAction(form({ token, password: "AttackerPass789!", confirmPassword: "AttackerPass789!" })));

    expect(reuse).toContain("/forgot-password/reset?token=");
    expect(reuse).toContain("error=");
    expect(await bcrypt.compare("FirstNewPass456!", user.passwordHash)).toBe(true);
    expect(user.sessionVersion).toBe(4);
  });

  it("invalidates the first link when a second reset is requested", async () => {
    await seedUser({ id: "u-1", email: "organizer@example.com", role: "organizer" });
    await redirectOf(requestPasswordResetAction(form({ email: "organizer@example.com" })));
    await runDeferredWork();
    await redirectOf(requestPasswordResetAction(form({ email: "organizer@example.com" })));
    await runDeferredWork();
    const firstToken = emailedToken(0);
    const secondToken = emailedToken(1);

    expect(firstToken).not.toBe(secondToken);
    expect(await redirectOf(resetPasswordAction(form({ token: firstToken, password: "ShouldNotWork1!", confirmPassword: "ShouldNotWork1!" })))).toContain("error=");
    expect(await redirectOf(resetPasswordAction(form({ token: secondToken, password: "ShouldWork12345!", confirmPassword: "ShouldWork12345!" })))).toBe("/login?reset=success");
  });

  it("rejects a link after its 30 minutes are over", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-07T10:00:00.000Z") });
    const user = await seedUser({ id: "u-1", email: "organizer@example.com", role: "organizer" });
    await redirectOf(requestPasswordResetAction(form({ email: "organizer@example.com" })));
    await runDeferredWork();
    const token = emailedToken();

    vi.setSystemTime(new Date("2026-10-07T10:30:00.000Z"));
    const outcome = await redirectOf(resetPasswordAction(form({ token, password: "TooLateButTrying1!", confirmPassword: "TooLateButTrying1!" })));

    expect(outcome).toContain("error=");
    expect(user.sessionVersion).toBe(3);
    expect(await bcrypt.compare("OldPassword123!", user.passwordHash)).toBe(true);
  });

  it.each([
    ["an unknown address", "nobody@example.com"],
    ["an admin account", "admin@example.com"],
    ["a deactivated organizer", "gone@example.com"],
  ])("answers %s exactly like a known one and sends nothing", async (_label, email) => {
    await seedUser({ id: "admin-1", email: "admin@example.com", role: "admin" });
    await seedUser({ id: "gone-1", email: "gone@example.com", role: "organizer", deactivatedAt: new Date("2026-09-01T00:00:00.000Z") });

    expect(await redirectOf(requestPasswordResetAction(form({ email })))).toBe("/forgot-password?sent=1");
    await runDeferredWork();

    expect(mocks.resendSend).not.toHaveBeenCalled();
    expect(db.tokens).toHaveLength(0);
  });

  it("does not deliver anything while the email flag is off, but still answers sent=1", async () => {
    vi.stubEnv("FEATURE_FLAG_EMAIL_PASSWORD_RESET", "false");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await seedUser({ id: "u-1", email: "organizer@example.com", role: "organizer" });

    expect(await redirectOf(requestPasswordResetAction(form({ email: "organizer@example.com" })))).toBe("/forgot-password?sent=1");
    await runDeferredWork();

    expect(mocks.resendSend).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("[email-stub] Password reset email suppressed");
  });

  it("builds an absolute link from NEXT_PUBLIC_BASE_URL when NEXT_PUBLIC_APP_URL is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://base.example/");
    await seedUser({ id: "u-1", email: "organizer@example.com", role: "organizer" });

    await redirectOf(requestPasswordResetAction(form({ email: "organizer@example.com" })));
    await runDeferredWork();

    expect(String(mocks.resendSend.mock.calls[0]?.[0]?.html)).toContain('href="https://base.example/forgot-password/reset?token=');
  });

  it("never emails a relative (unclickable) link when no base URL is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await seedUser({ id: "u-1", email: "organizer@example.com", role: "organizer" });

    expect(await redirectOf(requestPasswordResetAction(form({ email: "organizer@example.com" })))).toBe("/forgot-password?sent=1");
    await runDeferredWork();

    expect(mocks.resendSend).not.toHaveBeenCalled();
    const records = info.mock.calls.map(([line]) => JSON.parse(String(line)));
    expect(records).toContainEqual(expect.objectContaining({ operation: "password_reset_request", phase: "failed", errorCode: "delivery_failed" }));
  });

  it("keeps the response generic and the logs free of email and token when Resend rejects", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.resendSend.mockResolvedValue({ data: null, error: { name: "validation_error", message: "You can only send testing emails to your own email address" } });
    await seedUser({ id: "u-1", email: "organizer@example.com", role: "organizer" });

    expect(await redirectOf(requestPasswordResetAction(form({ email: "organizer@example.com" })))).toBe("/forgot-password?sent=1");
    await runDeferredWork();

    const output = JSON.stringify([...info.mock.calls, ...errorLog.mock.calls]);
    expect(output).toContain("delivery_failed");
    expect(output).not.toContain("organizer@example.com");
    expect(output).not.toMatch(/[0-9a-f]{64}/);
  });

  it("rate-limits repeated requests without revealing it and without issuing a token", async () => {
    mocks.checkRateLimit.mockResolvedValue(false);
    await seedUser({ id: "u-1", email: "organizer@example.com", role: "organizer" });

    expect(await redirectOf(requestPasswordResetAction(form({ email: "organizer@example.com" })))).toBe("/forgot-password?sent=1");
    await runDeferredWork();

    expect(db.tokens).toHaveLength(0);
    expect(mocks.resendSend).not.toHaveBeenCalled();
  });

  it("refuses short passwords, mismatches and malformed tokens before touching the token", async () => {
    const user = await seedUser({ id: "u-1", email: "organizer@example.com", role: "organizer" });
    await redirectOf(requestPasswordResetAction(form({ email: "organizer@example.com" })));
    await runDeferredWork();
    const token = emailedToken();

    expect(await redirectOf(resetPasswordAction(form({ token, password: "short", confirmPassword: "short" })))).toContain("error=");
    expect(await redirectOf(resetPasswordAction(form({ token, password: "LongEnough123!", confirmPassword: "Different123!" })))).toContain("error=");
    expect(await redirectOf(resetPasswordAction(form({ token: "abc", password: "LongEnough123!", confirmPassword: "LongEnough123!" })))).toContain("error=");

    expect(db.tokens[0]?.usedAt).toBeNull();
    expect(user.sessionVersion).toBe(3);
    expect(await redirectOf(resetPasswordAction(form({ token, password: "LongEnough123!", confirmPassword: "LongEnough123!" })))).toBe("/login?reset=success");
  });
});
