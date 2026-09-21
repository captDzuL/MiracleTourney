import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";

import { validateE2eDatabaseConfiguration } from "../../../scripts/e2e-db-configuration.mjs";
import {
  publishCertificateSet,
  regenerateCertificate,
  type CertificateStudioDependencies,
} from "../../../src/lib/certificate/service";
import {
  CERTIFICATE_STUDIO_TRANSACTION_OPTIONS,
  createCertificateStudioTransaction,
} from "../../../src/lib/certificate/studio-repository";
import { completeTournament } from "../../../src/lib/completion/complete";
import { createPrismaCompletionDependencies } from "../../../src/lib/completion/prisma-adapter";
import { MIRACLE_V3_CERTIFICATE_TYPES } from "../../../src/lib/certificate/templates/miracle-v3-contract";
import { generateCompetitionGraph, type CompetitionGraph } from "../../../src/lib/tournament/competition";
import type { TournamentFormatConfig } from "../../../src/lib/tournament/formats/types";
import { competitionProjection } from "../../../src/lib/tournament/operations/result-projection";

export const completionDb = new PrismaClient();
export type CompletionFixtureKind = "single_elimination" | "double_elimination" | "round_robin" | "group_playoffs";
export type CompletionFixture = Awaited<ReturnType<typeof prepareCompletionFixture>> & {
  historicalVerificationCode?: string;
  currentVerificationCode?: string;
};
export type CertificateFixture = Awaited<ReturnType<typeof prepareCertificateFixture>>;

const configs: Record<CompletionFixtureKind, TournamentFormatConfig> = {
  single_elimination: {
    version: 1,
    kind: "single_elimination",
    thirdPlace: "required",
    bestOf: { earlyRounds: 1, semifinals: 1, thirdPlace: 1, final: 1 },
  },
  double_elimination: {
    version: 1,
    kind: "double_elimination",
    thirdPlace: "lower_final_loser",
    bestOf: { earlyRounds: 1, upperFinal: 1, lowerFinal: 1, grandFinal: 1 },
  },
  round_robin: {
    version: 1,
    kind: "round_robin",
    legs: 1,
    points: { win: 3, draw: 1, loss: 0 },
    tiebreakers: ["score_difference", "wins"],
  },
  group_playoffs: {
    version: 1,
    kind: "group_playoffs",
    groupCount: 2,
    qualifiersPerGroup: 2,
    groupStage: { legs: 1, points: { win: 3, draw: 1, loss: 0 }, tiebreakers: ["score_difference", "wins"] },
    playoffs: {
      version: 1,
      kind: "single_elimination",
      thirdPlace: "required",
      bestOf: { earlyRounds: 1, semifinals: 1, thirdPlace: 1, final: 1 },
      avoidImmediateGroupRematches: true,
    },
  },
};

type FixtureMatch = {
  id: string;
  phaseId: string;
  groupId: string | null;
  roundLabel: string;
  round: number;
  slot: number;
  bracket: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  winnerTeamId: string | null;
};

