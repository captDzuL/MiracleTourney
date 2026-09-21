import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryCall = Readonly<{ model: string; method: string; args: Record<string, unknown> }>;

const harness = vi.hoisted(() => {
  const calls: QueryCall[] = [];
  let teamCount = 1;
  let forcedOverflow: { model: string; limit: number } | null = null;
  let forcedExact: { model: string; count: number } | null = null;
  const now = new Date("2026-09-21T00:00:00.000Z");
  const event = {
    id: "event-1",
    slug: "scale-cup",
    organizerUserId: "organizer-1",
    name: "Scale Cup",
    description: "Instrumented scale fixture",
    gameId: "game-flashpeak",
    gameModeId: "mode-flashpeak-5v5",
    format: "Single Elimination",
    formatConfig: {
      version: 1,
      kind: "single_elimination",
      bestOf: { earlyRounds: 1, semifinals: 3, thirdPlace: 1, final: 5 },
      thirdPlace: "none",
    },
    status: "Ongoing",
    competitionVersion: 0,
    participantCap: 64,
    registrationWindow: "Open",
    startsAt: "2026-09-21",
    timezone: "Asia/Jakarta",
    venue: "Scale Arena",
    publishedAt: now,
    updatedAt: now,
    publishedScheduleVersion: null,
    completion: null,
    _count: { teams: 1, teamRegistrationRequests: 0, matches: 0, statSubmissions: 0, competitionActionItems: 0 },
  };

  const response = (model: string, method: string, args: Record<string, unknown>) => {
    const requestedTake = typeof args.take === "number" ? args.take : teamCount;
    const boundedLength = forcedOverflow?.model === model
      ? forcedOverflow.limit + 1
      : forcedExact?.model === model
        ? forcedExact.count
      : Math.min(teamCount, requestedTake);
    if (model === "event" && method === "findFirst") return structuredClone(event);
    if (model === "event" && method === "findUnique") return structuredClone(event);
    if (model === "competitionPhase" && method === "findFirst") return null;
    if (model === "tournamentCompletion" && method === "findUnique") return null;
    if (model === "certificatePublication" && method === "findFirst") return {
      version: 1,
      completionVersion: 1,
      certificateIds: Array.from({ length: teamCount }, (_, index) => `certificate-${index + 1}`),
      publishedAt: now,
    };
    if (model === "certificate" && method === "findMany") return [{
      id: "certificate-1",
      type: "champion",
      recipientKind: "team",
      recipientId: "team-1",
      recipientName: "Team 1",
      publishedUrl: "/certificate-1.png",
      verificationCode: "verify-1",
      publishedAt: now,
      status: "ready",
      completionId: null,
      completionVersion: null,
    }, ...Array.from({ length: Math.max(0, boundedLength - 1) }, (_, index) => ({
      id: `certificate-${index + 2}`,
      type: "mvp",
      recipientKind: "player",
      recipientId: `player-${index + 1}`,
      recipientName: `Player ${index + 1}`,
      publishedUrl: `/certificate-${index + 2}.png`,
      verificationCode: `verify-${index + 2}`,
      publishedAt: now,
      status: "ready",
      completionId: null,
      completionVersion: null,
    }))];
    if (model === "completionAuditEntry" && method === "findMany") return Array.from({ length: boundedLength }, (_, index) => ({
      action: "fixture_read",
      actorUserId: `actor-${index + 1}`,
      createdAt: now,
      details: { index },
      id: `audit-${index + 1}`,
    }));
    if (model === "user" && method === "findMany") return [];
    if (model === "team" && method === "findMany") {
      return Array.from({ length: boundedLength }, (_, index) => ({
        id: `team-${index + 1}`,
        eventId: "event-1",
        name: `Team ${index + 1}`,
        tag: `T${index + 1}`,
        captainName: `Captain ${index + 1}`,
        captainContact: null,
        captainIgn: null,
        captainUid: null,
        captainIsPlayer: true,
        source: "e2e",
        createdAt: now,
        players: Array.from({ length: 5 }, (_, playerIndex) => ({ id: `player-${index + 1}-${playerIndex + 1}` })),
        captain: { id: `captain-${index + 1}`, name: `Captain ${index + 1}`, email: `captain-${index + 1}@example.test` },
      }));
    }
    if (model === "match" && method === "findMany") {
      return Array.from({ length: boundedLength }, (_, index) => ({
        id: `match-${index + 1}`,
        eventId: "event-1",
        roundLabel: "Round 1",
        homeTeamId: "team-1",
        awayTeamId: "team-2",
        homeScore: 1,
        awayScore: 0,
        winnerTeamId: "team-1",
        status: "Completed",
        scheduleStatus: "completed",
        resultVersion: 1,
        round: 1,
        slot: index + 1,
        resultSnapshot: null,
      }));
    }
    if (model === "competitionAuditLog" && method === "findMany") {
      return Array.from({ length: boundedLength }, (_, index) => ({
        id: `competition-audit-${index + 1}`,
        matchId: null,
        action: "fixture_read",
        reason: null,
        actorUserId: null,
        createdAt: now,
      }));
    }
    if (model === "teamRegistrationRequest" && method === "findMany") return [];
    if (model === "registrationImportItem" && method === "findMany") return [];
    if (method === "updateMany") return { count: 0 };
    return [];
  };

  const prisma = new Proxy({}, {
    get(_target, model: string) {
      if (model === "$transaction") return async (work: (tx: unknown) => Promise<unknown>) => work(prisma);
      return new Proxy({}, {
        get(_delegate, method: string) {
          return async (args: Record<string, unknown> = {}) => {
            calls.push({ model, method, args });
            return response(model, method, args);
          };
        },
      });
    },
  });

  return {
    calls,
    prisma,
    setTeamCount(value: number) { teamCount = value; },
    setOverflow(model: string, limit: number) { forcedOverflow = { model, limit }; },
    setExact(model: string, count: number) { forcedExact = { model, count }; },
    reset() { calls.length = 0; forcedOverflow = null; forcedExact = null; },
  };
});

