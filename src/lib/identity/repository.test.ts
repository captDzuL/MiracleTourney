import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/platform/db", () => ({ prisma }));

import {
  getCaptainById,
  getCaptainUsersForAdmin,
  getUserByEmail,
  getUserPasswordHashById,
  getUserWithPasswordByEmail,
  hasTempPassword,
  updateCaptainPassword,
  updateUserPassword,
} from "@/lib/identity/repository";

const NEW_HASH = "hash-new-value";

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "captain@example.test",
    name: "Captain One",
    role: "captain",
    passwordHash: "hash-stored-value",
    tempPassword: null,
    mustChangePassword: false,
    sessionVersion: 3,
    deactivatedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getCaptainById", () => {
  it.each([undefined, ""])("returns null for %j without querying the database", async (userId) => {
    const result = await getCaptainById(userId);

    expect(result).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns null when no user has the id", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const result = await getCaptainById("missing");

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: "missing" } });
    expect(result).toBeNull();
  });

  it("maps the row to an app user without exposing password fields", async () => {
    prisma.user.findUnique.mockResolvedValue(userRow());

    const result = await getCaptainById("user-1");

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: "user-1" } });
    expect(result).toEqual({
      id: "user-1",
      email: "captain@example.test",
      name: "Captain One",
      role: "captain",
      sessionVersion: 3,
    });
    expect(result).not.toHaveProperty("passwordHash");
    expect(result).not.toHaveProperty("tempPassword");
  });

  it("keeps sessionVersion 0 and includes deactivatedAt and mustChangePassword when set", async () => {
    const deactivatedAt = new Date("2026-03-01T00:00:00.000Z");
    prisma.user.findUnique.mockResolvedValue(
      userRow({ sessionVersion: 0, deactivatedAt, mustChangePassword: true }),
    );

    const result = await getCaptainById("user-1");

    expect(result).toMatchObject({ sessionVersion: 0, deactivatedAt, mustChangePassword: true });
  });

  it("returns a user of any role, not only captains", async () => {
    prisma.user.findUnique.mockResolvedValue(userRow({ role: "platform_admin" }));

    const result = await getCaptainById("user-1");

    expect(result?.role).toBe("platform_admin");
  });

  it("propagates database errors", async () => {
    prisma.user.findUnique.mockRejectedValue(new Error("db down"));

    await expect(getCaptainById("user-1")).rejects.toThrow("db down");
  });
});

describe("getUserByEmail", () => {
  it("looks up by exact email and maps the row without password fields", async () => {
    prisma.user.findUnique.mockResolvedValue(userRow({ sessionVersion: undefined }));

    const result = await getUserByEmail("captain@example.test");

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: "captain@example.test" } });
    expect(result).toEqual({
      id: "user-1",
      email: "captain@example.test",
      name: "Captain One",
      role: "captain",
    });
  });

  it("does not normalize the email before querying", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await getUserByEmail("  Captain@Example.TEST ");

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: "  Captain@Example.TEST " } });
  });

  it("returns null when the email is not registered", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(getUserByEmail("nobody@example.test")).resolves.toBeNull();
  });

  it("propagates database errors", async () => {
    prisma.user.findUnique.mockRejectedValue(new Error("db down"));

    await expect(getUserByEmail("captain@example.test")).rejects.toThrow("db down");
  });
});

describe("getUserWithPasswordByEmail", () => {
  it("returns the mapped user together with the stored password hash", async () => {
    prisma.user.findUnique.mockResolvedValue(userRow({ mustChangePassword: true }));

    const result = await getUserWithPasswordByEmail("captain@example.test");

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: "captain@example.test" } });
    expect(result).toEqual({
      id: "user-1",
      email: "captain@example.test",
      name: "Captain One",
      role: "captain",
      sessionVersion: 3,
      mustChangePassword: true,
      passwordHash: "hash-stored-value",
    });
    expect(result).not.toHaveProperty("tempPassword");
  });

  it("returns null when the email is not registered", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(getUserWithPasswordByEmail("nobody@example.test")).resolves.toBeNull();
  });

  it("propagates database errors", async () => {
    prisma.user.findUnique.mockRejectedValue(new Error("db down"));

    await expect(getUserWithPasswordByEmail("captain@example.test")).rejects.toThrow("db down");
  });
});

