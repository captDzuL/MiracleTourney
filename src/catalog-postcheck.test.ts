import { describe, expect, it, vi } from "vitest";

type Item = Record<string, unknown>;
type Catalog = Record<"tables" | "columns" | "indexes" | "constraints" | "enums" | "triggers" | "functions", Item[]>;
type Diff = { category: string; key: string; kind: "missing" | "extra" | "changed" };
type Core = {
  diffCatalogs(reference: Catalog, actual: Catalog): Diff[];
  formatDifferences(differences: Diff[]): string;
  assertTargetAllowed(url: string | undefined, env: Record<string, string | undefined>, options?: { allowProductionRead?: boolean }): string;
  CATALOG_SQL: string;
  readCatalog(url: string, createClient: (url: string) => Promise<unknown>): Promise<Catalog>;
};

const corePath = "../scripts/operations/catalog-postcheck-core.mjs";
const core = () => import(corePath) as Promise<Core>;

const base = (): Catalog => ({
  tables: [{ name: "Event", kind: "r" }, { name: "Match", kind: "r" }],
  columns: [{ table: "Event", name: "id", type: "text", notNull: true, default: null }],
  indexes: [{ table: "Match", name: "Match_eventId_idx", definition: "CREATE INDEX a ON \"Match\" (\"eventId\")" }],
  constraints: [{ table: "Match", name: "Match_eventId_fkey", type: "f", definition: "FOREIGN KEY (\"eventId\") REFERENCES \"Event\"(id)" }],
  enums: [{ name: "EventStatus", labels: ["Draft", "Published"] }],
  triggers: [],
  functions: [],
});

describe("physical catalog diff", () => {
  it("is empty for identical catalogs regardless of key order inside an item", async () => {
    const { diffCatalogs } = await core();
    const reordered = base();
    reordered.columns = [{ default: null, notNull: true, type: "text", name: "id", table: "Event" }];
    expect(diffCatalogs(base(), reordered)).toEqual([]);
  });

  it("reports a missing table, an extra function and a changed column or index definition", async () => {
    const { diffCatalogs } = await core();
    const actual = base();
    actual.tables = actual.tables.slice(0, 1);
    actual.functions = [{ name: "show_db_tree", definition: "x" }];
    actual.columns = [{ table: "Event", name: "id", type: "uuid", notNull: true, default: null }];
    actual.indexes = [{ table: "Match", name: "Match_eventId_idx", definition: "CREATE INDEX a ON \"Match\" (\"round\")" }];
    expect(diffCatalogs(base(), actual).map(({ category, key, kind }) => `${kind}:${category}:${key}`)).toEqual([
      "changed:columns:Event.id",
      "extra:functions:show_db_tree",
      "changed:indexes:Match.Match_eventId_idx",
      "missing:tables:Match",
    ]);
  });

  it("sees a unique index standing where the migrations created a unique constraint", async () => {
    const { diffCatalogs } = await core();
    const reference = base();
    reference.constraints.push({ table: "Match", name: "Match_eventId_round_slot_key", type: "u", definition: "UNIQUE (\"eventId\", round, slot)" });
    expect(diffCatalogs(reference, base())).toEqual([{ category: "constraints", key: "Match.Match_eventId_round_slot_key", kind: "missing" }]);
  });

  it("rejects input that is not a catalog instead of calling it equal", async () => {
    const { diffCatalogs } = await core();
    expect(() => diffCatalogs(base(), {} as Catalog)).toThrow(/actual is not a catalog/);
    expect(() => diffCatalogs({ tables: [] } as unknown as Catalog, base())).toThrow(/reference is not a catalog/);
  });

  it("formats an empty diff as a match and lists every difference otherwise", async () => {
    const { formatDifferences } = await core();
    expect(formatDifferences([])).toBe("Physical catalog matches the reference.");
    expect(formatDifferences([{ category: "tables", key: "Match", kind: "missing" }])).toContain("[MISSING] tables: Match");
  });
});

describe("production guard", () => {
  it("refuses the production host unless production read is explicitly allowed", async () => {
    const { assertTargetAllowed } = await core();
    const env = { NEON_PROD_HOST: "ep-prod-host" };
    const url = "postgresql://u:p@ep-prod-host.c-3.region.aws.neon.tech/neondb";
    expect(() => assertTargetAllowed(url, env)).toThrow(/--allow-production-read/);
    expect(() => assertTargetAllowed("postgresql://u:p@ep-sparkling-night-azr6wxwd.c-3.x.neon.tech/neondb", {})).toThrow(/--allow-production-read/);
    expect(assertTargetAllowed(url, env, { allowProductionRead: true })).toBe("ep-prod-host.c-3.region.aws.neon.tech");
    expect(assertTargetAllowed("postgresql://u:p@localhost:5432/scratch", env)).toBe("localhost");
  });

  it("rejects a missing or non-postgres URL", async () => {
    const { assertTargetAllowed } = await core();
    expect(() => assertTargetAllowed(undefined, {})).toThrow(/not a postgres URL/);
    expect(() => assertTargetAllowed("https://example.com/db", {})).toThrow(/not a postgres URL/);
  });
});

describe("catalog read", () => {
  it("runs one READ ONLY transaction with the catalog SELECT only and always disconnects", async () => {
    const { readCatalog, CATALOG_SQL } = await core();
    const statements: string[] = [];
    const disconnect = vi.fn(async () => undefined);
    const tx = {
      $executeRawUnsafe: vi.fn(async (sql: string) => { statements.push(sql); }),
      $queryRawUnsafe: vi.fn(async (sql: string) => { statements.push(sql); return [{ json_build_object: base() }]; }),
    };
    const client = { $transaction: async (fn: (tx: unknown) => Promise<Catalog>) => fn(tx), $disconnect: disconnect };
    await expect(readCatalog("postgresql://localhost/x", async () => client)).resolves.toEqual(base());
    expect(statements[0]).toBe("SET TRANSACTION READ ONLY");
    expect(statements).toHaveLength(2);
    expect(CATALOG_SQL).toMatch(/^SELECT json_build_object/);
    expect(statements[1]).toBe(CATALOG_SQL);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("disconnects even when the query fails", async () => {
    const { readCatalog } = await core();
    const disconnect = vi.fn(async () => undefined);
    const client = { $transaction: async () => { throw new Error("boom"); }, $disconnect: disconnect };
    await expect(readCatalog("postgresql://localhost/x", async () => client)).rejects.toThrow("boom");
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});

describe("known production differences", () => {
  it("only removes the two verified differences and nothing else", async () => {
    const mod = await core() as Core & { withoutKnownProductionDifferences(d: Diff[]): Diff[] };
    const known: Diff[] = [
      { category: "constraints", key: "Match.Match_eventId_round_slot_key", kind: "missing" },
      { category: "functions", key: "show_db_tree", kind: "extra" },
    ];
    const real: Diff[] = [
      { category: "constraints", key: "Match.Match_eventId_round_slot_key", kind: "changed" },
      { category: "functions", key: "show_db_tree", kind: "missing" },
      { category: "tables", key: "Match", kind: "missing" },
      { category: "indexes", key: "Event.Event_status_idx", kind: "missing" },
    ];
    expect(mod.withoutKnownProductionDifferences([...known, ...real])).toEqual(real);
  });
});
