import { afterEach, describe, expect, it, vi } from "vitest";

const installedConstraint = {
  validated: true,
  deferrable: true,
  initiallyDeferred: true,
  deleteAction: "a",
  updateAction: "c",
  referencesTeam: true,
  columns: ["eventId", "winnerTeamId"],
  referencedColumns: ["eventId", "id"],
};

async function loadIntegration(constraints: unknown[]) {
  let run: (() => Promise<void>) | undefined;
  const fixtures = new Set<string>();
  const operations: string[] = [];
  const create = (kind: string) => async () => {
    operations.push("create " + kind);
    fixtures.add(kind);
    return { id: kind };
  };
  vi.stubEnv("MATCHDAY_V3_MIGRATION_TEST_DATABASE_URL", "postgresql://localhost/matchday_contract");
  vi.stubEnv("NEON_PROD_HOST", "");
  vi.doMock("vitest", async (importOriginal) => ({
    ...await importOriginal<typeof import("vitest")>(),
    describe: (_name: string, body: () => void) => body(),
    it: Object.assign((_name: string, body: () => Promise<void>) => { run = body; }, { skip: () => {} }),
  }));
  // Only the database boundary is replaced: execute the actual opt-in test body.
  vi.doMock("@prisma/client", () => ({
    PrismaClient: class {
      constructor(options: unknown) {
        expect(options).toEqual({ datasources: { db: { url: "postgresql://localhost/matchday_contract" } } });
      }
      $queryRaw = async () => {
        operations.push("validate constraint");
        return constraints;
      };
      user = { create: create("user"), delete: async () => { fixtures.delete("user"); } };
      event = { create: create("event"), delete: async () => { fixtures.delete("event"); } };
      team = { create: create("team") };
      match = { create: create("match") };
      matchResultRevision = { create: create("revision"), findUnique: async () => null };
      $transaction = async () => { throw new Error("Foreign key constraint violated"); };
      $disconnect = async () => {};
    },
  }));
  await import("./persistence-migration.integration.test");
  expect(run).toBeDefined();
  return { run: run!, fixtures, operations };
}

afterEach(() => {
  vi.doUnmock("vitest");
  vi.doUnmock("@prisma/client");
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("migration integration installed-constraint gate", () => {
  it.each([
    ["missing", []],
    ["not deferred", [{ ...installedConstraint, initiallyDeferred: false }]],
    ["not deferrable", [{ ...installedConstraint, deferrable: false }]],
    ["restrict deletion", [{ ...installedConstraint, deleteAction: "r" }]],
    ["unvalidated", [{ ...installedConstraint, validated: false }]],
    ["wrong target", [{ ...installedConstraint, referencesTeam: false }]],
    ["wrong source columns", [{ ...installedConstraint, columns: ["winnerTeamId"] }]],
  ])("rejects %s constraints before creating fixtures", async (_name, constraints) => {
    const harness = await loadIntegration(constraints as unknown[]);
    await expect(harness.run()).rejects.toThrow();
    expect(harness.fixtures.size).toBe(0);
  });

  it("validates the installed constraint first and removes its user after success", async () => {
    const harness = await loadIntegration([installedConstraint]);
    await harness.run();
    expect(harness.operations[0]).toBe("validate constraint");
    expect(harness.fixtures.has("event")).toBe(false);
    expect(harness.fixtures.has("user")).toBe(false);
  });
});
