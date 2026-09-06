import { z } from "zod";

const versionSchema = z.literal(1);
const bestOfSchema = z.number().int().positive().refine((value) => value % 2 === 1, {
  message: "Best-of must be a positive odd number",
});

const singleEliminationSchema = z.object({
  version: versionSchema,
  kind: z.literal("single_elimination"),
  bestOf: z.object({
    earlyRounds: bestOfSchema,
    semifinals: bestOfSchema,
    thirdPlace: bestOfSchema,
    final: bestOfSchema,
  }).strict(),
  thirdPlace: z.literal("required"),
}).strict();

const doubleEliminationSchema = z.object({
  version: versionSchema,
  kind: z.literal("double_elimination"),
  bestOf: z.object({
    earlyRounds: bestOfSchema,
    upperFinal: bestOfSchema,
    lowerFinal: bestOfSchema,
    grandFinal: bestOfSchema,
  }).strict(),
  thirdPlace: z.literal("lower_final_loser"),
}).strict();

export const standingsTiebreakerSchema = z.enum([
  "head_to_head",
  "score_difference",
  "score_for",
  "wins",
  "tiebreak_match",
]);

const pointsSchema = z.object({
  win: z.number().int().nonnegative(),
  draw: z.number().int().nonnegative(),
  loss: z.number().int().nonnegative(),
}).strict().refine(({ win, draw, loss }) => win > draw && draw >= loss, {
  message: "Points must reward a win more than a draw, and a draw at least as much as a loss",
});

const tiebreakersSchema = z.array(standingsTiebreakerSchema).min(1).superRefine((values, context) => {
  if (new Set(values).size !== values.length) {
    context.addIssue({ code: "custom", message: "Tiebreakers must be unique and ordered" });
  }
});

const roundRobinRulesSchema = z.object({
  legs: z.union([z.literal(1), z.literal(2)]),
  points: pointsSchema,
  tiebreakers: tiebreakersSchema,
}).strict();

const roundRobinSchema = roundRobinRulesSchema.extend({
  version: versionSchema,
  kind: z.literal("round_robin"),
}).strict();

const playoffSchema = z.discriminatedUnion("kind", [
  singleEliminationSchema.extend({ avoidImmediateGroupRematches: z.boolean() }).strict(),
  doubleEliminationSchema.extend({ avoidImmediateGroupRematches: z.boolean() }).strict(),
]);

const groupPlayoffsSchema = z.object({
  version: versionSchema,
  kind: z.literal("group_playoffs"),
  groupCount: z.number().int().min(2).max(16),
  qualifiersPerGroup: z.number().int().min(1).max(8),
  groupStage: roundRobinRulesSchema,
  playoffs: playoffSchema,
}).strict().refine(({ groupCount, qualifiersPerGroup }) => {
  const qualifierCount = groupCount * qualifiersPerGroup;
  return qualifierCount >= 4 && (qualifierCount & (qualifierCount - 1)) === 0;
}, {
  message: "Group qualification must produce a power-of-two playoff field of at least four teams",
  path: ["qualifiersPerGroup"],
});

export const tournamentFormatConfigSchema = z.discriminatedUnion("kind", [
  singleEliminationSchema,
  doubleEliminationSchema,
  roundRobinSchema,
  groupPlayoffsSchema,
]);

export type TournamentFormatConfig = z.infer<typeof tournamentFormatConfigSchema>;
export type StandingsTiebreaker = z.infer<typeof standingsTiebreakerSchema>;

const presetInput = {
  singleElimination: {
    version: 1,
    kind: "single_elimination",
    bestOf: { earlyRounds: 1, semifinals: 3, thirdPlace: 1, final: 5 },
    thirdPlace: "required",
  },
  doubleElimination: {
    version: 1,
    kind: "double_elimination",
    bestOf: { earlyRounds: 1, upperFinal: 3, lowerFinal: 3, grandFinal: 5 },
    thirdPlace: "lower_final_loser",
  },
  roundRobin: {
    version: 1,
    kind: "round_robin",
    legs: 1,
    points: { win: 3, draw: 1, loss: 0 },
    tiebreakers: ["head_to_head", "score_difference", "score_for", "wins", "tiebreak_match"],
  },
  groupPlayoffs: {
    version: 1,
    kind: "group_playoffs",
    groupCount: 4,
    qualifiersPerGroup: 2,
    groupStage: {
      legs: 1,
      points: { win: 3, draw: 1, loss: 0 },
      tiebreakers: ["head_to_head", "score_difference", "score_for", "wins"],
    },
    playoffs: {
      version: 1,
      kind: "single_elimination",
      bestOf: { earlyRounds: 1, semifinals: 3, thirdPlace: 1, final: 5 },
      thirdPlace: "required",
      avoidImmediateGroupRematches: true,
    },
  },
} as const;

export const TOURNAMENT_FORMAT_PRESETS = {
  singleElimination: tournamentFormatConfigSchema.parse(presetInput.singleElimination),
  doubleElimination: tournamentFormatConfigSchema.parse(presetInput.doubleElimination),
  roundRobin: tournamentFormatConfigSchema.parse(presetInput.roundRobin),
  groupPlayoffs: tournamentFormatConfigSchema.parse(presetInput.groupPlayoffs),
} satisfies Record<string, TournamentFormatConfig>;

export function parseTournamentFormatConfig(input: unknown): TournamentFormatConfig {
  return tournamentFormatConfigSchema.parse(input);
}

export type LegacyTournamentFormat = "Single Elimination" | "League";

export const LEGACY_FORMAT_BY_V3_KIND = {
  single_elimination: "Single Elimination",
  double_elimination: "Single Elimination",
  round_robin: "League",
  group_playoffs: "League",
} as const satisfies Record<TournamentFormatConfig["kind"], LegacyTournamentFormat>;

export function upgradeLegacyTournamentFormat(format: LegacyTournamentFormat): TournamentFormatConfig {
  return parseTournamentFormatConfig(
    format === "Single Elimination"
      ? TOURNAMENT_FORMAT_PRESETS.singleElimination
      : TOURNAMENT_FORMAT_PRESETS.roundRobin,
  );
}

export function getLegacyTournamentFormat(config: TournamentFormatConfig): LegacyTournamentFormat {
  return LEGACY_FORMAT_BY_V3_KIND[config.kind];
}