export function fixtureGraph(
  eventId: string,
  phaseId: string,
  kind: CompletionFixtureKind,
  teamIds: readonly string[],
): { graph: CompetitionGraph; matches: FixtureMatch[] } {
  if (kind === "group_playoffs") {
    const config = configs.group_playoffs as Extract<TournamentFormatConfig, { kind: "group_playoffs" }>;
    const graph = generateCompetitionGraph({
      eventId,
      config,
      teams: teamIds.map((id, index) => ({ id, seed: index + 1 })),
    });
    const projectedMatches: FixtureMatch[] = [];
    const rounds = new Map<string, number>();
    for (const [index, match] of graph.matches.entries()) {
      const projection = competitionProjection(graph, projectedMatches.map((row) => ({
        ...row,
        eventId,
        status: "Completed",
        scheduleStatus: "completed",
        resultVersion: 1,
      })) as never);
      const homeTeamId = projection.resolve(match.home);
      const awayTeamId = projection.resolve(match.away);
      if (!homeTeamId || !awayTeamId) throw new Error(`Unable to resolve generated fixture match ${match.id}`);
      const roundKey = `${match.phaseId}:${match.bracket}:${match.round}:${match.leg}`;
      if (!rounds.has(roundKey)) rounds.set(roundKey, rounds.size + 1);
      projectedMatches.push({
        id: match.id,
        phaseId: match.phaseId,
        groupId: match.groupId,
        roundLabel: match.bracket === "round_robin"
          ? `Group ${graph.groups.find(({ id }) => id === match.groupId)?.label ?? ""} Round ${match.round}`
          : match.bracket === "third_place"
            ? "Third Place"
            : graph.placements.some(({ rank, source }) => rank === 1 && source.kind === "match" && source.matchId === match.id)
              ? "Final"
              : "Semifinal",
        round: rounds.get(roundKey)!,
        slot: index + 1,
        bracket: match.bracket,
        homeTeamId,
        awayTeamId,
        homeScore: 2,
        awayScore: 0,
        winnerTeamId: homeTeamId,
      });
    }
    return { graph, matches: projectedMatches };
  }

  if (kind === "round_robin") {
    const config = configs.round_robin as Extract<TournamentFormatConfig, { kind: "round_robin" }>;
    const fixtures = [
      [teamIds[0], teamIds[1], 3, 0],
      [teamIds[0], teamIds[2], 2, 0],
      [teamIds[0], teamIds[3], 1, 0],
      [teamIds[1], teamIds[2], 2, 0],
      [teamIds[1], teamIds[3], 1, 0],
      [teamIds[2], teamIds[3], 1, 0],
    ] as const;
    const matches = fixtures.map(([homeTeamId, awayTeamId, homeScore, awayScore], index) => ({
      id: `${eventId}-league-${index + 1}`,
      phaseId,
      groupId: null,
      roundLabel: `Round ${index + 1}`,
      round: index + 1,
      slot: 1,
      bracket: "round_robin",
      homeTeamId,
      awayTeamId,
      homeScore,
      awayScore,
      winnerTeamId: homeTeamId,
    }));
    return {
      graph: {
        eventId,
        config,
        phases: [{
          id: phaseId,
          sequence: 1,
          kind: "round_robin",
          standingsRules: { legs: 1, points: config.points, tiebreakers: config.tiebreakers },
        }],
        groups: [],
        dependencies: [],
        qualificationDependencies: [],
        placements: [],
        matches: matches.map((match) => ({
          id: match.id,
          phaseId,
          groupId: null,
          bracket: "round_robin",
          round: match.round,
          slot: match.slot,
          leg: 1,
          bestOf: 1,
          home: { kind: "team", teamId: match.homeTeamId, seed: 1 },
          away: { kind: "team", teamId: match.awayTeamId, seed: 2 },
          status: "pending",
          advance: null,
        })),
      } as CompetitionGraph,
      matches,
    };
  }

  const config = configs[kind];
  const double = kind === "double_elimination";
  const titleId = `${eventId}-${double ? "grand-final" : "final"}`;
  const thirdId = `${eventId}-${double ? "lower-final" : "third-place"}`;
  const matches: FixtureMatch[] = [
    {
      id: titleId,
      phaseId,
      groupId: null,
      roundLabel: double ? "Grand Final" : "Final",
      round: 1,
      slot: 1,
      bracket: double ? "grand_final" : "single",
      homeTeamId: teamIds[0],
      awayTeamId: teamIds[1],
      homeScore: 2,
      awayScore: 0,
      winnerTeamId: teamIds[0],
    },
    {
      id: thirdId,
      phaseId,
      groupId: null,
      roundLabel: double ? "Lower Final" : "Third Place",
      round: 2,
      slot: 1,
      bracket: double ? "lower" : "third_place",
      homeTeamId: double ? teamIds[1] : teamIds[2],
      awayTeamId: teamIds[3],
      homeScore: 2,
      awayScore: 0,
      winnerTeamId: double ? teamIds[1] : teamIds[2],
    },
  ];
  const playoffKind = double ? "double_elimination" : "single_elimination";
  return {
    graph: {
      eventId,
      config,
      phases: [{ id: phaseId, sequence: 1, kind: playoffKind, standingsRules: null }],
      groups: [],
      dependencies: [],
      qualificationDependencies: [],
      matches: matches.map((match) => ({
        id: match.id,
        phaseId,
        groupId: null,
        bracket: match.bracket,
        round: match.round,
        slot: match.slot,
        leg: 1,
        bestOf: 1,
        home: { kind: "team", teamId: match.homeTeamId, seed: 1 },
        away: { kind: "team", teamId: match.awayTeamId, seed: 2 },
        status: "pending",
        advance: null,
      })),
      placements: [
        { rank: 1, source: { kind: "match", matchId: titleId, outcome: "winner" } },
        { rank: 2, source: { kind: "match", matchId: titleId, outcome: "loser" } },
        { rank: 3, source: { kind: "match", matchId: thirdId, outcome: double ? "loser" : "winner" } },
      ],
    } as CompetitionGraph,
    matches,
  };
}

