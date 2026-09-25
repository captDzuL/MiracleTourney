import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

export type OrganizerScaleFixture = Readonly<{
  eventId: string;
  organizerId: string;
  teamIds: readonly string[];
  playerIds: readonly string[];
  matchIds: readonly string[];
  certificateIds: readonly string[];
  cleanup: () => Promise<void>;
}>;

export { countQueries } from "./query-instrumentation";

type FixtureCall = Readonly<{ model: string; method: string; args: Record<string, unknown> }>;

function makeFixturePrismaDouble() {
  const calls: FixtureCall[] = [];
  const delegates = new Proxy({}, {
    get(_target, model: string) {
      if (model === "$transaction") return async (work: (tx: unknown) => Promise<unknown>) => work(delegates);
      return new Proxy({}, {
        get(_delegate, method: string) {
          return async (args: Record<string, unknown> = {}) => {
            calls.push({ model, method, args });
            if (method === "create") {
              const data = args.data as Record<string, unknown>;
              return { ...data, id: data.id ?? `${model}-created` };
            }
            if (method === "createMany") {
              const data = args.data as unknown[];
              return { count: data.length };
            }
            return null;
          };
        },
      });
    },
  });
  return { db: delegates, calls };
}

export const ORGANIZER_SCALE_MANIFEST = Object.freeze({
  teams: 64,
  players: 320,
  matches: 63,
  playerStats: 320,
  auditRows: 100,
  completions: 1,
  certificates: 7,
});

const SCALE_CERTIFICATE_TYPES = ["champion", "runner_up", "third_place", "mvp", "top_scorer", "top_defender", "top_assist"] as const;

type OrganizerScalePlan = Readonly<{
  namespace: string;
  eventId: string;
  organizerId: string;
  teamIds: readonly string[];
  playerIds: readonly string[];
  matchIds: readonly string[];
  certificateIds: readonly string[];
}>;

function buildOrganizerScalePlan(namespace: string, teamCount = ORGANIZER_SCALE_MANIFEST.teams, playersPerTeam = 5): OrganizerScalePlan {
  if (teamCount !== ORGANIZER_SCALE_MANIFEST.teams || playersPerTeam !== 5) {
    throw new Error("Organizer scale fixture requires exactly 64 teams with 5 players each");
  }
  const eventId = `${namespace}-event`;
  const organizerId = `${namespace}-organizer`;
  const teamIds = Array.from({ length: teamCount }, (_, index) => `${namespace}-team-${String(index + 1).padStart(2, "0")}`);
  const playerIds = teamIds.flatMap((teamId) => Array.from({ length: playersPerTeam }, (_, index) => `${teamId}-player-${index + 1}`));
  const matchIds = Array.from({ length: teamCount - 1 }, (_, index) => `${namespace}-match-${String(index + 1).padStart(2, "0")}`);
  const certificateIds = SCALE_CERTIFICATE_TYPES.map((type) => `${namespace}-certificate-${type}`);
  return { namespace, eventId, organizerId, teamIds, playerIds, matchIds, certificateIds };
}

