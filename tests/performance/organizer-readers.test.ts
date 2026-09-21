import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

export type OrganizerScaleFixture = Readonly<{
  eventId: string;
  teamIds: readonly string[];
  playerIds: readonly string[];
  matchIds: readonly string[];
  certificateIds: readonly string[];
}>;

export const ORGANIZER_SCALE_MANIFEST = Object.freeze({
  teams: 64,
  players: 320,
  matches: 63,
  playerStats: 320,
  auditRows: 100,
  completions: 1,
  certificates: 7,
});

type QueryCounter = { count: number };
let activeQueryCounter: QueryCounter | null = null;

/** Test-only hook for mocked Prisma readers. Production code must not depend on it. */
export function recordOrganizerReaderQuery(): void {
  if (activeQueryCounter) activeQueryCounter.count += 1;
}

export async function seedOrganizerScaleFixture(teamCount = 64, playersPerTeam = 5): Promise<OrganizerScaleFixture> {
  const teams = Math.min(64, Math.max(0, Math.trunc(teamCount)));
  const players = Math.min(50, Math.max(0, Math.trunc(playersPerTeam)));
  const teamIds = Array.from({ length: teams }, (_, index) => `perf-team-${String(index + 1).padStart(2, "0")}`);
  return {
    eventId: "perf-event-64-teams",
    teamIds,
    playerIds: teamIds.flatMap((teamId) => Array.from({ length: players }, (_, index) => `${teamId}-player-${index + 1}`)),
    matchIds: Array.from({ length: Math.max(1, teams - 1) }, (_, index) => `perf-match-${index + 1}`),
    certificateIds: ["champion", "runner_up", "third_place", "mvp", "top_scorer", "top_defender", "top_assist"].map((type) => `perf-certificate-${type}`),
  };
}

export async function countQueries<T>(work: () => Promise<T>): Promise<Readonly<{ value: T; count: number }>> {
  const counter: QueryCounter = { count: 0 };
  const previous = activeQueryCounter;
  activeQueryCounter = counter;
  try {
    return { value: await work(), count: counter.count };
  } finally {
    activeQueryCounter = previous;
  }
}

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

function functionBody(text: string, functionName: string): string {
  const start = text.indexOf(`function ${functionName}`);
  const exportedStart = text.indexOf(`export async function ${functionName}`);
  const offset = exportedStart >= 0 ? exportedStart : start;
  if (offset < 0) throw new Error(`Unable to locate ${functionName}`);
  const nextExport = text.indexOf("\nexport ", offset + 1);
  return text.slice(offset, nextExport < 0 ? text.length : nextExport);
}

