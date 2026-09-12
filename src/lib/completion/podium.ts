import type { TournamentFormatConfig } from "@/lib/tournament/formats/types";

export type CompletionMatchStage = "final" | "third_place" | "grand_final" | "lower_final";

export interface CompletionMatchFact {
  readonly id: string;
  readonly stage: CompletionMatchStage;
  readonly official: boolean;
  readonly winnerTeamId: string | null;
  readonly loserTeamId: string | null;
  readonly revision: number;
}

export interface CompletionStandingFact {
  readonly rank: number;
  readonly teamId: string;
  readonly locked: boolean;
  readonly unresolvedTie: boolean;
}

export type CompletionAwardStatistic = "mvp" | "top_scorer" | "top_defender" | "top_assist";

export interface CompletionDisputeFact {
  readonly id: string;
  readonly matchId?: string;
  readonly teamIds?: readonly string[];
}

export interface CompletionFacts {
  readonly formatKind: TournamentFormatConfig["kind"];
  readonly playoffFormatKind?: Extract<
    TournamentFormatConfig,
    { kind: "group_playoffs" }
  >["playoffs"]["kind"];
  readonly matches: readonly CompletionMatchFact[];
  readonly standings: readonly CompletionStandingFact[];
  readonly activeDisputes: readonly CompletionDisputeFact[];
  readonly validatedAwardStatistics: readonly CompletionAwardStatistic[];
}

export interface CompletionPodium {
  readonly championTeamId: string;
  readonly runnerUpTeamId: string;
  readonly thirdPlaceTeamId: string;
}

export type CompletionBlocker =
  | {
      readonly code: "UNOFFICIAL_REQUIRED_RESULT";
      readonly matchId: string;
      readonly stage: CompletionMatchStage;
    }
  | {
      readonly code: "ACTIVE_DISPUTE";
      readonly disputeId: string;
      readonly matchId?: string;
      readonly teamIds?: readonly string[];
    }
  | {
      readonly code: "UNRESOLVED_FINAL_TIE";
      readonly teamIds: readonly string[];
    }
  | {
      readonly code: "MISSING_VALIDATED_AWARD_STATISTICS";
      readonly award: CompletionAwardStatistic;
    }
  | {
      readonly code: "INSUFFICIENT_PODIUM_STRUCTURE";
      readonly missingStages?: readonly CompletionMatchStage[];
      readonly matchIds?: readonly string[];
      readonly teamIds?: readonly string[];
    };

export interface PodiumDerivationResult {
  readonly podium: CompletionPodium | null;
  readonly blockers: readonly CompletionBlocker[];
}

type EliminationKind = "single_elimination" | "double_elimination";

const REQUIRED_STAGES: Record<EliminationKind, readonly CompletionMatchStage[]> = {
  single_elimination: ["final", "third_place"],
  double_elimination: ["grand_final", "lower_final"],
};

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareStrings);
}

function latestMatchForStage(
  matches: readonly CompletionMatchFact[],
  stage: CompletionMatchStage,
): CompletionMatchFact | undefined {
  return matches.reduce<CompletionMatchFact | undefined>((latest, match) => {
    if (match.stage !== stage) return latest;
    if (!latest || match.revision > latest.revision) return match;
    if (match.revision === latest.revision && compareStrings(match.id, latest.id) > 0) return match;
    return latest;
  }, undefined);
}

function incompleteStructure(
  details: {
    missingStages?: readonly CompletionMatchStage[];
    matchIds?: readonly string[];
    teamIds?: readonly string[];
  } = {},
): Extract<CompletionBlocker, { code: "INSUFFICIENT_PODIUM_STRUCTURE" }> {
  return {
    code: "INSUFFICIENT_PODIUM_STRUCTURE",
    ...(details.missingStages?.length ? { missingStages: [...details.missingStages] } : {}),
    ...(details.matchIds?.length ? { matchIds: uniqueSorted(details.matchIds) } : {}),
    ...(details.teamIds?.length ? { teamIds: uniqueSorted(details.teamIds) } : {}),
  };
}