export async function seedOrganizerScaleFixture(client: PrismaClient, options: { namespace?: string } = {}): Promise<OrganizerScaleFixture> {
  const namespace = options.namespace ?? `organizer-scale-${randomUUID()}`;
  const plan = buildOrganizerScalePlan(namespace);
  const now = new Date("2026-09-21T00:00:00.000Z");
  const formatConfig = {
    version: 1,
    kind: "single_elimination",
    bestOf: { earlyRounds: 1, semifinals: 3, thirdPlace: 1, final: 5 },
    thirdPlace: "none",
  };

  await client.$transaction(async (tx) => {
    await tx.user.create({
      data: {
        id: plan.organizerId,
        email: `${plan.organizerId}@example.test`,
        name: "Organizer Scale Fixture",
        role: "organizer",
        passwordHash: "fixture-only-not-for-login",
      },
    });
    await tx.event.create({
      data: {
        id: plan.eventId,
        slug: `${plan.namespace}-slug`,
        name: "Organizer Scale Fixture",
        description: "Credential-independent organizer reader scale fixture",
        gameId: "game-flashpeak",
        gameModeId: "mode-flashpeak-5v5",
        format: "Single Elimination",
        formatConfig,
        status: "Finished",
        participantCap: plan.teamIds.length,
        registrationWindow: "Fixture",
        startsAt: "2026-09-21",
        eventStartsAt: now,
        timezone: "Asia/Jakarta",
        venue: "Fixture Arena",
        organizerUserId: plan.organizerId,
        organizerName: "Organizer Scale Fixture",
        organizerVerified: true,
        publishedAt: now,
        competitionVersion: 1,
      },
    });
    await tx.team.createMany({
      data: plan.teamIds.map((id, index) => ({
        id,
        eventId: plan.eventId,
        name: `Scale Team ${index + 1}`,
        logoText: `S${index + 1}`,
        tag: `S${index + 1}`,
        source: "performance-fixture",
        createdAt: now,
      })),
    });
    await tx.player.createMany({
      data: plan.playerIds.map((id, index) => {
        const teamId = plan.teamIds[Math.floor(index / 5)];
        return {
          id,
          eventId: plan.eventId,
          teamId,
          displayName: `Scale Player ${index + 1}`,
          nickname: `scale-player-${index + 1}`,
          position: "Forward",
          createdAt: now,
        };
      }),
    });
    await tx.match.createMany({
      data: plan.matchIds.map((id, index) => {
        const round = Math.floor(Math.log2(index + 2));
        const slot = index + 1 - (2 ** round - 2);
        return {
          id,
          eventId: plan.eventId,
          roundLabel: round === 6 ? "Final" : `Round ${round}`,
          homeTeamId: plan.teamIds[(index * 2) % plan.teamIds.length],
          awayTeamId: plan.teamIds[(index * 2 + 1) % plan.teamIds.length],
          round,
          slot,
          status: "Completed",
          scheduleStatus: "completed" as const,
          resultVersion: 1,
          homeScore: 1,
          awayScore: 0,
          winnerTeamId: plan.teamIds[(index * 2) % plan.teamIds.length],
          createdAt: now,
        };
      }),
    });
    await tx.playerStat.createMany({
      data: plan.playerIds.map((playerId, index) => ({
        id: `${plan.namespace}-stat-${index + 1}`,
        matchId: plan.matchIds[Math.floor(index / 10)],
        playerId,
        playerName: `Scale Player ${index + 1}`,
        teamId: plan.teamIds[Math.floor(index / 5)],
        position: "Forward",
        gameSlug: "flashpeak",
        stats: { goal: 1, assist: 1, defense: 1, passing: 1 },
        source: "performance-fixture",
        lastUpdatedBy: plan.organizerId,
      })),
    });
    await tx.competitionAuditLog.createMany({
      data: Array.from({ length: ORGANIZER_SCALE_MANIFEST.auditRows }, (_, index) => ({
        id: `${plan.namespace}-competition-audit-${index + 1}`,
        eventId: plan.eventId,
        actorUserId: plan.organizerId,
        action: "fixture_read",
        reason: "Organizer reader scale fixture",
        payload: { index },
        idempotencyKey: `${plan.namespace}-competition-audit-${index + 1}`,
        createdAt: now,
      })),
    });
    const completion = await tx.tournamentCompletion.create({
      data: {
        id: `${plan.namespace}-completion`,
        eventId: plan.eventId,
        status: "completed",
        format: "Single Elimination",
        sourceSnapshot: { fixture: plan.namespace, matches: plan.matchIds.length },
        completedByUserId: plan.organizerId,
        completedAt: now,
        certificateRevision: 1,
      },
    });
    await tx.completionAuditEntry.createMany({
      data: Array.from({ length: ORGANIZER_SCALE_MANIFEST.auditRows }, (_, index) => ({
        id: `${plan.namespace}-completion-audit-${index + 1}`,
        completionId: completion.id,
        action: "fixture_read",
        actorUserId: plan.organizerId,
        details: { index },
        idempotencyKey: `${plan.namespace}-completion-audit-${index + 1}`,
        createdAt: now,
      })),
    });
    await tx.certificate.createMany({
      data: SCALE_CERTIFICATE_TYPES.map((type, index) => ({
        id: plan.certificateIds[index],
        eventId: plan.eventId,
        teamId: plan.teamIds[0],
        type,
        recipientKind: type === "champion" || type === "runner_up" || type === "third_place" ? "team" : "player",
        recipientId: type === "champion" || type === "runner_up" || type === "third_place" ? plan.teamIds[0] : plan.playerIds[index],
        recipientName: `Scale Recipient ${index + 1}`,
        completionId: completion.id,
        completionVersion: 1,
        status: "ready",
        imageUrl: "",
        verificationCode: `${plan.namespace}-verification-${type}`,
        generatedAt: now,
      })),
    });
  });

  let cleaned = false;
  return {
    eventId: plan.eventId,
    organizerId: plan.organizerId,
    teamIds: plan.teamIds,
    playerIds: plan.playerIds,
    matchIds: plan.matchIds,
    certificateIds: plan.certificateIds,
    async cleanup() {
      if (cleaned) return;
      cleaned = true;
      await client.$transaction(async (tx) => {
        await tx.event.delete({ where: { id: plan.eventId } });
        await tx.user.delete({ where: { id: plan.organizerId } });
      });
    },
  };
}

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

