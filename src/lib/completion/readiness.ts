import {
  derivePodium,
  type CompletionAwardStatistic,
  type CompletionBlocker,
  type CompletionFacts,
  type CompletionPodium,
} from "@/lib/completion/podium";

export type {
  CompletionAwardStatistic,
  CompletionBlocker,
  CompletionDisputeFact,
  CompletionFacts,
  CompletionMatchFact,
  CompletionMatchStage,
  CompletionPodium,
  CompletionStandingFact,
  PodiumDerivationResult,
} from "@/lib/completion/podium";

export interface CompletionReadiness {
  readonly ready: boolean;
  readonly podium: CompletionPodium | null;
  readonly blockers: readonly CompletionBlocker[];
}

const REQUIRED_AWARD_STATISTICS: readonly CompletionAwardStatistic[] = [
  "mvp",
  "top_scorer",
  "top_defender",
  "top_assist",
];

const BLOCKER_PRIORITY: Record<CompletionBlocker["code"], number> = {
  UNOFFICIAL_REQUIRED_RESULT: 0,
  ACTIVE_DISPUTE: 1,
  UNRESOLVED_FINAL_TIE: 2,
  MISSING_VALIDATED_AWARD_STATISTICS: 3,
  INSUFFICIENT_PODIUM_STRUCTURE: 4,
};

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function blockerKey(blocker: CompletionBlocker): string {
  switch (blocker.code) {
    case "UNOFFICIAL_REQUIRED_RESULT":
      return `${blocker.stage}:${blocker.matchId}`;
    case "ACTIVE_DISPUTE":
      return blocker.disputeId;
    case "UNRESOLVED_FINAL_TIE":
      return blocker.teamIds.join(":");
    case "MISSING_VALIDATED_AWARD_STATISTICS":
      return String(REQUIRED_AWARD_STATISTICS.indexOf(blocker.award));
    case "INSUFFICIENT_PODIUM_STRUCTURE":
      return [
        ...(blocker.missingStages ?? []),
        ...(blocker.matchIds ?? []),
        ...(blocker.teamIds ?? []),
      ].join(":");
  }
}

export function evaluateCompletionReadiness(input: CompletionFacts): CompletionReadiness {
  const podiumResult = derivePodium(input);
  const blockers: CompletionBlocker[] = [...podiumResult.blockers];

  for (const dispute of [...input.activeDisputes].sort((left, right) => compareStrings(left.id, right.id))) {
    blockers.push({
      code: "ACTIVE_DISPUTE",
      disputeId: dispute.id,
      ...(dispute.matchId ? { matchId: dispute.matchId } : {}),
      ...(dispute.teamIds?.length
        ? { teamIds: [...new Set(dispute.teamIds)].sort(compareStrings) }
        : {}),
    });
  }

  const validatedAwards = new Set(input.validatedAwardStatistics);
  for (const award of REQUIRED_AWARD_STATISTICS) {
    if (!validatedAwards.has(award)) {
      blockers.push({ code: "MISSING_VALIDATED_AWARD_STATISTICS", award });
    }
  }

  blockers.sort((left, right) => {
    const priority = BLOCKER_PRIORITY[left.code] - BLOCKER_PRIORITY[right.code];
    return priority || compareStrings(blockerKey(left), blockerKey(right));
  });

  return {
    ready: podiumResult.podium !== null && blockers.length === 0,
    podium: podiumResult.podium,
    blockers,
  };
}
