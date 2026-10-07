import type { CompletionAwardStatistic } from "./readiness";

/** One aggregate per award/player. The Match Day adapter resolves result revisions. */
export interface CompletionStatistic {
  readonly award: CompletionAwardStatistic;
  readonly playerId: string;
  readonly playerName: string;
  readonly teamId: string;
  readonly teamName: string;
  readonly value: number;
  readonly validated: boolean;
  readonly status: "draft" | "published";
}

export interface AwardCandidate {
  readonly playerId: string;
  readonly playerName: string;
  readonly teamId: string;
  readonly teamName: string;
  readonly value: number;
}

export type AwardCandidates = Record<CompletionAwardStatistic, readonly AwardCandidate[]>;

export function deriveAwardCandidates(stats: readonly CompletionStatistic[]): AwardCandidates {
  const result: AwardCandidates = { mvp: [], top_scorer: [], top_defender: [], top_assist: [] };
  for (const award of Object.keys(result) as CompletionAwardStatistic[]) {
    const eligible = stats.filter((row) => row.award === award && row.status === "published"
      && row.validated && Number.isFinite(row.value) && row.value >= 0);
    const highest = eligible.reduce((max, row) => Math.max(max, row.value), -1);
    result[award] = eligible.filter((row) => row.value === highest)
      .sort((left, right) => left.playerId < right.playerId ? -1 : left.playerId > right.playerId ? 1 : 0)
      .map(({ playerId, playerName, teamId, teamName, value }) => ({ playerId, playerName, teamId, teamName, value }));
  }
  return result;
}
