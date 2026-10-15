import type { MiracleV3CertificateType } from "./miracle-v3-contract";

/** Fixed English copy of the "Championship Editorial" certificate, one entry per certificate type. */
export interface MiracleV3EditorialCopy {
  readonly eyebrow: string;
  readonly megaLines: readonly [string, string];
  readonly motto: string;
  readonly rank: string;
  readonly rankLabel: string;
  readonly recipientLabel: string;
}

const copy = (
  eyebrow: string, mega: string, motto: string, rank: string, rankLabel: string, recipientLabel: string,
): MiracleV3EditorialCopy => {
  const [first, second] = mega.split("|");
  return Object.freeze({ eyebrow, megaLines: Object.freeze([first, second]) as readonly [string, string], motto, rank, rankLabel, recipientLabel });
};

/**
 * Podium and MVP copy is the approved mockup copy. The scorer, defender and assist mottos and ranks of the
 * mockup were sample statistics ("42 eliminations"); the certificate data carries no statistics, so those
 * three use statistic-free wording instead of printing a number nobody measured.
 */
const EDITORIAL_COPY: Readonly<Record<MiracleV3CertificateType, MiracleV3EditorialCopy>> = Object.freeze({
  champion: copy("Championship series · First place", "WE ARE|CHAMPIONS", "Velocity · Pressure · Legacy", "#1", "Final standing", "Grand Champion"),
  runner_up: copy("Championship series · Second place", "RELENTLESS|RUNNER-UP", "Precision · Courage · Respect", "#2", "Final standing", "Second Place"),
  third_place: copy("Championship series · Third place", "RISE AS|THIRD PLACE", "Resilience · Focus · Fire", "#3", "Final standing", "Third Place"),
  mvp: copy("Individual distinction · Tournament MVP", "MOST|VALUABLE", "Impact · Leadership · Excellence", "MVP", "Tournament award", "Awarded to"),
  top_scorer: copy("Individual distinction · Top scorer", "BORN TO|SCORE", "Eliminations · Consistency · Impact", "#1", "Top scorer", "Awarded to"),
  top_defender: copy("Individual distinction · Top defender", "BUILT TO|DEFEND", "Defensive success · Discipline · Control", "#1", "Top defender", "Awarded to"),
  top_assist: copy("Individual distinction · Top assist", "CREATE THE|OPENING", "Assists · Vision · Teamwork", "#1", "Top assist", "Awarded to"),
});

export const getMiracleV3EditorialCopy = (type: MiracleV3CertificateType): MiracleV3EditorialCopy => EDITORIAL_COPY[type];
