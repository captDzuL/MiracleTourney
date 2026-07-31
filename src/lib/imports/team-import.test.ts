import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getEvents,
  getTeamsForEvent,
} from "../platform/demo-store";
import type {
  AppUser,
  Event,
  Match,
  Player,
  Team,
} from "../platform/types";
import {
  importTeamsFromRows,
  parseTeamImportCsv,
  validateTeamImportRows,
} from "./team-import";

type DemoStoreState = {
  users: AppUser[];
  events: Event[];
  teams: Team[];
  players: Player[];
  matches: Match[];
  playerStats: unknown[];
};

const demoStoreGlobal = globalThis as typeof globalThis & {
  __mflStore?: DemoStoreState;
};

function snapshotStore() {
  getEvents();
  return structuredClone(demoStoreGlobal.__mflStore!);
}

function restoreStore(state: DemoStoreState) {
  demoStoreGlobal.__mflStore = structuredClone(state);
}

function parseAndValidateTeamImport(csvText: string, state: DemoStoreState) {
  restoreStore(state);
  const parsed = parseTeamImportCsv(csvText);
  const events = getEvents();
  const teams = events.flatMap((event) => getTeamsForEvent(event.id));
  const errors = [...parsed.errors, ...validateTeamImportRows(parsed.rows, events, teams)];

  if (errors.length > 0) {
    return {
      ok: false as const,
      errors: errors.map((error) => error.message),
    };
  }

  return {
    ok: true as const,
    rows: parsed.rows,
  };
}

let baselineStore: DemoStoreState;

beforeEach(() => {
  baselineStore = snapshotStore();
});

afterEach(() => {
  restoreStore(baselineStore);
});

describe("team import pipeline", () => {
  it("collects all CSV validation errors in one pass", () => {
    const csv = [
      "event_slug,team_name,team_tag,captain_name,captain_contact",
      "missing-event,Miracle Wolves,MW,Riko,08123",
      "flashpeak-open-league,,,Dino,",
      "flashpeak-open-league,Scorch FC,,Faris,08999",
    ].join("\n");

    const result = parseAndValidateTeamImport(csv, baselineStore);
    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected validation errors for invalid import CSV");
    }

    expect(result.errors).toEqual([
      expect.stringContaining('Row 2: event_slug "missing-event" was not found'),
      expect.stringContaining("Row 3: team_name is required"),
      expect.stringContaining("Row 3: captain_contact is required"),
      expect.stringContaining(
        'Row 4: team_name "Scorch FC" is already registered for event "flashpeak-open-league"',
      ),
    ]);
  });

  it("auto-generates a team tag when team_tag is empty", () => {
    const csv = [
      "event_slug,team_name,team_tag,captain_name,captain_contact",
      "flashpeak-open-league,Vortex Prime,,Eko,08111",
    ].join("\n");

    const result = parseAndValidateTeamImport(csv, baselineStore);
    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(`Expected valid import CSV, got: ${result.errors.join(", ")}`);
    }

    expect(result.rows[0].teamTag).toBe("VP");
  });

  it("imports valid rows atomically after full-file validation passes", () => {
    const csv = [
      "event_slug,team_name,team_tag,captain_name,captain_contact",
      "flashpeak-open-league,Orbit United,,Nanda,08188",
      "flashpeak-open-league,North Axis,NA,Salsa,08189",
    ].join("\n");

    const parsed = parseAndValidateTeamImport(csv, baselineStore);
    expect(parsed.ok).toBe(true);

    if (!parsed.ok) {
      throw new Error(`Expected valid import CSV, got: ${parsed.errors.join(", ")}`);
    }

    restoreStore(baselineStore);
    const beforeCount = getTeamsForEvent("event-flashpeak-open").length;

    const result = importTeamsFromRows(parsed.rows);

    const importedTeams = getTeamsForEvent("event-flashpeak-open");
    expect(result).toEqual({ importedCount: 2 });
    expect(importedTeams).toHaveLength(beforeCount + 2);
    expect(importedTeams.slice(-2)).toEqual([
      expect.objectContaining({
        name: "Orbit United",
        tag: "OU",
        captainName: "Nanda",
        captainContact: "08188",
      }),
      expect.objectContaining({
        name: "North Axis",
        tag: "NA",
        captainName: "Salsa",
        captainContact: "08189",
      }),
    ]);
  });

  it("parses quoted fields instead of splitting on embedded commas", () => {
    const csv = [
      "event_slug,team_name,team_tag,captain_name,captain_contact",
      'flashpeak-open-league,"Orbit, United",,Nanda,08188',
    ].join("\n");

    const result = parseAndValidateTeamImport(csv, baselineStore);
    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(`Expected valid quoted CSV row, got: ${result.errors.join(", ")}`);
    }

    expect(result.rows[0]).toMatchObject({
      teamName: "Orbit, United",
      teamTag: "OU",
    });
  });

  it("returns structured errors for malformed rows with the wrong column count", () => {
    const csv = [
      "event_slug,team_name,team_tag,captain_name,captain_contact",
      "flashpeak-open-league,Orbit United,,Nanda,08188,unexpected",
    ].join("\n");

    const result = parseAndValidateTeamImport(csv, baselineStore);
    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected malformed CSV row to be rejected");
    }

    expect(result.errors).toEqual([
      'Row 2: expected 5 columns but found 6',
    ]);
  });

  it("returns structured header errors instead of throwing for missing required columns", () => {
    const csv = [
      "event_slug,team_name,captain_name",
      "flashpeak-open-league,Orbit United,Nanda",
    ].join("\n");

    const result = parseAndValidateTeamImport(csv, baselineStore);
    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected missing required header to be rejected");
    }

    expect(result.errors).toEqual([
      'Row 1: missing required CSV columns: captain_contact',
    ]);
  });

  it("returns structured header errors for unsupported columns", () => {
    const csv = [
      "event_slug,team_name,team_tag,captain_name,captain_contact,captain_email",
      "flashpeak-open-league,Orbit United,,Nanda,08188,nanda@example.com",
    ].join("\n");

    const result = parseAndValidateTeamImport(csv, baselineStore);
    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected unsupported header to be rejected");
    }

    expect(result.errors).toEqual([
      'Row 1: unsupported CSV columns: captain_email',
    ]);
  });
});