describe("getUserPasswordHashById", () => {
  it("selects only the password hash and returns it", async () => {
    prisma.user.findUnique.mockResolvedValue({ passwordHash: "hash-stored-value" });

    const result = await getUserPasswordHashById("user-1");

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: { passwordHash: true },
    });
    expect(result).toBe("hash-stored-value");
  });

  it("returns null when the user does not exist", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(getUserPasswordHashById("missing")).resolves.toBeNull();
  });

  it("returns an empty string as is because only nullish values become null", async () => {
    prisma.user.findUnique.mockResolvedValue({ passwordHash: "" });

    await expect(getUserPasswordHashById("user-1")).resolves.toBe("");
  });

  it("propagates database errors", async () => {
    prisma.user.findUnique.mockRejectedValue(new Error("db down"));

    await expect(getUserPasswordHashById("user-1")).rejects.toThrow("db down");
  });
});

describe("getCaptainUsersForAdmin", () => {
  it("lists captain users by name with only id, name and email", async () => {
    const rows = [
      { id: "u-1", name: "Aira", email: "aira@example.test" },
      { id: "u-2", name: "Budi", email: "budi@example.test" },
    ];
    prisma.user.findMany.mockResolvedValue(rows);

    const result = await getCaptainUsersForAdmin();

    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { role: "captain" },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });
    expect(result).toEqual(rows);
  });

  it("returns an empty array when there are no captains", async () => {
    prisma.user.findMany.mockResolvedValue([]);

    await expect(getCaptainUsersForAdmin()).resolves.toEqual([]);
  });

  it("propagates database errors", async () => {
    prisma.user.findMany.mockRejectedValue(new Error("db down"));

    await expect(getCaptainUsersForAdmin()).rejects.toThrow("db down");
  });
});

describe("hasTempPassword", () => {
  it("selects only the tempPassword column", async () => {
    prisma.user.findUnique.mockResolvedValue({ tempPassword: "temp-value" });

    await hasTempPassword("user-1");

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: { tempPassword: true },
    });
  });

  it("returns true when a temporary password is stored", async () => {
    prisma.user.findUnique.mockResolvedValue({ tempPassword: "temp-value" });

    await expect(hasTempPassword("user-1")).resolves.toBe(true);
  });

  it("returns true for an empty-string temporary password", async () => {
    prisma.user.findUnique.mockResolvedValue({ tempPassword: "" });

    await expect(hasTempPassword("user-1")).resolves.toBe(true);
  });

  it("returns false when the temporary password is null", async () => {
    prisma.user.findUnique.mockResolvedValue({ tempPassword: null });

    await expect(hasTempPassword("user-1")).resolves.toBe(false);
  });

  it("returns false when the user does not exist", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(hasTempPassword("missing")).resolves.toBe(false);
  });

  it("propagates database errors", async () => {
    prisma.user.findUnique.mockRejectedValue(new Error("db down"));

    await expect(hasTempPassword("user-1")).rejects.toThrow("db down");
  });
});

describe("updateUserPassword", () => {
  it("writes the new hash and clears the temporary password and first-login lock", async () => {
    prisma.user.update.mockResolvedValue({});

    const result = await updateUserPassword("user-1", NEW_HASH);

    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { passwordHash: NEW_HASH, tempPassword: null, mustChangePassword: false },
    });
    expect(result).toBeUndefined();
  });

  it("propagates database errors such as a missing user", async () => {
    prisma.user.update.mockRejectedValue(new Error("Record to update not found"));

    await expect(updateUserPassword("missing", NEW_HASH)).rejects.toThrow("Record to update not found");
  });
});

describe("updateCaptainPassword", () => {
  it("writes the same data as updateUserPassword", async () => {
    prisma.user.update.mockResolvedValue({});

    const result = await updateCaptainPassword("user-1", NEW_HASH);

    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { passwordHash: NEW_HASH, tempPassword: null, mustChangePassword: false },
    });
    expect(result).toBeUndefined();
  });

  it("propagates database errors", async () => {
    prisma.user.update.mockRejectedValue(new Error("write failed"));

    await expect(updateCaptainPassword("user-1", NEW_HASH)).rejects.toThrow("write failed");
  });
});
