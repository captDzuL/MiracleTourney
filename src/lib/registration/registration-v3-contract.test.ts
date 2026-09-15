import { beforeEach, describe, expect, it, vi } from "vitest";

type ContractState = {
  events: Array<Record<string, unknown>>;
  users: Array<Record<string, unknown>>;
  teams: Array<Record<string, unknown>>;
  players: Array<Record<string, unknown>>;
  requests: Array<Record<string, unknown>>;
  batches: Array<Record<string, unknown>>;
  items: Array<Record<string, unknown>>;
  paymentSettings: Array<Record<string, unknown>>;
  competitionPhases: Array<Record<string, unknown>>;
  matches: Array<Record<string, unknown>>;
  raceOnRequestClaim: boolean;
};

const { state, prisma, resetState } = vi.hoisted(() => {
  const clone = <T>(value: T): T => {
    if (value instanceof Date) return new Date(value.getTime()) as T;
    if (Array.isArray(value)) return value.map((item) => clone(item)) as T;
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) as T;
    }
    return value;
  };

  const state = {
    events: [],
    users: [],
    teams: [],
    players: [],
    requests: [],
    batches: [],
    items: [],
    paymentSettings: [],
    competitionPhases: [],
    matches: [],
    raceOnRequestClaim: false,
  } as ContractState;

  const resetState = () => {
    const timestamp = new Date("2026-09-14T10:00:00.000Z");
    state.events = [
      {
        id: "event-1", slug: "event-one", name: "Event One", description: "Contract event one",
        logoUrl: null, gameImageUrl: null, gameId: "game-flashpeak", gameModeId: "mode-flashpeak-5v5", format: "Single Elimination",
        formatConfig: null, status: "Published", participantCap: 8, registrationWindow: "Open", startsAt: "2026-10-01",
        venue: "Online", organizerUserId: "organizer-1", organizerName: "Organizer One", organizerVerified: true,
        registrationFeeRequired: true, competitionVersion: 0, stream: null,
      },
      {
        id: "event-2", slug: "event-two", name: "Event Two", description: "Contract event two",
        logoUrl: null, gameImageUrl: null, gameId: "game-flashpeak", gameModeId: "mode-flashpeak-5v5", format: "Single Elimination",
        formatConfig: null, status: "Published", participantCap: 8, registrationWindow: "Open", startsAt: "2026-10-01",
        venue: "Online", organizerUserId: "organizer-2", organizerName: "Organizer Two", organizerVerified: true,
        registrationFeeRequired: true, competitionVersion: 0, stream: null,
      },
    ];
    state.users = [
      { id: "organizer-1", email: "organizer-1@example.test", name: "Organizer One", role: "organizer" },
      { id: "organizer-2", email: "organizer-2@example.test", name: "Organizer Two", role: "organizer" },
      { id: "captain-1", email: "captain-1@example.test", name: "Captain One", role: "captain" },
      { id: "captain-2", email: "captain-2@example.test", name: "Captain Two", role: "captain" },
    ];
    state.teams = [{
      id: "team-event-2", eventId: "event-2", captainId: "captain-2", name: "Other Team", logoText: "OTH", tag: "OTH",
      captainName: "Captain Two", captainContact: "0812", captainIgn: "other", captainUid: "uid-other", captainIsPlayer: true,
      source: "registration", createdAt: new Date("2026-09-13T10:00:00.000Z"),
    }];
    state.players = [];
    state.requests = [{
      id: "request-event-1", eventId: "event-1", captainId: "captain-1", teamId: null, teamName: "Pending Team", teamTag: "PEN",
      status: "pending_review", proofImageUrl: "https://private.test/proof.png", rejectReason: null,
      expiresAt: new Date("2026-09-15T10:00:00.000Z"), approvedAt: null, approvedById: null,
      createdAt: new Date("2026-09-14T09:00:00.000Z"), updatedAt: timestamp,
    }, {
      id: "request-event-2", eventId: "event-2", captainId: "captain-2", teamId: null, teamName: "Other Pending", teamTag: "OTH2",
      status: "pending_review", proofImageUrl: "https://private.test/other-proof.png", rejectReason: null,
      expiresAt: new Date("2026-09-15T10:00:00.000Z"), approvedAt: null, approvedById: null,
      createdAt: new Date("2026-09-14T08:00:00.000Z"), updatedAt: timestamp,
    }];
    state.batches = [{
      id: "batch-event-1", eventId: "event-1", sourceKind: "csv", sourceLabel: "registrations.csv", worksheetName: null,
      status: "validated", summary: { new: 1 }, expiresAt: new Date("2026-09-15T10:00:00.000Z"), committedAt: null,
      createdAt: new Date("2026-09-14T08:00:00.000Z"), updatedAt: timestamp,
    }];
    state.items = [{ id: "item-event-1", batchId: "batch-event-1", sourceRow: 2, status: "new", selected: true, teamId: null }];
    state.paymentSettings = [{
      id: "payment-event-1", eventId: "event-1", qrisImageUrl: "https://private.test/qris.png", instructions: "Scan",
      status: "draft", version: 3, publishedAt: null, updatedAt: timestamp,
    }];
    state.competitionPhases = [];
    state.matches = [];
    state.raceOnRequestClaim = false;
  };

  const relation = (row: Record<string, unknown>, key: string, value: unknown) => {
    if (key === "event") return state.events.find((event) => event.id === value) ?? null;
    if (key === "captain") return state.users.find((user) => user.id === value) ?? null;
    return row[key];
  };

  const matches = (row: Record<string, unknown>, where: Record<string, unknown> | undefined): boolean => {
    if (!where) return true;
    if (where.AND && !(where.AND as Array<Record<string, unknown>>).every((item) => matches(row, item))) return false;
    if (where.OR && !(where.OR as Array<Record<string, unknown>>).some((item) => matches(row, item))) return false;
    for (const [key, expected] of Object.entries(where)) {
      if (key === "AND" || key === "OR") continue;
      const actual = relation(row, key, row[`${key}Id`]);
      if (expected && typeof expected === "object" && !(expected instanceof Date)) {
        const condition = expected as Record<string, unknown>;
        if ("in" in condition && !(condition.in as unknown[]).includes(actual)) return false;
        if ("not" in condition) {
          const not = condition.not;
          if (not && typeof not === "object" && !(not instanceof Date)) {
            if (matches({ value: actual }, { value: not } as Record<string, unknown>)) return false;
          } else if (actual === not) return false;
        }
        if ("lte" in condition && !(actual instanceof Date && condition.lte instanceof Date ? actual <= condition.lte : (actual as number) <= (condition.lte as number))) return false;
        if ("gte" in condition && !(actual instanceof Date && condition.gte instanceof Date ? actual >= condition.gte : (actual as number) >= (condition.gte as number))) return false;
        if ("equals" in condition && actual !== condition.equals) return false;
        continue;
      }
      if (actual instanceof Date && expected instanceof Date) {
        if (actual.getTime() !== expected.getTime()) return false;
      } else if (actual !== expected) return false;
    }
    return true;
  };

  const withRelations = (model: string, row: Record<string, unknown>, include: Record<string, unknown> | undefined) => {
    const result = clone(row);
    if (model === "team" && include?.players) {
      result.players = state.players.filter((player) => player.teamId === row.id);
    }
    if (model === "team" && include?.captain) {
      const captain = state.users.find((user) => user.id === row.captainId);
      result.captain = captain ? { id: captain.id, name: captain.name, email: captain.email } : null;
    }
    if (model === "request" && include?.captain) {
      const captain = state.users.find((user) => user.id === row.captainId);
      result.captain = captain ? { id: captain.id, name: captain.name, email: captain.email } : null;
    }
    if (model === "request" && include?.event) {
      const event = state.events.find((item) => item.id === row.eventId);
      result.event = event ? { ...clone(event), stream: null } : null;
    }
    if (model === "batch" && include?.items) {
      result.items = state.items.filter((item) => item.batchId === row.id).map((item) => clone(item));
    }
    if (model === "event" && include?.teams) {
      result.teams = state.teams.filter((team) => team.eventId === row.id).map((team) => ({
        ...clone(team),
        players: state.players.filter((player) => player.teamId === team.id).map((player) => ({
          nickname: player.nickname, displayName: player.displayName, position: player.position,
        })),
      }));
    }
    return result;
  };

  const makePrisma = (target: ContractState): Record<string, any> => {
    const model = (name: string, rows: () => Array<Record<string, unknown>>) => ({
      findFirst: async (args: { where?: Record<string, unknown>; include?: Record<string, unknown> }) => {
        const row = rows().find((item) => matches(item, args?.where));
        return row ? withRelations(name, row, args?.include) : null;
      },
      findUnique: async (args: { where?: Record<string, unknown>; include?: Record<string, unknown> }) => {
        const row = rows().find((item) => matches(item, args?.where));
        return row ? withRelations(name, row, args?.include) : null;
      },
      findMany: async (args: { where?: Record<string, unknown>; include?: Record<string, unknown> }) => rows()
        .filter((item) => matches(item, args?.where))
        .map((item) => withRelations(name, item, args?.include)),
      count: async (args: { where?: Record<string, unknown> }) => rows().filter((item) => matches(item, args?.where)).length,
    });

    const db: Record<string, any> = {
      event: model("event", () => target.events),
      user: model("user", () => target.users),
      team: model("team", () => target.teams),
      player: model("player", () => target.players),
      teamRegistrationRequest: model("request", () => target.requests),
      registrationImportBatch: model("batch", () => target.batches),
      registrationImportItem: model("item", () => target.items),
      eventPaymentSettings: model("payment", () => target.paymentSettings),
      competitionPhase: model("phase", () => target.competitionPhases),
      match: model("match", () => target.matches),
    };

    db.event.updateMany = async (args: { where?: Record<string, unknown>; data: Record<string, unknown> }) => {
      const found = target.events.filter((row) => matches(row, args.where));
      for (const row of found) {
        for (const [key, value] of Object.entries(args.data)) {
          if (value && typeof value === "object" && "increment" in value) row[key] = Number(row[key] ?? 0) + Number((value as { increment: number }).increment);
          else row[key] = value;
        }
      }
      return { count: found.length };
    };
    db.teamRegistrationRequest.updateMany = async (args: { where?: Record<string, unknown>; data: Record<string, unknown> }) => {
      const found = target.requests.filter((row) => matches(row, args.where));
      if (target.raceOnRequestClaim && found.length > 0) {
        found[0].status = "approved";
        found[0].updatedAt = new Date("2026-09-14T10:01:00.000Z");
        return { count: 0 };
      }
      for (const row of found) Object.assign(row, args.data);
      return { count: found.length };
    };
    db.teamRegistrationRequest.update = async (args: { where: Record<string, unknown>; data: Record<string, unknown>; include?: Record<string, unknown> }) => {
      const row = target.requests.find((item) => matches(item, args.where));
      if (!row) throw new Error("Request not found");
      Object.assign(row, args.data);
      return withRelations("request", row, args.include);
    };
    db.team.create = async (args: { data: Record<string, unknown> }) => {
      const row = {
        id: "team-created",
        createdAt: new Date("2026-09-14T10:02:00.000Z"),
        logoUrl: null, captainName: null, captainContact: null, captainIgn: null, captainUid: null, captainIsPlayer: true,
        ...clone(args.data),
      };
      target.teams.push(row);
      return clone(row);
    };
    db.team.update = async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const row = target.teams.find((item) => matches(item, args.where));
      if (!row) throw new Error("Team not found");
      Object.assign(row, args.data);
      return clone(row);
    };
    db.player.updateMany = async (args: { where?: Record<string, unknown>; data: Record<string, unknown> }) => {
      const found = target.players.filter((row) => matches(row, args.where));
      for (const row of found) Object.assign(row, args.data);
      return { count: found.length };
    };
    db.$transaction = async (callback: (transaction: Record<string, any>) => Promise<unknown>) => {
      const snapshot = clone(target) as ContractState;
      const transaction = makePrisma(snapshot);
      const result = await callback(transaction);
      for (const key of Object.keys(target) as Array<keyof ContractState>) {
        (target[key] as never) = clone(snapshot[key]) as never;
      }
      return result;
    };
    return db;
  };

  resetState();
  const prisma = makePrisma(state);
  return { state, prisma, resetState };
});