function extractObserverInit(browserScript: string): string {
  const match = browserScript.match(/const PERFORMANCE_OBSERVER_INIT = `([\s\S]*?)`;/);
  if (!match) throw new Error("Dashboard performance observer init was not found");
  return match[1];
}

type ObserverEntry = Readonly<{ duration?: number }>;
type ObserverList = Readonly<{ getEntries: () => readonly ObserverEntry[] }>;
type ObserverRecord = {
  callback: (list: ObserverList) => void;
  options: Record<string, unknown>;
};

function executeObserverInit(browserScript: string) {
  const observers: ObserverRecord[] = [];
  class FakePerformanceObserver {
    constructor(private readonly callback: ObserverRecord["callback"]) {}

    observe(options: Record<string, unknown>) {
      observers.push({ callback: this.callback, options });
    }
  }
  const pageWindow: { __miracleDashboardPerformance?: Record<string, unknown> } = {};
  runInNewContext(extractObserverInit(browserScript), { PerformanceObserver: FakePerformanceObserver, window: pageWindow });
  return { observers, pageWindow };
}

function observerForType(observers: readonly ObserverRecord[], type: string): ObserverRecord {
  const observer = observers.find(({ options }) => options.type === type);
  if (!observer) throw new Error(`Missing ${type} observer`);
  return observer;
}

type LoadFixtureMode = "healthy" | "failing" | "slow" | "errors" | "non2xx" | "boundary-pass" | "boundary-fail" | "missing";
type WarmupFixture = Readonly<{ failurePath?: string; status?: number; transportFailure?: boolean; bodyFailure?: boolean }>;
type LoadRequest = Readonly<{ kind: "warmup" | "autocannon" | "other"; method: string; url: string; accept?: string }>;
type LoadScriptProcess = Readonly<{ exitCode: number; stdout: string; stderr: string; baseUrl: string | null; requests: readonly LoadRequest[] }>;

const LOCAL_QUICK_LOAD_ROUTES = [
  "/id",
  "/id/events",
  "/id/events/flashpeak-champions-32/bracket",
] as const;
const QUICK_LOAD_ACCEPT = "text/html,application/xhtml+xml";