function assertGuardedTestDatabase() {
  const safe = validateE2eDatabaseConfiguration(process.env);
  if (!safe.ok) throw new Error(safe.message);
  if (process.env.E2E_DATABASE_RESET_ALLOWED !== "true") {
    throw new Error("Blocked: Completion E2E fixtures require the guarded .env.test reset profile.");
  }
}

export async function prepareCompletionFixture(
  kind: CompletionFixtureKind = "single_elimination",
  namespace = randomUUID().slice(0, 12),
  options: { pendingFirstPlayerMatch?: boolean } = {},
) {
  assertGuardedTestDatabase();
  if (!/^[a-z0-9-]{1,48}$/.test(namespace)) throw new Error("Invalid fixture namespace");
  const id = `e2e-completion-${kind}-${namespace}`;
  const eventName = `Completion ${kind} ${namespace}`;
  const actor = await completionDb.user.findUniqueOrThrow({
    where: { email: "organizer-a@miraclefc.gg" },
    select: { id: true, role: true },
  });
  await completionDb.event.deleteMany({ where: { id, slug: id } });
  try {
    const config = configs[kind];
    const phaseId = `${id}-phase`;
    const teams = Array.from({ length: 4 }, (_, index) => ({
      id: `${id}-team-${index + 1}`,
      eventId: id,
      name: `Completion Team ${index + 1}`,
      tag: `C${index + 1}`,
      logoText: `C${index + 1}`,
      source: "e2e",
      createdAt: new Date(1700000000000 + index),
    }));
    const { graph, matches } = fixtureGraph(id, phaseId, kind, teams.map(({ id: teamId }) => teamId));
    const pendingFirstPlayerMatchId = options.pendingFirstPlayerMatch
      ? matches.find((match) => [match.homeTeamId, match.awayTeamId].includes(teams[0].id))?.id
      : undefined;
    if (options.pendingFirstPlayerMatch && !pendingFirstPlayerMatchId) {
      throw new Error("Unable to prepare a pending match for the first Completion player");
    }
    await completionDb.event.create({
      data: {
        id,
        slug: id,
        name: eventName,
        description: "Completion V3 deterministic E2E fixture",
        gameId: "game-flashpeak",
        gameModeId: "mode-flashpeak-5v5",
        organizerUserId: actor.id,
        organizerName: "Completion Organizer",
        status: "Ongoing",
        format: kind,
        formatConfig: config as Prisma.InputJsonValue,
        participantCap: 4,
        timezone: "Asia/Jakarta",
        eventStartsAt: new Date("2026-09-13T02:00:00.000Z"),
        startsAt: "2026-09-13",
        registrationWindow: "Closed",
        venue: "Completion Arena",
        publishedAt: new Date("2026-09-13T00:00:00.000Z"),
      },
    });
    await completionDb.team.createMany({ data: teams });
    for (const phase of graph.phases) {
      await completionDb.competitionPhase.create({
        data: {
          id: phase.id,
          eventId: id,
          label: phase.kind,
          sequence: phase.sequence,
          status: "completed",
          configuration: {
            ...phase,
            ...(phase.sequence === 1 ? { graph } : {}),
          } as unknown as Prisma.InputJsonValue,
        },
      });
    }
    for (const group of graph.groups) {
      await completionDb.competitionGroup.create({
        data: { id: group.id, eventId: id, phaseId: group.phaseId, label: group.label, sequence: group.sequence },
      });
      await completionDb.competitionGroupMember.createMany({
        data: group.teams.map((team) => ({ eventId: id, groupId: group.id, teamId: team.id, seed: team.seed })),
      });
    }
    for (const match of matches) {
      const isPendingFirstPlayerMatch = match.id === pendingFirstPlayerMatchId;
      await completionDb.match.create({
        data: {
          id: match.id,
          eventId: id,
          phaseId: match.phaseId,
          groupId: match.groupId,
          roundLabel: match.roundLabel,
          round: match.round,
          slot: match.slot,
          homeTeamId: match.homeTeamId,
          awayTeamId: match.awayTeamId,
          homeScore: isPendingFirstPlayerMatch ? 0 : match.homeScore,
          awayScore: isPendingFirstPlayerMatch ? 0 : match.awayScore,
          winnerTeamId: isPendingFirstPlayerMatch ? null : match.winnerTeamId,
          resultVersion: isPendingFirstPlayerMatch ? 0 : 1,
          resultSnapshot: isPendingFirstPlayerMatch
            ? Prisma.JsonNull
            : { games: [{ gameNumber: 1, homeScore: match.homeScore, awayScore: match.awayScore }] },
          status: isPendingFirstPlayerMatch ? "Scheduled" : "Completed",
          scheduleStatus: isPendingFirstPlayerMatch ? "confirmed" : "completed",
          resultConfirmedAt: isPendingFirstPlayerMatch ? null : new Date("2026-09-13T03:00:00.000Z"),
        },
      });
      if (!isPendingFirstPlayerMatch) {
        await completionDb.matchResultRevision.create({
          data: {
            id: `${match.id}-revision-1`,
            eventId: id,
            matchId: match.id,
            version: 1,
            homeScore: match.homeScore,
            awayScore: match.awayScore,
            winnerTeamId: match.winnerTeamId,
            scoreSnapshot: { games: [{ gameNumber: 1, homeScore: match.homeScore, awayScore: match.awayScore }] },
            actorUserId: actor.id,
            reason: "Completion E2E official result",
            idempotencyKey: `${match.id}-official-1`,
          },
        });
      }
    }
    const players = [
      {
        id: `${id}-player-1`,
        teamId: teams[0].id,
        eventId: id,
        displayName: "Ari Alpha",
        nickname: "Ari",
        position: "All-rounder",
      },
      {
        id: `${id}-player-2`,
        teamId: teams[1].id,
        eventId: id,
        displayName: "Bima Beta",
        nickname: "Bima",
        position: "Support",
      },
    ];
    await completionDb.player.createMany({ data: players });
    const firstPlayerMatch = matches.find((match) => [match.homeTeamId, match.awayTeamId].includes(players[0].teamId));
    const secondPlayerMatch = matches.find((match) => [match.homeTeamId, match.awayTeamId].includes(players[1].teamId));
    if (!firstPlayerMatch || !secondPlayerMatch) throw new Error("Unable to assign Completion player statistics");
    await completionDb.playerStat.createMany({
      data: [
        {
          matchId: firstPlayerMatch.id,
          playerId: players[0].id,
          playerName: "Forged display should be ignored",
          teamId: players[0].teamId,
          position: players[0].position,
          gameSlug: "flashpeak",
          stats: { goal: 10, assist: 5, defense: 8 },
          source: "admin",
          lastUpdatedBy: actor.id,
        },
        {
          matchId: secondPlayerMatch.id,
          playerId: players[1].id,
          playerName: players[1].displayName,
          teamId: players[1].teamId,
          position: players[1].position,
          gameSlug: "flashpeak",
          stats: { goal: 8, assist: 5, defense: 7 },
          source: "admin",
          lastUpdatedBy: actor.id,
        },
      ],
    });

    return {
      id,
      slug: id,
      eventName,
      kind,
      teams,
      players,
      actor,
      graph,
      cleanup: async () => {
        await completionDb.event.deleteMany({ where: { id, slug: id } });
      },
    };
  } catch (error) {
    await completionDb.event.deleteMany({ where: { id, slug: id } });
    throw error;
  }
}

