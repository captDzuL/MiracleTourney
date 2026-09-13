// Test-only transactional substitute for the external PostgreSQL boundary.
// Service validation, graph generation, scheduling and persistence queries stay real.
import type { PrismaClient } from "@prisma/client";

type Row = Record<string, unknown>;
type Query = { where?: Row; data?: Row; create?: Row; update?: Row; orderBy?: Row };
export function operationStore() {
  let state: Record<string, Row[]> = {
    event: [{ id: "event", organizerUserId: "owner", competitionVersion: 0, publishedScheduleVersion: null, status: "Registration Closed" }],
    team: [{ id: "a", eventId: "event" }, { id: "b", eventId: "event" }],
    competitionPhase: [], competitionGroup: [], competitionGroupMember: [], match: [], matchDependency: [],
    matchReadiness: [], matchResultRevision: [], competitionAuditLog: [], competitionActionItem: [],
    competitionIncident: [], scheduleRevision: [], eventAnnouncement: [], matchGame: [], eventRoundConfig: [],
    tournamentCompletion: [],
  };
  let failTable: string | undefined;
  let reverseReadOrder = false;
  const matches = (row: Row, where: Row = {}): boolean => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object" && !(value instanceof Date)) {
      const predicate = value as Row;
      if ("in" in predicate) return (predicate.in as unknown[]).includes(row[key]);
      if ("not" in predicate) return row[key] !== predicate.not;
      if ("gt" in predicate) return Number(row[key]) > Number(predicate.gt);
      if ("lt" in predicate) return Number(row[key]) < Number(predicate.lt);
      if (!(key in row)) return matches(row, predicate); // compound unique selector
    }
    return row[key] === value;
  });
  const update = (row: Row, data: Row = {}) => {
    for (const [key, value] of Object.entries(data)) {
      row[key] = value && typeof value === "object" && "increment" in value
        ? Number(row[key]) + Number(value.increment) : structuredClone(value);
    }
    return structuredClone(row);
  };
  const delegates = (tables: Record<string, Row[]>) => Object.fromEntries(Object.keys(tables).map(table => {
    const write = () => { if (table === failTable) throw new Error("storage failure"); };
    const find = ({ where }: Query = {}) => tables[table].filter(row => {
      const scoped = { ...where };
      if (table === "matchGame" && scoped.match && typeof scoped.match === "object") {
        const parent = tables.match.find(match => match.id === row.matchId);
        if (!parent || !matches(parent, scoped.match as Row)) return false;
        delete scoped.match;
      }
      return matches(row, scoped);
    });
    return [table, {
      findUnique: async (q: Query) => structuredClone(find(q)[0] ?? null),
      findUniqueOrThrow: async (q: Query) => { const row = find(q)[0]; if (!row) throw new Error("missing row"); return structuredClone(row); },
      findFirst: async (q: Query = {}) => structuredClone(find(q)[0] ?? null),
      findMany: async (q: Query = {}) => structuredClone(reverseReadOrder ? find(q).reverse() : find(q)),
      count: async (q: Query = {}) => find(q).length,
      create: async ({ data }: Query) => {
        write(); const row = { id: `${table}-${tables[table].length + 1}`, ...structuredClone(data) };
        tables[table].push(row); return structuredClone(row);
      },
      createMany: async ({ data }: { data: Row[] }) => {
        write();
        for (const item of data) {
          tables[table].push({ id: `${table}-${tables[table].length + 1}`, ...structuredClone(item) });
        }
        return { count: data.length };
      },
      deleteMany: async (q: Query = {}) => {
        write();
        const selected = new Set(find(q));
        const before = tables[table].length;
        tables[table] = tables[table].filter((row) => !selected.has(row));
        return { count: before - tables[table].length };
      },
      update: async (q: Query) => { write(); const row = find(q)[0]; if (!row) throw new Error("missing row"); return update(row, q.data); },
      updateMany: async (q: Query) => { write(); const rows = find(q); rows.forEach(row => update(row, q.data)); return { count: rows.length }; },
      upsert: async (q: Query) => {
        write(); const row = find(q)[0];
        if (row) return update(row, q.update);
        const created = { id: `${table}-${tables[table].length + 1}`, ...structuredClone(q.create) };
        tables[table].push(created); return structuredClone(created);
      },
    }];
  }));
  // Serialize commits to model the service's event CAS ordering. Failed writes
  // discard all staged mutations, including version and audit changes.
  let pending = Promise.resolve();
  const client = {
    $transaction: <T>(work: (tx: unknown) => Promise<T>) => {
      const result = pending.then(async () => {
        const staged = structuredClone(state);
        const result = await work(delegates(staged));
        state = staged;
        return result;
      });
      pending = result.then(() => undefined, () => undefined);
      return result;
    },
  };
  return {
    db: client as unknown as PrismaClient,
    rows: (table: string) => structuredClone(state[table]),
    seed: (table: string, row: Row) => state[table].push(structuredClone(row)),
    updateRow: (table: string, id: string, data: Row) => {
      const row = state[table].find((candidate) => candidate.id === id);
      if (!row) throw new Error(`missing ${table} row ${id}`);
      update(row, data);
    },
    failWrites: (table: string) => { failTable = table; },
    reverseReadOrder: (reverse: boolean) => { reverseReadOrder = reverse; },
  };
}