async function runLoadScriptWithOutput(scriptName: string, mode: LoadFixtureMode, warmup?: WarmupFixture): Promise<LoadScriptProcess> {
  const environment = { ...process.env };
  const requests: LoadRequest[] = [];
  let baseUrl: string | null = null;
  const server = createServer((_request, response) => {
    const requestUrl = new URL(_request.url ?? "/", baseUrl ?? "http://127.0.0.1");
    const pathname = requestUrl.pathname;
    const accept = Array.isArray(_request.headers.accept) ? _request.headers.accept.join(",") : _request.headers.accept;
    const kind = pathname === "/__autocannon_call" ? "autocannon" : LOCAL_QUICK_LOAD_ROUTES.includes(pathname as typeof LOCAL_QUICK_LOAD_ROUTES[number]) ? "warmup" : "other";
    requests.push({ kind, method: _request.method ?? "", url: requestUrl.href, ...(accept ? { accept } : {}) });
    if (kind === "autocannon") {
      response.writeHead(204);
      response.end();
      return;
    }
    if (warmup && kind === "warmup" && (warmup.failurePath === undefined || pathname === warmup.failurePath)) {
      if (warmup.transportFailure) {
        _request.socket.destroy();
        return;
      }
      if (warmup.bodyFailure) {
        response.writeHead(warmup.status ?? 200, { "content-type": "text/plain" });
        response.flushHeaders();
        response.write("partial warmup body");
        setTimeout(() => response.destroy(), 10);
        return;
      }
      response.writeHead(warmup.status ?? 500, warmup.status === 307 ? { location: "/warmup-redirect-target" } : undefined);
      response.end("warmup failure");
      return;
    }
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("fixture");
  });
  let args: string[];
  if (mode === "missing") {
    delete environment.BASE_URL;
    args = [fileURLToPath(new URL(`../../${scriptName}`, import.meta.url))];
  } else {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Fixture server did not expose a port");
    baseUrl = `http://127.0.0.1:${address.port}`;
    environment.BASE_URL = baseUrl;
    environment.LOAD_FIXTURE_MODE = mode;
    environment.LOAD_FIXTURE_AUTOCANNON_TRACE = warmup ? "true" : "false";
    args = [
      "--experimental-loader",
      pathToFileURL(fileURLToPath(new URL("./autocannon-fixture-loader.mjs", import.meta.url))).href,
      fileURLToPath(new URL(`../../${scriptName}`, import.meta.url)),
    ];
  }
  const child = spawn(process.execPath, args, { env: environment, stdio: ["ignore", "pipe", "pipe"] });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
  child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));
  const [exitCode] = await once(child, "close") as [number | null, string | null];
  if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  return {
    exitCode: exitCode ?? -1,
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8"),
    baseUrl,
    requests,
  };
}

async function runLoadScript(scriptName: string, mode: LoadFixtureMode): Promise<number> {
  return (await runLoadScriptWithOutput(scriptName, mode)).exitCode;
}