export async function prepareCertificateFixture(namespace = randomUUID().slice(0, 12)) {
  const fixture = await prepareCompletionFixture("single_elimination", namespace);
  try {
    const decisions = [
      { award: "mvp" as const, playerId: fixture.players[0].id },
      { award: "top_scorer" as const, playerId: fixture.players[0].id },
      { award: "top_defender" as const, playerId: fixture.players[0].id },
      { award: "top_assist" as const, playerId: fixture.players[0].id, reason: "Equal assists; decisive final contribution." },
    ];
    const result = await completeTournament(
      fixture.id,
      decisions,
      0,
      randomUUID(),
      createPrismaCompletionDependencies({ id: fixture.actor.id, role: fixture.actor.role as "organizer" }, completionDb),
    );
    if (result.status !== "completed") throw new Error(`Unable to complete certificate fixture: ${JSON.stringify(result)}`);
    const logoAsset = await completionDb.eventVisualAsset.create({
      data: {
        eventId: fixture.id,
        createdByUserId: fixture.actor.id,
        source: "organizer_upload",
        status: "approved",
        purpose: "certificate_team_logo",
        url: `/certificate-assets/${fixture.id}-logo.png`,
        mimeType: "image/png",
        width: 512,
        height: 512,
        byteSize: 128,
        storageProvider: "local",
        storageKey: `certificate-assets/${fixture.id}-logo.png`,
        contentSha256: "a".repeat(64),
        rightsAttestedAt: new Date("2026-09-13T04:00:00.000Z"),
        approvedAt: new Date("2026-09-13T04:00:00.000Z"),
      },
    });
    const studioActor = { id: fixture.actor.id, role: fixture.actor.role as "organizer" };
    const studioDependencies: CertificateStudioDependencies = {
      transaction: (eventId, work) => completionDb.$transaction(
        (tx) => work(createCertificateStudioTransaction(tx, eventId, studioActor, {
          materializeAssetUrl: async () => "data:image/png;base64,iVBORw0KGgo=",
        })),
        CERTIFICATE_STUDIO_TRANSACTION_OPTIONS,
      ),
      generate: async (data) => {
        const imageUrl = `/certificates/${data.eventId}-${data.certificateType}-v${data.version}.png`;
        await completionDb.certificate.update({
          where: { id: data.certificateId },
          data: {
            imageUrl,
            status: "ready",
            generatedAt: new Date("2026-09-13T04:10:00.000Z"),
            attemptCount: { increment: 1 },
          },
        });
        return imageUrl;
      },
    };
    const generated = [];
    for (const type of MIRACLE_V3_CERTIFICATE_TYPES) {
      const teamType = ["champion", "runner_up", "third_place"].includes(type);
      const generatedResult = await regenerateCertificate({
        eventId: fixture.id,
        certificateType: type,
        expectedVersion: result.version,
        idempotencyKey: randomUUID(),
        assets: [{
          assetId: logoAsset.id,
          placement: teamType
            ? { assetKind: "team_logo_hero", x: 360, y: 748, width: 560, height: 540 }
            : { assetKind: "team_logo_badge", x: 80, y: 1052, width: 160, height: 160 },
        }],
      }, studioDependencies);
      if (generatedResult.status !== "generated") {
        throw new Error(`Unable to generate ${type} fixture certificate: ${JSON.stringify(generatedResult)}`);
      }
      generated.push(generatedResult);
    }
    const initialPublication = await publishCertificateSet({
      eventId: fixture.id,
      expectedVersion: result.version,
      expectedCertificateRevision: 0,
      idempotencyKey: randomUUID(),
      selection: generated.map(({ certificateType, certificateId }) => ({ certificateType, certificateId })),
    }, studioDependencies);
    if (initialPublication.status !== "published") {
      throw new Error(`Unable to publish initial certificate fixture: ${JSON.stringify(initialPublication)}`);
    }
    const historicalChampion = await completionDb.certificate.findFirstOrThrow({
      where: { eventId: fixture.id, type: "champion", version: 1 },
    });
    const regeneration = await regenerateCertificate({
      eventId: fixture.id,
      certificateType: "champion",
      expectedVersion: result.version,
      idempotencyKey: randomUUID(),
      assets: [{
        assetId: logoAsset.id,
        placement: { assetKind: "team_logo_hero", x: 360, y: 748, width: 560, height: 540 },
      }],
    }, studioDependencies);
    if (regeneration.status !== "generated") {
      throw new Error(`Unable to regenerate champion fixture certificate: ${JSON.stringify(regeneration)}`);
    }
    const currentChampion = await completionDb.certificate.findUniqueOrThrow({
      where: { id: regeneration.certificateId },
    });
    return {
      ...fixture,
      historicalVerificationCode: historicalChampion.verificationCode,
      historicalPublishedUrl: historicalChampion.publishedUrl!,
      currentVerificationCode: currentChampion.verificationCode,
      initialPublicationVersion: initialPublication.publicationVersion,
      generatedMutationCount: generated.length + 1,
      currentChampionId: currentChampion.id,
    };
  } catch (error) {
    await fixture.cleanup();
    throw error;
  }
}
