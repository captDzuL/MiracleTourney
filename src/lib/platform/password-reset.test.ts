import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

type TokenRow = {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  usedAt: Date | null;
};

const state = vi.hoisted(() => ({
  tokens: [] as TokenRow[],
  users: new Map<string, { passwordHash: string; tempPassword: string | null; sessionVersion: number }>(),
}));

type TestPrisma = {
  passwordResetToken: {
    deleteMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  user: {
    update: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

const prisma = vi.hoisted(() => {
  const db = {
    passwordResetToken: {
      deleteMany: vi.fn(async ({ where }: { where: { userId: string } }) => {
        state.tokens = state.tokens.filter((row) => row.userId !== where.userId);
        return { count: 1 };
      }),
      create: vi.fn(async ({ data }: { data: Omit<TokenRow, "id" | "usedAt"> }) => {
        const row: TokenRow = { ...data, id: `reset-${state.tokens.length + 1}`, usedAt: null };
        state.tokens.push(row);
        return row;
      }),
      upsert: vi.fn(async ({ where, update, create }: {
        where: { userId: string };
        update: { token: string; expiresAt: Date; usedAt: null };
        create: Omit<TokenRow, "id" | "usedAt">;
      }) => {
        const existing = state.tokens.find((row) => row.userId === where.userId);
        if (existing) {
          existing.token = update.token;
          existing.expiresAt = update.expiresAt;
          existing.usedAt = update.usedAt;
          return existing;
        }
        const row: TokenRow = { ...create, id: `reset-${state.tokens.length + 1}`, usedAt: null };
        state.tokens.push(row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { token: string } }) => {
        const row = state.tokens.find((candidate) => candidate.token === where.token);
        return row ? { ...row } : null;
      }),
      updateMany: vi.fn(async ({ where, data }: {
        where: { token: string; usedAt: null; expiresAt: { gt: Date } };
        data: { usedAt: Date };
      }) => {
        const row = state.tokens.find((candidate) =>
          candidate.token === where.token
          && candidate.usedAt === null
          && candidate.expiresAt.getTime() > where.expiresAt.gt.getTime());
        if (!row) return { count: 0 };
        row.usedAt = data.usedAt;
        return { count: 1 };
      }),
    },
    user: {
      update: vi.fn(async ({ where, data }: {
        where: { id: string };
        data: { passwordHash: string; tempPassword: null; sessionVersion: { increment: number } };
      }) => {
        const user = state.users.get(where.id);
        if (!user) throw new Error("user missing");
        user.passwordHash = data.passwordHash;
        user.tempPassword = data.tempPassword;
        user.sessionVersion += data.sessionVersion.increment;
        return user;
      }),
    },
  } as TestPrisma;
  db.$transaction = vi.fn(async (callback: (transaction: typeof db) => Promise<unknown>) => callback(db));
  return db;
});

vi.mock("@/lib/platform/db", () => ({ prisma }));

import {
  PASSWORD_RESET_TOKEN_TTL_MS,
  consumePasswordResetToken,
  createPasswordResetToken,
  digestPasswordResetToken,
} from "./password-reset";

describe("password reset token hardening", () => {
  beforeEach(() => {
    state.tokens = [];
    state.users.clear();
    state.users.set("user-1", { passwordHash: "old-hash", tempPassword: "temporary", sessionVersion: 7 });
    vi.clearAllMocks();
  });

  it("uses the exact 30-minute TTL contract", () => {
    expect(PASSWORD_RESET_TOKEN_TTL_MS).toBe(30 * 60 * 1000);
  });

  it("persists only a SHA-256 digest and returns the raw token", async () => {
    const now = new Date("2026-09-21T00:00:00.000Z");
    const rawToken = await createPasswordResetToken("user-1", now);

    expect(digestPasswordResetToken("raw-token")).toBe(
      "34d328009b123fbbb0dc93f18b3e6de1ecf7b1a5783c33dff7ffe1926f09e943",
    );
    expect(rawToken).toHaveLength(64);
    expect(state.tokens).toHaveLength(1);
    expect(state.tokens[0]).toMatchObject({
      userId: "user-1",
      token: digestPasswordResetToken(rawToken),
      expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
    });
    expect(state.tokens[0]?.token).not.toBe(rawToken);
  });

  it("invalidates older tokens before creating a new one", async () => {
    const first = await createPasswordResetToken("user-1", new Date("2026-09-21T00:00:00.000Z"));
    const second = await createPasswordResetToken("user-1", new Date("2026-09-21T00:01:00.000Z"));

    expect(second).not.toBe(first);
    expect(state.tokens).toHaveLength(1);
    expect(state.tokens[0]?.token).toBe(digestPasswordResetToken(second));
    expect(prisma.passwordResetToken.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user-1" },
    }));
  });

  it("keeps exactly one usable token when issuance races concurrently", async () => {
    const rawTokens = await Promise.all([
      createPasswordResetToken("user-1", new Date("2026-09-21T00:00:00.000Z")),
      createPasswordResetToken("user-1", new Date("2026-09-21T00:00:00.000Z")),
    ]);

    expect(state.tokens).toHaveLength(1);
    expect(rawTokens.filter((rawToken) => state.tokens[0]?.token === digestPasswordResetToken(rawToken))).toHaveLength(1);
    expect(state.tokens[0]?.usedAt).toBeNull();
  });

  it("rejects an expired token at the exact expiry boundary", async () => {
    const createdAt = new Date("2026-09-21T00:00:00.000Z");
    const token = await createPasswordResetToken("user-1", createdAt);

    await expect(
      consumePasswordResetToken(token, "new-hash", new Date(createdAt.getTime() + PASSWORD_RESET_TOKEN_TTL_MS)),
    ).rejects.toThrow("Token tidak valid atau sudah kadaluarsa");
    expect(state.users.get("user-1")?.passwordHash).toBe("old-hash");
    expect(state.users.get("user-1")?.sessionVersion).toBe(7);
  });

  it("updates the password, clears temporary state, and revokes sessions once", async () => {
    const token = await createPasswordResetToken("user-1", new Date("2026-09-21T00:00:00.000Z"));

    await consumePasswordResetToken(token, "new-hash", new Date("2026-09-21T00:10:00.000Z"));

    expect(state.tokens[0]?.usedAt).toBeInstanceOf(Date);
    expect(state.users.get("user-1")).toEqual({
      passwordHash: "new-hash",
      tempPassword: null,
      sessionVersion: 8,
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        passwordHash: "new-hash",
        tempPassword: null,
        sessionVersion: { increment: 1 },
      },
    });
  });

  it("rejects token reuse and tampering without changing the password", async () => {
    const token = await createPasswordResetToken("user-1", new Date("2026-09-21T00:00:00.000Z"));

    await consumePasswordResetToken(token, "new-hash", new Date("2026-09-21T00:10:00.000Z"));
    await expect(consumePasswordResetToken(token, "another-hash", new Date("2026-09-21T00:11:00.000Z")))
      .rejects.toThrow("Token tidak valid atau sudah kadaluarsa");
    await expect(consumePasswordResetToken(`${token.slice(0, -1)}0`, "tampered", new Date("2026-09-21T00:11:00.000Z")))
      .rejects.toThrow("Token tidak valid atau sudah kadaluarsa");

    expect(state.users.get("user-1")?.passwordHash).toBe("new-hash");
    expect(state.users.get("user-1")?.sessionVersion).toBe(8);
  });

  it("allows exactly one winner when concurrent consumers race", async () => {
    const token = await createPasswordResetToken("user-1", new Date("2026-09-21T00:00:00.000Z"));

    const outcomes = await Promise.allSettled([
      consumePasswordResetToken(token, "first-hash", new Date("2026-09-21T00:10:00.000Z")),
      consumePasswordResetToken(token, "second-hash", new Date("2026-09-21T00:10:00.000Z")),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect(state.users.get("user-1")?.sessionVersion).toBe(8);
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
  });

  it("reviews the migration's destructive legacy-token cleanup before unique constraints", () => {
    const migrationSql = readFileSync(new URL(
      "../../../prisma/migrations/20260921000000_add_user_session_version/migration.sql",
      import.meta.url,
    ), "utf8");
    const deleteIndex = migrationSql.indexOf('DELETE FROM "PasswordResetToken"');
    const uniqueIndex = migrationSql.indexOf('PasswordResetToken_userId_key');
    const sessionVersionIndex = migrationSql.indexOf('"sessionVersion"');

    expect(deleteIndex).toBeGreaterThanOrEqual(0);
    expect(uniqueIndex).toBeGreaterThan(deleteIndex);
    expect(sessionVersionIndex).toBeGreaterThan(deleteIndex);
  });
});