describe("organizer reader release-scale contracts", () => {
  it("creates the exact 64-team fixture cardinalities without database credentials", async () => {
    const fixture = buildOrganizerScalePlan("manifest");

    expect(fixture.eventId).toBe("manifest-event");
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

  it("executes an isolated Prisma fixture seed and exposes scoped cleanup", async () => {
    const { db, calls } = makeFixturePrismaDouble();
    const seed = seedOrganizerScaleFixture as unknown as (client: unknown) => Promise<OrganizerScaleFixture & { cleanup: () => Promise<void> }>;
    const fixture = await seed(db);

    expect(calls.filter(({ model, method }) => model === "team" && method === "createMany")[0]?.args.data).toHaveLength(64);
    expect(calls.filter(({ model, method }) => model === "player" && method === "createMany")[0]?.args.data).toHaveLength(320);
    expect(calls.filter(({ model, method }) => model === "match" && method === "createMany")[0]?.args.data).toHaveLength(63);
    expect(calls.filter(({ model, method }) => model === "playerStat" && method === "createMany")[0]?.args.data).toHaveLength(320);
    expect(calls.filter(({ model, method }) => model === "competitionAuditLog" && method === "createMany")[0]?.args.data).toHaveLength(100);
    expect(calls.filter(({ model, method }) => model === "tournamentCompletion" && method === "create")[0]).toBeDefined();
    expect(calls.filter(({ model, method }) => model === "certificate" && method === "createMany")[0]?.args.data).toHaveLength(7);
    expect(fixture.cleanup).toEqual(expect.any(Function));

    await fixture.cleanup();
    expect(calls.some(({ model, method }) => model === "event" && method === "delete")).toBe(true);
    expect(calls.some(({ model, method }) => model === "user" && method === "delete")).toBe(true);
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

  it("requires supplied-target load failures to return exit 1", () => {
    for (const scriptName of ["scripts/load-test.mjs", "scripts/load-test-quick.mjs"]) {
      expect(source(scriptName), scriptName).toMatch(/process\.exitCode\s*=\s*1/);
    }
  });

  it.each(["scripts/load-test.mjs", "scripts/load-test-quick.mjs"])("runs %s with executable 0/1/2 contracts", async (scriptName) => {
    await expect(runLoadScript(scriptName, "healthy")).resolves.toBe(0);
    await expect(runLoadScript(scriptName, "failing")).resolves.toBe(1);
    await expect(runLoadScript(scriptName, "missing")).resolves.toBe(2);
  });

  it("requires buffered browser observers before navigation and a deterministic INP interaction", () => {
    const browserScript = source("scripts/run-dashboard-performance.mjs");
    expect(browserScript).toContain("addInitScript");
    expect(browserScript).toMatch(/addInitScript[\s\S]*?goto/);
    expect(browserScript).toContain("buffered: true");
    expect(browserScript).toContain("durationThreshold");
    expect(browserScript).toContain("recordRepresentativeInteraction");
    expect(browserScript).toMatch(/INP[\s\S]*unavailable/);
  });

  it("records a shared finite-only interaction maximum across event and first-input observers", () => {
    const browserScript = source("scripts/run-dashboard-performance.mjs");
    const opposing = executeObserverInit(browserScript);
    expect(observerForType(opposing.observers, "event").options).toEqual({ type: "event", buffered: true, durationThreshold: 16 });
    expect(observerForType(opposing.observers, "first-input").options).toEqual({ type: "first-input", buffered: true });
    observerForType(opposing.observers, "first-input").callback({ getEntries: () => [{ duration: 240 }] });
    observerForType(opposing.observers, "event").callback({ getEntries: () => [{ duration: 30 }] });
    expect(opposing.pageWindow.__miracleDashboardPerformance?.inp).toBe(240);

    const lowThenHigh = executeObserverInit(browserScript);
    observerForType(lowThenHigh.observers, "event").callback({ getEntries: () => [{ duration: 30 }] });
    observerForType(lowThenHigh.observers, "first-input").callback({ getEntries: () => [{ duration: 240 }] });
    expect(lowThenHigh.pageWindow.__miracleDashboardPerformance?.inp).toBe(240);

    const cases = [
      { name: "event-only", event: [{ duration: 30 }], firstInput: [], expected: 30 },
      { name: "first-input-only", event: [], firstInput: [{ duration: 240 }], expected: 240 },
      { name: "no metric", event: [], firstInput: [], expected: null },
      { name: "nonfinite", event: [{ duration: Number.NaN }, { duration: Number.POSITIVE_INFINITY }, {}], firstInput: [{ duration: Number.NaN }], expected: null },
    ] as const;
    for (const item of cases) {
      const { observers, pageWindow } = executeObserverInit(browserScript);
      observerForType(observers, "event").callback({ getEntries: () => item.event });
      observerForType(observers, "first-input").callback({ getEntries: () => item.firstInput });
      expect(pageWindow.__miracleDashboardPerformance?.inp, item.name).toBe(item.expected);
    }

    const observerInit = extractObserverInit(browserScript);
    expect(observerInit).toContain("recordInteractionDuration");
    expect(observerInit).not.toContain("Number(entry.duration) || 0");
    expect(browserScript).toMatch(/const inp = typeof observed\?\.inp[\s\S]*: null/);
    expect(browserScript).toMatch(/browserBudgets = \{[^}]*inpMs: 200/);
    expect(browserScript).toMatch(/typeof value !== "number" \|\| !Number\.isFinite\(value\) \|\| value >= budget/);
    expect(browserScript).toMatch(/metricFailures[\s\S]*INP[\s\S]*unavailable/);
    const interaction = browserScript.match(/async function recordRepresentativeInteraction\(page\) \{[\s\S]*?\n\}/)?.[0];
    expect(interaction?.match(/\.click\(/g)).toHaveLength(1);
    expect(interaction).toContain("waitForFunction");
    expect(interaction).not.toContain("waitForTimeout");
    expect(interaction).toMatch(/timeout:\s*(?:INP_OBSERVATION_TIMEOUT_MS|\d+)/);
    expect(interaction).toMatch(/polling:\s*(?:INP_OBSERVATION_POLLING_MS|\d+)/);
    expect(interaction).toMatch(/catch\(\s*\(\)\s*=>\s*\{\}\s*\)/);
  });

  it("executes the exact local quick-load route/options contract", async () => {
    const quickLoadScript = source("scripts/load-test-quick.mjs");
    const result = await runLoadScriptWithOutput("scripts/load-test-quick.mjs", "healthy");
    expect(result.exitCode).toBe(0);
    const captureLine = result.stdout.split(/\r?\n/).find((line) => line.startsWith("AUTOCANNON_FIXTURE_CALLS="));
    expect(captureLine).toBeDefined();
    const calls = JSON.parse(captureLine?.slice("AUTOCANNON_FIXTURE_CALLS=".length) ?? "null") as Array<{
      url: string;
      connections: number;
      duration: number;
      headers: Record<string, string>;
      result: { p97_5: number; errors: number; non2xx: number };
    }>;
    expect(calls).toHaveLength(3);
    expect(calls.map((call) => Object.keys(call).sort())).toEqual([
      ["duration", "headers", "result", "url", "connections"].sort(),
      ["duration", "headers", "result", "url", "connections"].sort(),
      ["duration", "headers", "result", "url", "connections"].sort(),
    ]);
    expect(result.baseUrl).toBeDefined();
    expect(calls.map(({ url, connections, duration, headers }) => ({ url, connections, duration, headers }))).toEqual([
      { url: `${result.baseUrl}/id`, connections: 50, duration: 5, headers: { accept: "text/html,application/xhtml+xml" } },
      { url: `${result.baseUrl}/id/events`, connections: 50, duration: 5, headers: { accept: "text/html,application/xhtml+xml" } },
      { url: `${result.baseUrl}/id/events/flashpeak-champions-32/bracket`, connections: 50, duration: 5, headers: { accept: "text/html,application/xhtml+xml" } },
    ]);
    expect(calls.map(({ result }) => result)).toEqual([
      { p97_5: 100, errors: 0, non2xx: 0 },
      { p97_5: 100, errors: 0, non2xx: 0 },
      { p97_5: 100, errors: 0, non2xx: 0 },
    ]);
    expect(quickLoadScript).toMatch(/const P97_5_BUDGET_MS = 3_000;/);
    expect(quickLoadScript).toMatch(/r\.p97_5 < P97_5_BUDGET_MS/);
    expect(quickLoadScript).not.toMatch(/allow(?:ed|list)/i);
  });

  it.each([200, 299])("warms every exact local quick-load URL once before autocannon at status %s", async (status) => {
    const result = await runLoadScriptWithOutput("scripts/load-test-quick.mjs", "healthy", { status });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.baseUrl).toBeDefined();
    const expectedWarmups = LOCAL_QUICK_LOAD_ROUTES.map((path) => ({
      kind: "warmup" as const,
      method: "GET",
      url: `${result.baseUrl}${path}`,
      accept: QUICK_LOAD_ACCEPT,
    }));
    expect(result.requests.slice(0, expectedWarmups.length)).toEqual(expectedWarmups);
    expect(result.requests.filter(({ kind }) => kind === "warmup")).toEqual(expectedWarmups);
    const firstAutocannonCall = result.requests.findIndex(({ kind }) => kind === "autocannon");
    expect(firstAutocannonCall).toBe(expectedWarmups.length);
    expect(result.requests.slice(firstAutocannonCall)).toHaveLength(3);
    expect(result.requests.slice(firstAutocannonCall).every(({ kind }) => kind === "autocannon")).toBe(true);
    expect(result.stdout).toContain("AUTOCANNON_FIXTURE_CALLS=");
  });

  it.each([307, 500])("fails closed before autocannon for status %s on every selected route", async (status) => {
    for (const path of LOCAL_QUICK_LOAD_ROUTES) {
      const result = await runLoadScriptWithOutput("scripts/load-test-quick.mjs", "healthy", { failurePath: path, status });
      const attemptedWarmupCount = LOCAL_QUICK_LOAD_ROUTES.indexOf(path) + 1;
      expect(result.exitCode, `${status} ${path}`).toBe(1);
      expect(result.stderr, `${status} ${path}`).toContain(path);
      expect(result.stderr, `${status} ${path}`).toContain(String(status));
      expect(result.stderr, `${status} ${path}`).not.toContain(result.baseUrl ?? "");
      expect(result.requests, `${status} ${path}`).toHaveLength(attemptedWarmupCount);
      expect(result.requests.filter(({ kind }) => kind === "warmup"), `${status} ${path}`).toHaveLength(attemptedWarmupCount);
      expect(result.requests.filter(({ kind }) => kind === "autocannon"), `${status} ${path}`).toHaveLength(0);
      expect(result.stdout, `${status} ${path}`).toContain("AUTOCANNON_FIXTURE_CALLS=[]");
    }
  });

  it("fails closed before autocannon on a warmup transport failure for every selected route", async () => {
    for (const path of LOCAL_QUICK_LOAD_ROUTES) {
      const result = await runLoadScriptWithOutput("scripts/load-test-quick.mjs", "healthy", { failurePath: path, transportFailure: true });
      const attemptedWarmupCount = LOCAL_QUICK_LOAD_ROUTES.indexOf(path) + 1;
      expect(result.exitCode, path).toBe(1);
      expect(result.stderr, path).toContain(path);
      expect(result.stderr, path).toMatch(/transport error/i);
      expect(result.stderr, path).not.toContain(result.baseUrl ?? "");
      expect(result.requests, path).toHaveLength(attemptedWarmupCount);
      expect(result.requests.filter(({ kind }) => kind === "warmup"), path).toHaveLength(attemptedWarmupCount);
      expect(result.requests.filter(({ kind }) => kind === "autocannon"), path).toHaveLength(0);
      expect(result.stdout, path).toContain("AUTOCANNON_FIXTURE_CALLS=[]");
    }
  });

  it("fails closed before autocannon when a warmup body rejects after headers", async () => {
    for (const path of LOCAL_QUICK_LOAD_ROUTES) {
      const result = await runLoadScriptWithOutput("scripts/load-test-quick.mjs", "healthy", { failurePath: path, status: 200, bodyFailure: true });
      const attemptedWarmupCount = LOCAL_QUICK_LOAD_ROUTES.indexOf(path) + 1;
      expect(result.exitCode, path).toBe(1);
      expect(result.stderr, path).toContain(path);
      expect(result.stderr, path).toMatch(/transport error/i);
      expect(result.stderr, path).not.toContain(result.baseUrl ?? "");
      expect(result.requests, path).toHaveLength(attemptedWarmupCount);
      expect(result.requests.filter(({ kind }) => kind === "warmup"), path).toHaveLength(attemptedWarmupCount);
      expect(result.requests.filter(({ kind }) => kind === "autocannon"), path).toHaveLength(0);
      expect(result.stdout, path).toContain("AUTOCANNON_FIXTURE_CALLS=[]");
    }
  });

  it("uses manual redirects and a checked 2xx warmup response before measuring", () => {
    const quickLoadScript = source("scripts/load-test-quick.mjs");
    expect(quickLoadScript).toContain('redirect: "manual"');
    expect(quickLoadScript).toMatch(/response\.status\s*<\s*200/);
    expect(quickLoadScript).toMatch(/response\.status\s*>\s*299/);
  });

  it("enforces quick-load gates independently at the p97.5 boundary", async () => {
    const cases: ReadonlyArray<Readonly<{
      mode: Exclude<LoadFixtureMode, "missing">;
      exitCode: number;
      result: { p97_5: number; errors: number; non2xx: number };
    }>> = [
      { mode: "boundary-pass", exitCode: 0, result: { p97_5: 2_999, errors: 0, non2xx: 0 } },
      { mode: "boundary-fail", exitCode: 1, result: { p97_5: 3_000, errors: 0, non2xx: 0 } },
      { mode: "slow", exitCode: 1, result: { p97_5: 3_500, errors: 0, non2xx: 0 } },
      { mode: "errors", exitCode: 1, result: { p97_5: 2_999, errors: 1, non2xx: 0 } },
      { mode: "non2xx", exitCode: 1, result: { p97_5: 2_999, errors: 0, non2xx: 1 } },
    ];
    for (const item of cases) {
      const process = await runLoadScriptWithOutput("scripts/load-test-quick.mjs", item.mode);
      expect(process.exitCode, item.mode).toBe(item.exitCode);
      const captureLine = process.stdout.split(/\r?\n/).find((line) => line.startsWith("AUTOCANNON_FIXTURE_CALLS="));
      expect(captureLine, item.mode).toBeDefined();
      const calls = JSON.parse(captureLine?.slice("AUTOCANNON_FIXTURE_CALLS=".length) ?? "null") as Array<{ result: typeof item.result }>;
      expect(calls).toHaveLength(3);
      expect(calls.map(({ result }) => result), item.mode).toEqual([item.result, item.result, item.result]);
    }
  });

  it("uses exact locale-prefixed local quick-load routes and preserves the load budget", () => {
    const quickLoadScript = source("scripts/load-test-quick.mjs");
    const localRoutes = quickLoadScript.match(/\n  : \[([\s\S]*?)\n    \]\s*;/)?.[1];
    expect(localRoutes).toBeDefined();
    expect(localRoutes).toMatch(/label: "Home page", path: "\/id"/);
    expect(localRoutes).toMatch(/label: "Events list", path: "\/id\/events"/);
    expect(localRoutes).toMatch(/label: "Bracket \(flashpeak-champions-32\)", path: "\/id\/events\/flashpeak-champions-32\/bracket"/);
    expect(localRoutes).not.toMatch(/path: "\/(?:events|$)/);
    expect(quickLoadScript).toMatch(/connections: 50/);
    expect(quickLoadScript).toMatch(/duration: 5/);
    expect(quickLoadScript).toContain("p97.5");
    expect(quickLoadScript).toContain("non2xx === 0");
  });

  it("keeps the Task 9 report whitespace-clean and records its exact diff-check range", () => {
    const report = source(".superpowers/sdd/2026-09-20-organizer-master-workspace-release-readiness/task-9-report.md");
    expect(report).not.toMatch(/[ \t]+$/m);
    expect(report).toContain("git diff --check 11f1fcc..HEAD");
  });
});