function deriveEliminationPodium(
  input: CompletionFacts,
  kind: EliminationKind,
): PodiumDerivationResult {
  const stages = REQUIRED_STAGES[kind];
  const latestMatches = stages.map((stage) => latestMatchForStage(input.matches, stage));
  const missingStages = stages.filter((_, index) => !latestMatches[index]);
  const blockers: CompletionBlocker[] = [];

  for (const match of latestMatches) {
    if (match && !match.official) {
      blockers.push({ code: "UNOFFICIAL_REQUIRED_RESULT", matchId: match.id, stage: match.stage });
    }
  }

  if (missingStages.length > 0) blockers.push(incompleteStructure({ missingStages }));
  if (latestMatches.some((match) => !match)) return { podium: null, blockers };

  const [titleMatch, thirdPlaceSource] = latestMatches as [CompletionMatchFact, CompletionMatchFact];
  const incompleteMatches = [titleMatch, thirdPlaceSource].filter(
    (match) => !match.winnerTeamId || !match.loserTeamId || match.winnerTeamId === match.loserTeamId,
  );
  if (incompleteMatches.length > 0) {
    blockers.push(incompleteStructure({ matchIds: incompleteMatches.map(({ id }) => id) }));
    return { podium: null, blockers };
  }

  if (
    kind === "double_elimination"
    && thirdPlaceSource.winnerTeamId !== titleMatch.winnerTeamId
    && thirdPlaceSource.winnerTeamId !== titleMatch.loserTeamId
  ) {
    blockers.push(incompleteStructure({
      matchIds: [titleMatch.id, thirdPlaceSource.id],
      teamIds: [titleMatch.loserTeamId!, thirdPlaceSource.winnerTeamId!],
    }));
    return { podium: null, blockers };
  }

  const podium: CompletionPodium = {
    championTeamId: titleMatch.winnerTeamId!,
    runnerUpTeamId: titleMatch.loserTeamId!,
    thirdPlaceTeamId: kind === "single_elimination"
      ? thirdPlaceSource.winnerTeamId!
      : thirdPlaceSource.loserTeamId!,
  };
  const podiumTeamIds = [podium.championTeamId, podium.runnerUpTeamId, podium.thirdPlaceTeamId];
  if (new Set(podiumTeamIds).size !== 3) {
    blockers.push(incompleteStructure({
      matchIds: [titleMatch.id, thirdPlaceSource.id],
      teamIds: podiumTeamIds,
    }));
  }

  return { podium: blockers.length === 0 ? podium : null, blockers };
}

function deriveRoundRobinPodium(input: CompletionFacts): PodiumDerivationResult {
  const tiedFinalRows = input.standings.filter(({ rank, unresolvedTie }) => rank <= 3 && unresolvedTie);
  if (tiedFinalRows.length > 0) {
    return {
      podium: null,
      blockers: [{
        code: "UNRESOLVED_FINAL_TIE",
        teamIds: uniqueSorted(tiedFinalRows.map(({ teamId }) => teamId)),
      }],
    };
  }

  const finalRows = [1, 2, 3].map((rank) => input.standings.filter((standing) => standing.rank === rank));
  if (finalRows.some((rows) => rows.length !== 1)) {
    return { podium: null, blockers: [incompleteStructure()] };
  }

  const [champion, runnerUp, thirdPlace] = finalRows.map(([standing]) => standing);
  const unlockedTeamIds = [champion, runnerUp, thirdPlace]
    .filter(({ locked }) => !locked)
    .map(({ teamId }) => teamId);
  if (unlockedTeamIds.length > 0) {
    return { podium: null, blockers: [incompleteStructure({ teamIds: unlockedTeamIds })] };
  }

  const teamIds = [champion.teamId, runnerUp.teamId, thirdPlace.teamId];
  if (new Set(teamIds).size !== 3) {
    return { podium: null, blockers: [incompleteStructure({ teamIds })] };
  }

  return {
    podium: {
      championTeamId: champion.teamId,
      runnerUpTeamId: runnerUp.teamId,
      thirdPlaceTeamId: thirdPlace.teamId,
    },
    blockers: [],
  };
}

export function derivePodium(input: CompletionFacts): PodiumDerivationResult {
  if (input.formatKind === "round_robin") return deriveRoundRobinPodium(input);
  if (input.formatKind === "single_elimination" || input.formatKind === "double_elimination") {
    return deriveEliminationPodium(input, input.formatKind);
  }
  if (input.playoffFormatKind) return deriveEliminationPodium(input, input.playoffFormatKind);
  return { podium: null, blockers: [incompleteStructure()] };
}
