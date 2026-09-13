import { describe, expect, it } from "vitest";

import type { CompletionSource } from "./complete";
import { loadCompletionWorkspace, type CompletionWorkspaceDependencies } from "./workspace";

const awards = ["mvp", "top_scorer", "top_defender", "top_assist"] as const;
const source: CompletionSource = {
  facts: {
    formatKind: "single_elimination",
    matches: [
      { id: "final", stage: "final", official: true, winnerTeamId: "a", loserTeamId: "b", revision: 2 },
      { id: "third", stage: "third_place", official: true, winnerTeamId: "c", loserTeamId: "d", revision: 1 },
    ],
    standings: [],
    activeDisputes: [],
    validatedAwardStatistics: [...awards],
  },
  teams: [{ id: "a", name: "Alpha" }, { id: "b", name: "Beta" }, { id: "c", name: "Gamma" }],
  statistics: [
    ...awards.map((award) => ({ award, playerId: "p1", playerName: "Ari", teamId: "a", teamName: "Alpha", value: 9, validated: true as const, status: "published" as const })),
    { award: "mvp", playerId: "p2", playerName: "Bima", teamId: "b", teamName: "Beta", value: 9, validated: true, status: "published" },
  ],
};
const event = {
  id: "event-1",
  name: "Miracle Open",
  slug: "miracle-open",
  formatConfig: {
    version: 1 as const,
    kind: "single_elimination" as const,
    bestOf: { earlyRounds: 1, semifinals: 3, thirdPlace: 1, final: 5 },
    thirdPlace: "required" as const,
  },
};
const available = (overrides: Record<string, unknown> = {}) => ({
  version: 4,
  source,
  completion: null,
  certificates: [],
  publication: null,
  audit: [],
  ...overrides,
});
const dependencies = (result: ReturnType<typeof available>): CompletionWorkspaceDependencies => ({
  load: async () => result as never,
});