vi.mock("@/lib/platform/db", () => ({ prisma: harness.prisma }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: () => true }));
vi.mock("@/lib/auth/session", () => ({ requireAnyRole: vi.fn(async () => ({ id: "organizer-1", role: "organizer", email: "organizer@example.test", name: "Organizer" })) }));
vi.mock("@/lib/security/authorization", () => ({ authorizeWorkspaceResource: vi.fn(() => ({ ok: true })) }));
vi.mock("@/lib/events/public-registration", () => ({ readPublicRegistration: vi.fn(async () => null) }));
vi.mock("@/lib/events/public-drawing", () => ({ readPublicDrawing: vi.fn(async () => null) }));
vi.mock("@/lib/events/public-ongoing", () => ({ readPublicOngoing: vi.fn(async () => null), getPublicOngoingEvent: vi.fn(async () => null) }));
vi.mock("@/lib/events/public-finished", () => ({ readPublicFinished: vi.fn(async () => null) }));

import { getRegistrationRecordsForEvent } from "@/lib/platform/repository";
import { readCompetitionWorkspace } from "@/lib/competition/workspace-read";
import { loadPrismaCompletionWorkspaceData } from "@/lib/completion/prisma-adapter";
import { readPublicV3Event } from "@/lib/events/public-v3-read";
import { readOrganizerWorkspaceSummary } from "@/lib/organizer/workspace-read";
import { countQueries } from "./query-instrumentation";

const organizer = { id: "organizer-1", role: "organizer" as const, email: "organizer@example.test", name: "Organizer" };

async function measure<T>(work: () => Promise<T>, teamCount: number, override?: { model: string; limit: number; mode?: "overflow" | "exact" }) {
  harness.reset();
  harness.setTeamCount(teamCount);
  if (override?.mode === "exact") harness.setExact(override.model, override.limit);
  else if (override) harness.setOverflow(override.model, override.limit);
  return countQueries(work, harness.calls);
}