vi.mock("../platform/db", () => ({ prisma }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }));

import { parseRegistrationSource, suggestRegistrationMapping, buildRegistrationPreview } from "../imports/registration-intake";
import { filterRegistrationRecords } from "./records";
import {
  approveTeamRegistrationRequest,
  getEventPaymentSettingsForManager,
  getPaymentReviewForEvent,
  getRegistrationImportHistoryForEvent,
  getRegistrationRecordsForEvent,
  getTeamRegistrationRequestForEvent,
  RegistrationMutationConflictError,
} from "../platform/repository";
import { previewRegistrationImportForUser } from "../actions/registration-v3-actions";

const owner = { id: "organizer-1", role: "organizer" as const, email: "organizer-1@example.test", name: "Organizer One" };
const unrelated = { id: "organizer-2", role: "organizer" as const, email: "organizer-2@example.test", name: "Organizer Two" };
const admin = { id: "admin-1", role: "admin" as const, email: "admin@example.test", name: "Admin" };
const platformAdmin = { id: "platform-1", role: "platform_admin" as const, email: "platform@example.test", name: "Platform" };

beforeEach(() => resetState());

describe("registration V3 real-contract evidence", () => {
  it("runs the real CSV parser, mapping, validation, and event-local readers", async () => {
    const csv = [
      "Nama Tim,Tag,Nama Kapten,Captain IGN,Captain UID,No Whatsapp Kapten,Player 1",
      "Pending Team,PEN,Captain One,captain,uid-captain,0812,player-one",
    ].join("\n");
    const parsed = await parseRegistrationSource({ kind: "csv", fileName: "registrations.csv", buffer: Buffer.from(csv) });
    const worksheet = parsed.worksheets[0];
    const mapping = suggestRegistrationMapping(worksheet.rows[0].map((cell) => cell.value), { maxRosterSize: 5 });
    const preview = buildRegistrationPreview({
      event: { id: "event-1", name: "Event One", slug: "event-one", participantCap: 8, bracketLocked: false, maxRosterSize: 5, minRosterSize: 1 },
      existingTeams: [], existingUsers: [],
      rows: worksheet.rows.slice(1).map((row, index) => ({ sourceRow: index + 2, cells: row.map((cell) => cell.value) })),
      mapping,
    });

    expect(parsed.sourceKind).toBe("csv");
    expect(mapping.columns).toMatchObject({ teamName: 0, teamTag: 1, captainIgn: 3, captainUid: 4 });
    expect(preview).toMatchObject({ summary: { new: 1, changed: 0, same: 0, error: 0 } });
    expect(preview.items[0]).toMatchObject({ status: "new", selected: true, normalized: { teamName: "Pending Team" } });

    const invalidPreview = buildRegistrationPreview({
      event: { id: "event-1", name: "Event One", slug: "event-one", participantCap: 8, bracketLocked: false, maxRosterSize: 5, minRosterSize: 1 },
      existingTeams: [], existingUsers: [], rows: [{ sourceRow: 2, cells: ["", "", "", "", "", "", ""] }], mapping,
    });
    expect(invalidPreview.items[0]).toMatchObject({ status: "error", selected: false });
    expect(invalidPreview.items[0]?.errors).toEqual(expect.arrayContaining(["Nama tim wajib diisi.", "Nama kapten wajib diisi."]));

    const oversized = ["header", ...Array.from({ length: 513 }, (_, index) => `row-${index}`)].join("\n");
    await expect(parseRegistrationSource({ kind: "csv", fileName: "oversized.csv", buffer: Buffer.from(oversized) }))
      .rejects.toThrow("File registrasi maksimal 512 baris data.");
  });

  it("reports only the missing required mapping labels through the real shared core", async () => {
    const form = new FormData();
    form.set("locale", "id");
    form.set("eventId", "event-1");
    form.set("registrationFile", new File([
      "Nama Tim,Captain IGN\nPending Team,captain",
    ], "partial.csv", { type: "text/csv" }));

    await expect(previewRegistrationImportForUser(owner, form, { legacyCompatibility: true })).resolves.toMatchObject({
      status: "blocked",
      legacy: {
        phase: "registration",
        message: "Mapping wajib belum ditemukan: captain UID.",
        behavior: "redirect",
      },
    });
  });

  it("enforces actual event-row scoping and manager authorization across readers", async () => {
    const records = await getRegistrationRecordsForEvent(owner, "event-1");
    expect(records).toEqual(expect.arrayContaining([expect.objectContaining({ eventId: "event-1", id: "request-event-1" })]));
    expect(records.every((record) => record.eventId === "event-1")).toBe(true);

    await expect(getRegistrationRecordsForEvent(unrelated, "event-1")).rejects.toThrow("Not authorized");
    await expect(getTeamRegistrationRequestForEvent(unrelated, "event-1", "request-event-1")).rejects.toThrow("Not authorized");
    await expect(getPaymentReviewForEvent(unrelated, "event-1")).rejects.toThrow("Not authorized");

    await expect(getRegistrationRecordsForEvent(admin, "event-1")).resolves.toEqual(expect.any(Array));
    await expect(getRegistrationRecordsForEvent(platformAdmin, "event-1")).resolves.toEqual(expect.any(Array));
    await expect(getRegistrationImportHistoryForEvent(owner, "event-1")).resolves.toEqual([
      expect.objectContaining({ eventId: "event-1", id: "batch-event-1", itemCount: 1 }),
    ]);
    await expect(getEventPaymentSettingsForManager(owner, "event-1")).resolves.toMatchObject({ eventId: "event-1", version: 3 });
  });

  it("rolls back the event version and team write when approval loses its CAS race", async () => {
    state.raceOnRequestClaim = true;
    const expectedUpdatedAt = new Date("2026-09-14T10:00:00.000Z");

    await expect(approveTeamRegistrationRequest(owner, "request-event-1", {
      expectedStatus: "pending_review", expectedUpdatedAt,
    })).rejects.toBeInstanceOf(RegistrationMutationConflictError);

    expect(state.events.find((event) => event.id === "event-1")?.competitionVersion).toBe(0);
    expect(state.teams).toHaveLength(1);
    expect(state.requests.find((request) => request.id === "request-event-1")).toMatchObject({
      status: "pending_review", teamId: null, proofImageUrl: "https://private.test/proof.png",
    });
  });

  it("commits approval through the real transaction boundary when the CAS precondition is current", async () => {
    const result = await approveTeamRegistrationRequest(owner, "request-event-1", {
      expectedStatus: "pending_review", expectedUpdatedAt: new Date("2026-09-14T10:00:00.000Z"),
    });

    expect(result).toMatchObject({ id: "team-created", eventId: "event-1", source: "registration" });
    expect(state.events.find((event) => event.id === "event-1")?.competitionVersion).toBe(1);
    expect(state.teams).toHaveLength(2);
    expect(state.requests.find((request) => request.id === "request-event-1")).toMatchObject({ status: "approved", teamId: "team-created" });
  });

  it("keeps queue search and pagination pure and event-local", async () => {
    const records = await getRegistrationRecordsForEvent(owner, "event-1");
    const page = filterRegistrationRecords(records, { query: "pending", page: 1, pageSize: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.eventId).toBe("event-1");
    expect(page.total).toBe(1);
  });
});