describe("completion workspace read model", () => {
  it.each([
    ["en", "Single Elimination", "Official playoff results"],
    ["id", "Eliminasi Tunggal", "Hasil playoff resmi"],
  ] as const)("renders an authoritative localized ready state for %s", async (locale, formatLabel, sourceLabel) => {
    const state = await loadCompletionWorkspace(event, locale, dependencies(available()));
    expect(state).toMatchObject({
      status: "ready",
      event: {
        id: "event-1",
        name: "Miracle Open",
        formatLabel,
        matchDayHref: `/${locale}/organizer/events/event-1/competition`,
      },
      version: 4,
      blockers: [],
      podium: {
        sourceKind: "official_playoff",
        sourceLabel,
        locked: false,
        placements: [
          { rank: 1, teamId: "a", teamName: "Alpha" },
          { rank: 2, teamId: "b", teamName: "Beta" },
          { rank: 3, teamId: "c", teamName: "Gamma" },
        ],
      },
      certificates: { generated: 0, total: 7, status: "not_generated", studioHref: `/${locale}/organizer/events/event-1/certificates` },
      publication: { status: "draft", previewHref: `/${locale}/organizer/events/event-1/certificates` },
      audit: { lastAction: "none", actorLabel: null, at: null },
    });
    expect(state.status === "integration_required" ? [] : state.awards).toMatchObject([
      { award: "mvp", metricLabel: locale === "id" ? "Nilai MVP" : "MVP score", tied: true, selectedPlayerId: null },
      { award: "top_scorer", tied: false },
      { award: "top_defender", tied: false },
      { award: "top_assist", tied: false },
    ]);
  });

  it("surfaces deterministic repair links for unofficial results, disputes, ties, and missing statistics", async () => {
    const blockedSource: CompletionSource = {
      ...source,
      facts: {
        ...source.facts,
        matches: source.facts.matches.map((match) => match.id === "final" ? { ...match, official: false } : match),
        activeDisputes: [{ id: "incident-1", matchId: "final" }],
        validatedAwardStatistics: ["mvp"],
      },
      statistics: source.statistics.filter(({ award }) => award === "mvp"),
    };
    const state = await loadCompletionWorkspace(event, "id", dependencies(available({ source: blockedSource })));
    expect(state.status).toBe("blocked");
    expect(state.status === "integration_required" ? [] : state.blockers).toEqual([
      { code: "UNOFFICIAL_REQUIRED_RESULT", subject: "final · final", repairHref: "/id/organizer/events/event-1/matches/final" },
      { code: "ACTIVE_DISPUTE", subject: "incident-1 · final", repairHref: "/id/organizer/events/event-1/matches/final" },
      { code: "MISSING_VALIDATED_AWARD_STATISTICS", subject: "Top Scorer", repairHref: "/id/organizer/events/event-1/legacy-match-day" },
      { code: "MISSING_VALIDATED_AWARD_STATISTICS", subject: "Top Defender", repairHref: "/id/organizer/events/event-1/legacy-match-day" },
      { code: "MISSING_VALIDATED_AWARD_STATISTICS", subject: "Top Assist", repairHref: "/id/organizer/events/event-1/legacy-match-day" },
    ]);
  });

  it("uses persisted locked decisions, completion version, certificate staleness, publication and audit history", async () => {
    const completion = {
      id: "completion-1",
      status: "completed",
      sourceSnapshot: { eventId: "event-1", version: 3 },
      podiumPlacements: [
        { rank: 1, teamId: "a", teamName: "Alpha" },
        { rank: 2, teamId: "b", teamName: "Beta" },
        { rank: 3, teamId: "c", teamName: "Gamma" },
      ],
      awards: awards.map((type) => ({
        type,
        candidateSnapshot: type === "mvp"
          ? [
              { playerId: "p1", playerName: "Ari locked", teamId: "a", teamName: "Alpha", value: 9 },
              { playerId: "p2", playerName: "Bima locked", teamId: "b", teamName: "Beta", value: 9 },
            ]
          : [{ playerId: "p1", playerName: "Ari locked", teamId: "a", teamName: "Alpha", value: 9 }],
        decision: { recipientId: "p1", reason: type === "mvp" ? "Tie resolved on finals impact" : null },
      })),
    };
    const certificates = awards.concat(["champion", "runner_up", "third_place"] as never).map((type, index) => ({
      id: `certificate-${index}`, type, version: 1, completionId: "completion-1", completionVersion: 3, status: "published", publishedAt: new Date("2026-09-13T01:00:00Z"),
    }));
    const state = await loadCompletionWorkspace(event, "en", dependencies(available({
      version: 4,
      completion,
      certificates,
      publication: { version: 1, completionVersion: 3, certificateIds: certificates.map(({ id }) => id), publishedAt: new Date("2026-09-13T01:00:00Z") },
      audit: [
        { action: "completed", actorLabel: "Organizer One", createdAt: new Date("2026-09-13T01:00:00Z"), details: { actorRole: "organizer", result: { status: "completed", version: 3 } } },
        { action: "reopened", actorLabel: "Admin", createdAt: new Date("2026-09-12T23:00:00Z"), details: { actorRole: "admin", result: { status: "reopened", version: 2 } } },
      ],
    })));
    expect(state).toMatchObject({
      status: "completed",
      version: 4,
      podium: { locked: true },
      certificates: { generated: 7, total: 7, status: "ready" },
      publication: { status: "published" },
      audit: {
        lastAction: "completed",
        actorLabel: "Organizer One",
        at: "2026-09-13T01:00:00.000Z",
        history: [
          { action: "completed", actorLabel: "Organizer One", at: "2026-09-13T01:00:00.000Z", summary: "Tournament completed · version 3." },
          { action: "reopened", actorLabel: "Admin", at: "2026-09-12T23:00:00.000Z", summary: "Tournament reopened · version 2." },
        ],
      },
    });
    expect(state.status === "integration_required" ? [] : state.awards[0]).toMatchObject({
      selectedPlayerId: "p1",
      decisionReason: "Tie resolved on finals impact",
      tied: true,
      candidates: [
        { playerId: "p1", playerName: "Ari locked", teamName: "Alpha", valueLabel: "9" },
        { playerId: "p2", playerName: "Bima locked", teamName: "Beta", valueLabel: "9" },
      ],
    });
  });

  it("marks a publication for review when a newer eligible certificate version exists", async () => {
    const baseCertificates = awards.concat(["champion", "runner_up", "third_place"] as never).map((type, index) => ({
      id: `certificate-${index}`,
      type,
      version: 1,
      completionId: "completion-1",
      completionVersion: 3,
      status: "published",
      publishedAt: new Date("2026-09-13T01:00:00Z"),
    }));
    const state = await loadCompletionWorkspace(event, "en", dependencies(available({
      completion: {
        id: "completion-1",
        status: "completed",
        sourceSnapshot: { version: 3 },
        podiumPlacements: [],
        awards: [],
      },
      certificates: [...baseCertificates, {
        id: "certificate-champion-v2",
        type: "champion",
        version: 2,
        completionId: "completion-1",
        completionVersion: 3,
        status: "ready",
        publishedAt: null,
      }],
      publication: {
        version: 1,
        completionVersion: 3,
        certificateIds: baseCertificates.map(({ id }) => id),
        publishedAt: new Date("2026-09-13T01:00:00Z"),
      },
    })));
    expect(state.status === "integration_required" ? null : state.publication.status).toBe("needs_review");
  });

  it("marks the prior certificate set stale and unpublished while completion is reopened", async () => {
    const certificates = awards.concat(["champion", "runner_up", "third_place"] as never).map((type, index) => ({
      id: `certificate-${index}`, type, version: 1, completionId: "completion-1", completionVersion: 3,
      status: "published", publishedAt: new Date("2026-09-13T01:00:00Z"),
    }));
    const state = await loadCompletionWorkspace(event, "en", dependencies(available({
      version: 4,
      completion: { id: "completion-1", status: "reopened", sourceSnapshot: { version: 3 }, podiumPlacements: [], awards: [] },
      certificates,
      publication: { version: 1, completionVersion: 3, certificateIds: certificates.map(({ id }) => id), publishedAt: new Date("2026-09-13T01:00:00Z") },
    })));
    expect(state).toMatchObject({
      status: "reopened",
      certificates: { generated: 0, total: 7, status: "stale" },
      publication: { status: "needs_review" },
    });
  });

  it("prioritizes stale over an in-progress generation from a reopened completion", async () => {
    const state = await loadCompletionWorkspace(event, "en", dependencies(available({
      completion: {
        id: "completion-1",
        status: "reopened",
        sourceSnapshot: { version: 3 },
        podiumPlacements: [],
        awards: [],
      },
      certificates: [{
        id: "certificate-generating",
        type: "champion",
        version: 2,
        completionId: "completion-1",
        completionVersion: 3,
        status: "generating",
        publishedAt: null,
      }],
    })));
    expect(state.status === "integration_required" ? null : state.certificates).toMatchObject({
      generated: 0,
      status: "stale",
    });
  });

  it("returns a deterministic integration state without loading when format configuration is missing", async () => {
    const load = async () => { throw new Error("must not load invalid completion source"); };
    const state = await loadCompletionWorkspace({ ...event, formatConfig: null }, "id", { load });
    expect(state).toMatchObject({
      status: "integration_required",
      event: { formatLabel: "Belum dikonfigurasi" },
      version: null,
      blockers: null,
    });
  });
});