describe("instrumented organizer reader query budgets", () => {
  beforeEach(() => harness.reset());

  it("snapshots query calls independently from the mutable delegate trace", async () => {
    const trace: QueryCall[] = [];
    const first = await countQueries(async () => "first", trace);
    trace.push({ model: "event", method: "findUnique", args: { where: { id: "later" } } });
    expect(first.calls).toEqual([]);
    expect(first.calls).not.toBe(trace);
  });

  it("invokes the organizer summary reader with one query at both cardinalities", async () => {
    const small = await measure(() => readOrganizerWorkspaceSummary("event-1", organizer), 1);
    const scale = await measure(() => readOrganizerWorkspaceSummary("event-1", organizer), 64);

    expect(small.value).not.toBeNull();
    expect(scale.value).not.toBeNull();
    expect(small.calls).toHaveLength(1);
    expect(scale.calls).toHaveLength(1);
    expect(small.count).toBe(scale.count);
    expect(small.calls).not.toBe(scale.calls);
    expect(small.calls[0]).toMatchObject({ model: "event", method: "findFirst" });
    expect(small.calls[0].args).toMatchObject({ where: { id: "event-1", organizerUserId: "organizer-1" } });
    expect(scale.calls[0]).toMatchObject({ model: "event", method: "findFirst" });
    expect(scale.calls[0].args).toMatchObject({ where: { id: "event-1", organizerUserId: "organizer-1" } });
  });

  it("invokes registration queue reads with stable query count and exact collection caps", async () => {
    const small = await measure(() => getRegistrationRecordsForEvent(organizer, "event-1"), 1);
    const scale = await measure(() => getRegistrationRecordsForEvent(organizer, "event-1"), 64);

    expect(small.value).toHaveLength(1);
    expect(scale.value).toHaveLength(64);
    expect(small.calls).toHaveLength(5);
    expect(scale.calls).toHaveLength(5);
    expect(small.count).toBe(scale.count);
    expect(small.calls).not.toBe(scale.calls);
    expect(scale.calls.filter(({ method }) => method === "findMany")).toHaveLength(3);

    const smallTeamRead = small.calls.find(({ model, method }) => model === "team" && method === "findMany");
    const teamRead = scale.calls.find(({ model, method }) => model === "team" && method === "findMany");
    const smallRequestRead = small.calls.find(({ model, method }) => model === "teamRegistrationRequest" && method === "findMany");
    const requestRead = scale.calls.find(({ model, method }) => model === "teamRegistrationRequest" && method === "findMany");
    const smallImportRead = small.calls.find(({ model, method }) => model === "registrationImportItem" && method === "findMany");
    const importRead = scale.calls.find(({ model, method }) => model === "registrationImportItem" && method === "findMany");
    for (const read of [smallTeamRead, teamRead]) expect(read?.args).toMatchObject({ take: 501, include: { players: { take: 501 } } });
    for (const read of [smallRequestRead, requestRead]) expect(read?.args).toMatchObject({ take: 501 });
    for (const read of [smallImportRead, importRead]) expect(read?.args).toMatchObject({ take: 501 });
  });

  it("invokes competition workspace reads with stable query count and exact row/history caps", async () => {
    const small = await measure(() => readCompetitionWorkspace("event-1"), 1);
    const scale = await measure(() => readCompetitionWorkspace("event-1"), 64);

    expect(small.value).toMatchObject({ event: { id: "event-1" } });
    expect(scale.value.teams).toHaveLength(64);
    expect(small.calls).toHaveLength(scale.calls.length);
    expect(small.count).toBe(scale.count);
    expect(small.calls).not.toBe(scale.calls);
    expect(scale.calls).toHaveLength(16);
    for (const calls of [small.calls, scale.calls]) {
      expect(calls.find(({ model, method }) => model === "match" && method === "findMany")?.args).toMatchObject({ take: 1_001 });
      expect(calls.find(({ model, method }) => model === "competitionPhase" && method === "findMany")?.args).toMatchObject({ take: 101 });
      expect(calls.find(({ model, method }) => model === "competitionAuditLog" && method === "findMany")?.args).toMatchObject({ take: 101 });
    }
  });

  it("invokes completion workspace reads with stable query count and exact source/history caps", async () => {
    const small = await measure(() => loadPrismaCompletionWorkspaceData("event-1", organizer), 1);
    const scale = await measure(() => loadPrismaCompletionWorkspaceData("event-1", organizer), 64);

    expect(small.value.version).toBe(0);
    expect(scale.value.source.teams).toHaveLength(64);
    expect(small.calls).toHaveLength(scale.calls.length);
    expect(small.count).toBe(scale.count);
    expect(small.calls).not.toBe(scale.calls);
    expect(scale.calls).toHaveLength(13);
    for (const calls of [small.calls, scale.calls]) {
      expect(calls.find(({ model, method }) => model === "match" && method === "findMany")?.args).toMatchObject({ take: 1_001 });
      expect(calls.find(({ model, method }) => model === "certificate" && method === "findMany")?.args).toMatchObject({ take: 101 });
      expect(calls.find(({ model, method }) => model === "completionAuditEntry" && method === "findMany")?.args).toMatchObject({ take: 101 });
    }
  });

  it("rejects competition overflow even when the delegate ignores take", async () => {
    const result = measure(() => readCompetitionWorkspace("event-1"), 1, { model: "match", limit: 1_000 });

    await expect(result).rejects.toMatchObject({ name: "ReaderResultOverflowError", limit: 1_000 });
    expect(harness.calls.find(({ model, method }) => model === "match" && method === "findMany")?.args).toMatchObject({ take: 1_001 });
  });

  it("rejects completion source overflow even when the delegate ignores take", async () => {
    const result = measure(() => loadPrismaCompletionWorkspaceData("event-1", organizer), 1, { model: "match", limit: 1_000 });

    await expect(result).rejects.toMatchObject({ name: "ReaderResultOverflowError", limit: 1_000 });
    expect(harness.calls.find(({ model, method }) => model === "match" && method === "findMany")?.args).toMatchObject({ take: 1_001 });
  });

  it("rejects public compatibility overflow even when the delegate ignores take", async () => {
    const viewer = { id: "captain-1", email: "captain@example.test", name: "Captain", role: "captain" as const };
    const result = measure(() => readPublicV3Event("scale-cup", viewer, new Date("2026-09-21T00:00:00.000Z")), 1, { model: "team", limit: 500 });

    await expect(result).rejects.toMatchObject({ name: "ReaderResultOverflowError", limit: 500 });
    expect(harness.calls.find(({ model, method }) => model === "team" && method === "findMany")?.args).toMatchObject({ take: 501 });
  });

  it("supports exactly the configured maximum rows without overflow", async () => {
    const competition = await measure(() => readCompetitionWorkspace("event-1"), 1, { model: "match", limit: 1_000, mode: "exact" });
    expect(competition.value.matches).toHaveLength(1_000);

    const completion = await measure(() => loadPrismaCompletionWorkspaceData("event-1", organizer), 1, { model: "team", limit: 1_000, mode: "exact" });
    expect(completion.value.source.teams).toHaveLength(1_000);

    const viewer = { id: "captain-1", email: "captain@example.test", name: "Captain", role: "captain" as const };
    const publicSnapshot = await measure(() => readPublicV3Event("scale-cup", viewer, new Date("2026-09-21T00:00:00.000Z")), 1, { model: "team", limit: 500, mode: "exact" });
    expect(publicSnapshot.value?.teams).toHaveLength(500);
  });

  it("invokes the public compatibility reader with stable query count and exact collection caps", async () => {
    const viewer = { id: "captain-1", email: "captain@example.test", name: "Captain", role: "captain" as const };
    const small = await measure(() => readPublicV3Event("scale-cup", viewer, new Date("2026-09-21T00:00:00.000Z")), 1);
    const scale = await measure(() => readPublicV3Event("scale-cup", viewer, new Date("2026-09-21T00:00:00.000Z")), 64);

    expect(small.value).not.toBeNull();
    expect(scale.value).not.toBeNull();
    expect(small.calls).toHaveLength(scale.calls.length);
    expect(small.count).toBe(scale.count);
    expect(small.calls).not.toBe(scale.calls);
    expect(scale.calls).toHaveLength(7);
    for (const calls of [small.calls, scale.calls]) {
      expect(calls.find(({ model, method }) => model === "team" && method === "findMany")?.args).toMatchObject({ take: 501 });
      expect(calls.find(({ model, method }) => model === "match" && method === "findMany")?.args).toMatchObject({ take: 501 });
      expect(calls.find(({ model, method }) => model === "certificate" && method === "findMany")?.args).toMatchObject({ take: 501 });
    }
  });
});