describe("organizer reader release-scale contracts", () => {
  it("creates the exact 64-team fixture cardinalities without database credentials", async () => {
    const fixture = await seedOrganizerScaleFixture();

    expect(fixture.eventId).toBe("perf-event-64-teams");
    expect(fixture.teamIds).toHaveLength(64);
    expect(fixture.playerIds).toHaveLength(ORGANIZER_SCALE_MANIFEST.players);
    expect(fixture.matchIds).toHaveLength(ORGANIZER_SCALE_MANIFEST.matches);
    expect(fixture.certificateIds).toHaveLength(ORGANIZER_SCALE_MANIFEST.certificates);
    expect({
      teams: fixture.teamIds.length,
      players: fixture.playerIds.length,
      matches: fixture.matchIds.length,
      playerStats: ORGANIZER_SCALE_MANIFEST.playerStats,
      auditRows: ORGANIZER_SCALE_MANIFEST.auditRows,
      completions: ORGANIZER_SCALE_MANIFEST.completions,
      certificates: fixture.certificateIds.length,
    }).toEqual(ORGANIZER_SCALE_MANIFEST);
  });

  it("counts mocked reader queries without requiring a database", async () => {
    const result = await countQueries(async () => {
      recordOrganizerReaderQuery();
      recordOrganizerReaderQuery();
      return "bounded" as const;
    });

    expect(result).toEqual({ value: "bounded", count: 2 });
  });

  it("requires bounded queue, participant, import, and payment list reads", () => {
    const repository = source("src/lib/platform/repository.ts");
    for (const functionName of [
      "getRegistrationRecordsForEvent",
      "getPaymentReviewForEvent",
    ]) {
      expect(functionBody(repository, functionName), functionName).toMatch(/take:\s*(?:\d+|[A-Z_]+)/);
    }
    expect(functionBody(repository, "getRegistrationImportHistoryForEvent")).toMatch(/items:\s*\{[\s\S]*?take:\s*(?:\d+|[A-Z_]+)/);
    expect(functionBody(repository, "getRegistrationImportBatchesForEvent")).toMatch(/items:\s*\{[\s\S]*?take:\s*(?:\d+|[A-Z_]+)/);
    expect(functionBody(repository, "getRegistrationImportEventContext")).toMatch(/teams:\s*\{[\s\S]*?take:\s*(?:\d+|[A-Z_]+)/);
  });

  it("requires bounded certificate history and completion audit reads", () => {
    const adapter = source("src/lib/completion/prisma-adapter.ts");
    const body = functionBody(adapter, "loadPrismaCompletionWorkspaceData");
    expect(body).toMatch(/certificate\.findMany\([\s\S]*?take:\s*(?:\d+|[A-Z_]+)/);
    expect(body).toMatch(/completionAuditEntry\.findMany\([\s\S]*?take:\s*(?:\d+|[A-Z_]+)/);
  });

  it("requires the public compatibility snapshot to cap every collection", () => {
    const reader = source("src/lib/events/public-v3-read.ts");
    const body = functionBody(reader, "compatibilitySnapshot");
    expect((body.match(/callOptional\("(?:team|match|teamRegistrationRequest|certificate)"\s*,\s*"findMany"/g) ?? []).length)
      .toBeGreaterThan(0);
    expect(body).toMatch(/team[^\n]*findMany[\s\S]*?take:\s*(?:\d+|[A-Z_]+)/);
    expect(body).toMatch(/match[^\n]*findMany[\s\S]*?take:\s*(?:\d+|[A-Z_]+)/);
  });

  it("keeps named reader query budgets independent of team cardinality", async () => {
    const fixture = await seedOrganizerScaleFixture();
    const result = await countQueries(async () => fixture.teamIds.map((teamId) => teamId));

    expect(result.value).toHaveLength(64);
    expect(result.count).toBeLessThanOrEqual(12);
    const pageSize = 25;
    expect(result.value.slice(0, pageSize)).toHaveLength(pageSize);
  });

  it("keeps each named reader within a fixed query-call budget", () => {
    const readers = [
      ["organizer", source("src/lib/organizer/workspace-read.ts"), 4],
      ["competition", source("src/lib/competition/workspace-read.ts"), 20],
      ["completion", functionBody(source("src/lib/completion/prisma-adapter.ts"), "loadPrismaCompletionWorkspaceData"), 20],
      ["public", functionBody(source("src/lib/events/public-v3-read.ts"), "compatibilitySnapshot"), 12],
    ] as const;
    for (const [name, text, budget] of readers) {
      const queryCalls = text.match(/(?:\.(?:findMany|findFirst|findUnique|count)|callOptional)\(/g)?.length ?? 0;
      expect(queryCalls, name).toBeLessThanOrEqual(budget);
    }
  });

  it("declares blocked external performance inputs instead of silently skipping", () => {
    const browserScript = source("scripts/run-dashboard-performance.mjs");
    const loadScript = source("scripts/load-test.mjs");
    const quickLoadScript = source("scripts/load-test-quick.mjs");
    expect(browserScript).toContain("DASHBOARD_PERF_BASE_URL");
    expect(browserScript).toContain("process.exitCode = 2");
    expect(loadScript).toContain("BASE_URL");
    expect(loadScript).toContain("process.exitCode = 2");
    expect(quickLoadScript).toContain("process.exitCode = 2");
  });
});
