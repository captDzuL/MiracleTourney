import { describe, expect, it, vi } from "vitest";

type OwnershipMappingContract = {
  orphanEventOwners: Record<string, string>;
  legacyAdminUserIds: string[];
};

type CliModule = {
  loadOwnershipMappingContract: (
    mappingPath: string | null | undefined,
    readTextFile?: (path: string, encoding: string) => Promise<string>,
  ) => Promise<OwnershipMappingContract>;
  runTenantOwnershipPreflightCli: (options?: {
    argv?: string[];
    PrismaClient?: new (...args: any[]) => any;
    stdout?: (...args: any[]) => void;
    stderr?: (...args: any[]) => void;
    readTextFile?: (path: string, encoding: string) => Promise<string>;
  }) => Promise<0 | 1>;
};

// @ts-expect-error - test imports runtime ESM script without TypeScript declarations.
const cliModule = await import("../../../scripts/preflight-tenant-ownership.mjs") as CliModule;
const { loadOwnershipMappingContract, runTenantOwnershipPreflightCli } = cliModule;

describe("tenant ownership preflight CLI", () => {
  it("validates mapping contract shape", async () => {
    await expect(
      loadOwnershipMappingContract("mapping.json", async () =>
        JSON.stringify({
          orphanEventOwners: {},
          legacyAdminUserIds: ["legacy-1"],
        }),
      ),
    ).resolves.toEqual({
      orphanEventOwners: {},
      legacyAdminUserIds: ["legacy-1"],
    });

    await expect(
      loadOwnershipMappingContract("mapping.json", async () => JSON.stringify({})),
    ).rejects.toThrow(/orphanEventOwners/);
  });

  it("dry-run does not mutate when mapping is actionable", async () => {
    const userFindMany = vi.fn().mockResolvedValue([
      { id: "legacy-admin", role: "admin" },
      { id: "organizer-1", role: "organizer" },
    ]);
    const eventFindMany = vi.fn().mockResolvedValue([
      { id: "event-1", organizerUserId: null },
    ]);
    const eventUpdateMany = vi.fn();
    const userUpdateMany = vi.fn();
    const transaction = vi.fn();
    const disconnect = vi.fn().mockResolvedValue(undefined);

    const PrismaClient = vi.fn(() => ({
      user: { findMany: userFindMany, updateMany: userUpdateMany },
      event: { findMany: eventFindMany, updateMany: eventUpdateMany },
      $transaction: transaction,
      $disconnect: disconnect,
    }));

    const stdout = vi.fn();
    const stderr = vi.fn();

    const code = await runTenantOwnershipPreflightCli({
      argv: [
        "node",
        "scripts/preflight-tenant-ownership.mjs",
        "--mapping",
        "mapping.json",
      ],
      PrismaClient,
      stdout,
      stderr,
      readTextFile: async () =>
        JSON.stringify({
          orphanEventOwners: { "event-1": "organizer-1" },
          legacyAdminUserIds: ["legacy-admin"],
        }),
    });

    expect(code).toBe(0);
    expect(transaction).not.toHaveBeenCalled();
    expect(eventUpdateMany).not.toHaveBeenCalled();
    expect(userUpdateMany).not.toHaveBeenCalled();
  });

  it("apply mode updates orphan owners and approved legacy roles in one transaction", async () => {
    const userFindMany = vi
      .fn()
      .mockResolvedValueOnce([
        { id: "legacy-admin", role: "admin" },
        { id: "organizer-1", role: "organizer" },
      ])
      .mockResolvedValueOnce([
        { id: "organizer-1", role: "organizer" },
      ]);

    const eventFindMany = vi
      .fn()
      .mockResolvedValueOnce([
        { id: "event-1", organizerUserId: null },
      ])
      .mockResolvedValueOnce([
        { id: "event-1", organizerUserId: "organizer-1" },
      ]);

    const eventUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const userUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = vi.fn(async (callback: (tx: unknown) => Promise<void>) =>
      callback({
        event: { updateMany: eventUpdateMany },
        user: { updateMany: userUpdateMany },
      }),
    );
    const disconnect = vi.fn().mockResolvedValue(undefined);

    const PrismaClient = vi.fn(() => ({
      user: { findMany: userFindMany, updateMany: userUpdateMany },
      event: { findMany: eventFindMany, updateMany: eventUpdateMany },
      $transaction: transaction,
      $disconnect: disconnect,
    }));

    const stdout = vi.fn();
    const stderr = vi.fn();

    const code = await runTenantOwnershipPreflightCli({
      argv: [
        "node",
        "scripts/preflight-tenant-ownership.mjs",
        "--mapping",
        "mapping.json",
        "--apply",
      ],
      PrismaClient,
      stdout,
      stderr,
      readTextFile: async () =>
        JSON.stringify({
          orphanEventOwners: { "event-1": "organizer-1" },
          legacyAdminUserIds: ["legacy-admin"],
        }),
    });

    expect(code).toBe(0);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(eventUpdateMany).toHaveBeenCalledWith({
      where: { id: "event-1", organizerUserId: null },
      data: { organizerUserId: "organizer-1" },
    });
    expect(userUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["legacy-admin"] }, role: { in: ["admin", "platform_admin"] } },
      data: { role: "organizer" },
    });
  });

  it("fails apply mode when update counts do not match mapping contract", async () => {
    const userFindMany = vi.fn().mockResolvedValue([
      { id: "legacy-admin", role: "admin" },
      { id: "organizer-1", role: "organizer" },
    ]);
    const eventFindMany = vi.fn().mockResolvedValue([
      { id: "event-1", organizerUserId: null },
    ]);
    const eventUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
    const userUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = vi.fn(async (callback: (tx: unknown) => Promise<void>) =>
      callback({
        event: { updateMany: eventUpdateMany },
        user: { updateMany: userUpdateMany },
      }),
    );
    const disconnect = vi.fn().mockResolvedValue(undefined);

    const PrismaClient = vi.fn(() => ({
      user: { findMany: userFindMany },
      event: { findMany: eventFindMany },
      $transaction: transaction,
      $disconnect: disconnect,
    }));

    const stdout = vi.fn();
    const stderr = vi.fn();

    const code = await runTenantOwnershipPreflightCli({
      argv: [
        "node",
        "scripts/preflight-tenant-ownership.mjs",
        "--mapping",
        "mapping.json",
        "--apply",
      ],
      PrismaClient,
      stdout,
      stderr,
      readTextFile: async () =>
        JSON.stringify({
          orphanEventOwners: { "event-1": "organizer-1" },
          legacyAdminUserIds: ["legacy-admin"],
        }),
    });

    expect(code).toBe(1);
    expect(stderr.mock.calls.join("\n")).toContain("Ownership apply failed");
  });

  it("apply mode canonicalizes duplicate legacy admin IDs so count checks stay semantic", async () => {
    const userFindMany = vi
      .fn()
      .mockResolvedValueOnce([
        { id: "legacy-admin", role: "admin" },
        { id: "organizer-1", role: "organizer" },
      ])
      .mockResolvedValueOnce([
        { id: "legacy-admin", role: "organizer" },
        { id: "organizer-1", role: "organizer" },
      ]);

    const eventFindMany = vi
      .fn()
      .mockResolvedValueOnce([
        { id: "event-1", organizerUserId: null },
      ])
      .mockResolvedValueOnce([
        { id: "event-1", organizerUserId: "organizer-1" },
      ]);

    const eventUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const userUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = vi.fn(async (callback: (tx: unknown) => Promise<void>) =>
      callback({
        event: { updateMany: eventUpdateMany },
        user: { updateMany: userUpdateMany },
      }),
    );
    const disconnect = vi.fn().mockResolvedValue(undefined);

    const PrismaClient = vi.fn(() => ({
      user: { findMany: userFindMany },
      event: { findMany: eventFindMany },
      $transaction: transaction,
      $disconnect: disconnect,
    }));

    const stdout = vi.fn();
    const stderr = vi.fn();

    const code = await runTenantOwnershipPreflightCli({
      argv: [
        "node",
        "scripts/preflight-tenant-ownership.mjs",
        "--mapping",
        "mapping.json",
        "--apply",
      ],
      PrismaClient,
      stdout,
      stderr,
      readTextFile: async () =>
        JSON.stringify({
          orphanEventOwners: { "event-1": "organizer-1" },
          legacyAdminUserIds: ["legacy-admin", "legacy-admin"],
        }),
    });

    expect(code).toBe(0);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(userUpdateMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ["legacy-admin"],
        },
        role: {
          in: ["admin", "platform_admin"],
        },
      },
      data: {
        role: "organizer",
      },
    });
  });
});
