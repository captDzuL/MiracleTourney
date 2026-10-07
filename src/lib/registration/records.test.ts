import { describe, expect, it } from "vitest";

import {
  filterRegistrationRecords,
  mapRequestStatus,
  normalizeRegistrationSource,
  type RegistrationRecord,
} from "./records";

const records: RegistrationRecord[] = [
  {
    id: "old",
    eventId: "event-1",
    teamId: "team-old",
    teamName: "Alpha Wolves",
    teamTag: "AW",
    captainName: "Rina",
    captainContact: "0812",
    captainIgn: "rina-ign",
    captainUid: "uid-rina",
    captainIsPlayer: true,
    rosterCount: 5,
    source: "captain_registration",
    status: "pending_payment",
    createdAt: new Date("2026-09-01T10:00:00.000Z"),
    origin: "registration",
  },
  {
    id: "newest",
    eventId: "event-1",
    teamName: "Bravo Bears",
    teamTag: "BB",
    captainName: "Dimas",
    captainIsPlayer: false,
    rosterCount: 6,
    source: "import_xlsx",
    status: "accepted",
    createdAt: new Date("2026-09-03T10:00:00.000Z"),
    origin: "registration-intake",
  },
  {
    id: "same-time-first",
    eventId: "event-1",
    teamName: "Crimson Cats",
    teamTag: "CC",
    captainName: "Salsa",
    captainIsPlayer: true,
    rosterCount: 5,
    source: "import_csv",
    status: "pending_review",
    createdAt: new Date("2026-09-02T10:00:00.000Z"),
    origin: "csv-import",
  },
  {
    id: "same-time-second",
    eventId: "event-1",
    teamName: "Delta Dragons",
    teamTag: "DD",
    captainName: "Rina Putri",
    captainIsPlayer: true,
    rosterCount: 4,
    source: "unknown_import",
    status: "needs_correction",
    createdAt: new Date("2026-09-02T10:00:00.000Z"),
    origin: "legacy-upload",
  },
];

describe("registration record source and status normalization", () => {
  it.each([
    ["registration", undefined, "captain_registration"],
    ["csv-import", undefined, "import_csv"],
    ["registration-intake", "xlsx", "import_xlsx"],
    ["registration-intake", "csv", "import_csv"],
    ["registration-intake", undefined, "unknown_import"],
    ["legacy-upload", "xlsx", "unknown_import"],
  ] as const)("maps %s with %s to %s", (teamSource, importSourceKind, expected) => {
    expect(normalizeRegistrationSource(teamSource, importSourceKind)).toBe(expected);
  });

  it.each([
    ["pending_payment", "pending_payment"],
    ["pending_review", "pending_review"],
    ["approved", "accepted"],
    ["rejected", "rejected"],
    ["expired", "needs_correction"],
  ] as const)("maps request status %s to %s", (requestStatus, expected) => {
    expect(mapRequestStatus(requestStatus)).toBe(expected);
  });

  it("rejects a request status outside the canonical upstream vocabulary", () => {
    expect(() => mapRequestStatus("cancelled" as never)).toThrow("Unknown registration request status");
  });
});

describe("filterRegistrationRecords", () => {
  it("filters by canonical status and source, then searches team and captain names without case sensitivity", () => {
    const result = filterRegistrationRecords(records, {
      status: "needs_correction",
      source: "unknown_import",
      query: "RINA PUTRI",
    });

    expect(result.total).toBe(1);
    expect(result.items.map((record) => record.id)).toEqual(["same-time-second"]);
  });

  it("orders records newest first and keeps input order for equal creation times", () => {
    const result = filterRegistrationRecords(records, {});

    expect(result.items.map((record) => record.id)).toEqual([
      "newest",
      "same-time-first",
      "same-time-second",
      "old",
    ]);
  });

  it("returns a clamped one-based page with pagination metadata", () => {
    const result = filterRegistrationRecords(records, { page: 99, pageSize: 2 });

    expect(result).toMatchObject({ total: 4, page: 2, pageSize: 2, totalPages: 2 });
    expect(result.items.map((record) => record.id)).toEqual(["same-time-second", "old"]);
  });

  it("normalizes non-positive page and page-size values to the first page and default size", () => {
    const result = filterRegistrationRecords(records, { page: 0, pageSize: 0 });

    expect(result).toMatchObject({ page: 1, pageSize: 25, totalPages: 1 });
    expect(result.items).toHaveLength(4);
  });
});
