import { isDeepStrictEqual } from "node:util";
import { tournamentFormatConfigSchema } from "../formats/types";
import type { SingleEliminationConfig } from "../competition";
import type { BackfillMatch, BackfillRoundConfig } from "./legacy-backfill-types";

type Bucket = "earlyRounds" | "semifinals" | "final";
export type DerivedConfig = { config: SingleEliminationConfig | null; notes: string[]; problems: string[] };

/** Same buckets as the upgrade of unplayed events: last round, the one before it, everything earlier. */
export function bucketOfRound(round: number, totalRounds: number): Bucket {
  return round === totalRounds ? "final" : round === totalRounds - 1 ? "semifinals" : "earlyRounds";
}

function ruleProblems(roundConfigs: BackfillRoundConfig[]): string[] {
  const seen = new Set<string>();
  return roundConfigs.flatMap((rule) => {
    const duplicate = seen.has(rule.roundLabel);
    seen.add(rule.roundLabel);
    const invalid = !Number.isInteger(rule.bestOf) || rule.bestOf <= 0 || rule.bestOf % 2 === 0;
    return [
      ...duplicate ? [`round rule "${rule.roundLabel}" is listed more than once`] : [],
      ...invalid ? [`round rule "${rule.roundLabel}" has best-of ${rule.bestOf}; it must be a positive odd number`] : [],
    ];
  });
}

function valuesByBucket(matches: BackfillMatch[], totalRounds: number, ruleOf: Map<string, number>) {
  const buckets = new Map<Bucket, Map<number, string[]>>();
  for (const match of matches) {
    const bucket = bucketOfRound(match.round ?? 0, totalRounds);
    const value = ruleOf.get(match.roundLabel) ?? 1;
    const byValue = buckets.get(bucket) ?? new Map<number, string[]>();
    byValue.set(value, [...new Set([...byValue.get(value) ?? [], match.roundLabel])]);
    buckets.set(bucket, byValue);
  }
  return buckets;
}

function bucketProblems(buckets: ReturnType<typeof valuesByBucket>): string[] {
  return [...buckets].filter(([, byValue]) => byValue.size > 1).map(([bucket, byValue]) =>
    `round rules disagree inside ${bucket}: ${[...byValue].map(([value, labels]) => `BO${value} for ${labels.join(", ")}`).join("; ")}`);
}

function describeExisting(existing: unknown, derived: SingleEliminationConfig): string[] {
  const parsed = tournamentFormatConfigSchema.safeParse(existing);
  if (!parsed.success) return ["stored format config is invalid or from the old format and will be replaced"];
  if (parsed.data.kind !== "single_elimination") return [`stored format config is ${parsed.data.kind}; this backfill only handles single elimination`];
  return isDeepStrictEqual(parsed.data, derived) ? [] : ["stored format config is valid but differs from the one read from the matches and will be replaced"];
}

/**
 * Round rules come from EventRoundConfig by round label; a label without a rule is best-of-1.
 * Third place is "required" only when its match is supplied, and always best-of-1 because
 * the original score is unknown.
 */
export function deriveBackfillConfig(input: {
  matches: BackfillMatch[];
  roundConfigs: BackfillRoundConfig[];
  totalRounds: number;
  withThirdPlace: boolean;
  existingConfig: unknown;
}): DerivedConfig {
  const { matches, roundConfigs, totalRounds, withThirdPlace } = input;
  const labels = new Set(matches.map((match) => match.roundLabel));
  const usable = roundConfigs.filter((rule) => labels.has(rule.roundLabel));
  const ignored = roundConfigs.filter((rule) => !labels.has(rule.roundLabel)).map((rule) => `round rule "${rule.roundLabel}" matches no stored match and is ignored`);
  const buckets = valuesByBucket(matches, totalRounds, new Map(usable.map((rule) => [rule.roundLabel, rule.bestOf])));
  const problems = [...ruleProblems(roundConfigs), ...bucketProblems(buckets)];
  const pick = (bucket: Bucket) => [...buckets.get(bucket)?.keys() ?? []][0] ?? 1;
  if (problems.length) return { config: null, notes: ignored, problems };
  const config: SingleEliminationConfig = {
    version: 1,
    kind: "single_elimination",
    bestOf: { earlyRounds: pick("earlyRounds"), semifinals: pick("semifinals"), thirdPlace: 1, final: pick("final") },
    thirdPlace: withThirdPlace ? "required" : "none",
  };
  return { config, notes: [...ignored, ...describeExisting(input.existingConfig, config)], problems };
}
