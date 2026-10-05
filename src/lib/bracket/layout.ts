import type { SocialBracketMatch } from "./types";

export type BracketEdge = { sourceId: string; targetId: string; outcome: "winner" | "loser"; targetSlot: "home" | "away" };
export type BracketRound = { key: string; label: string; number: number; matches: SocialBracketMatch[] };
export type BracketPosition = { x: number; y: number };
export type BracketLayout = { rounds: BracketRound[]; positions: Map<string, BracketPosition>; columns: Map<string, number>; edges: BracketEdge[]; width: number; height: number };
export const CARD_WIDTH = 272;
export const CARD_HEIGHT = 120;
export const COLUMN_GAP = 66;
export const CARD_PITCH = 148;
const LANE_GAP = 54;

function laneRank(bracket: string): number {
  const lower = bracket.toLowerCase();
  if (/third|bronze|3rd/.test(lower)) return 2;
  if (/lower|loser/.test(lower)) return 1;
  return 0;
}
function isGrandFinal(bracket: string): boolean { return /grand[_-]?final|reset/i.test(bracket); }

export function buildBracketLayout(matches: SocialBracketMatch[], roundKey?: string): BracketLayout {
  const allRounds = new Map<string, BracketRound>();
  for (const match of matches) {
    const round = allRounds.get(match.roundKey);
    if (round) round.matches.push(match);
    else allRounds.set(match.roundKey, { key: match.roundKey, label: match.roundLabel, number: match.round, matches: [match] });
  }
  const visible = roundKey ? [...allRounds.values()].filter((round) => round.key === roundKey) : [...allRounds.values()];
  const displayed = visible.flatMap((round) => round.matches);
  const byId = new Map(displayed.map((match) => [match.id, match]));
  const bracketRounds = new Map<string, BracketRound[]>();
  for (const round of visible) {
    const bracket = round.matches[0]?.bracket ?? "upper";
    const entries = bracketRounds.get(bracket) ?? [];
    entries.push(round); bracketRounds.set(bracket, entries);
  }
  const columns = new Map<string, number>();
  for (const entries of bracketRounds.values()) {
    entries.sort((a, b) => a.number - b.number || a.key.localeCompare(b.key));
    entries.forEach((entry, index) => columns.set(entry.key, index));
  }
  if (!roundKey) {
    const base = Math.max(0, ...visible.filter((round) => !isGrandFinal(round.matches[0]?.bracket ?? "")).map((round) => columns.get(round.key) ?? 0)) + 1;
    for (const round of visible.filter((entry) => isGrandFinal(entry.matches[0]?.bracket ?? ""))) columns.set(round.key, base + (columns.get(round.key) ?? 0));
  }
  const edges: BracketEdge[] = [];
  for (const match of displayed) {
    for (const targetSlot of ["home", "away"] as const) {
      const source = match[targetSlot];
      if (source.sourceMatchId && source.outcome && byId.has(source.sourceMatchId) && source.sourceMatchId !== match.id) edges.push({ sourceId: source.sourceMatchId, targetId: match.id, outcome: source.outcome, targetSlot });
    }
  }
  for (let pass = 0; pass < visible.length; pass++) {
    let changed = false;
    for (const edge of edges) {
      const source = byId.get(edge.sourceId)!;
      const target = byId.get(edge.targetId)!;
      if (source.roundKey === target.roundKey) continue;
      const next = Math.max(columns.get(target.roundKey) ?? 0, (columns.get(source.roundKey) ?? 0) + 1);
      if (next !== columns.get(target.roundKey)) { columns.set(target.roundKey, next); changed = true; }
    }
    if (!changed) break;
  }
  visible.sort((a, b) => (columns.get(a.key) ?? 0) - (columns.get(b.key) ?? 0) || laneRank(a.matches[0]?.bracket ?? "") - laneRank(b.matches[0]?.bracket ?? "") || a.key.localeCompare(b.key));
  const maxByLane = [0, 1, 2].map((rank) => Math.max(0, ...visible.flatMap((round) => round.matches.some((match) => laneRank(match.bracket) === rank && !isGrandFinal(match.bracket)) ? [round.matches.length] : [])));
  const laneStart = [0, maxByLane[0] * CARD_PITCH + LANE_GAP, (maxByLane[0] + maxByLane[1]) * CARD_PITCH + 2 * LANE_GAP];
  const positions = new Map<string, BracketPosition>();
  for (const round of visible) {
    const ranked = [...round.matches].sort((a, b) => a.slot - b.slot || a.id.localeCompare(b.id));
    for (const [index, match] of ranked.entries()) positions.set(match.id, { x: (columns.get(round.key) ?? 0) * (CARD_WIDTH + COLUMN_GAP), y: laneStart[laneRank(match.bracket)] + index * CARD_PITCH });
  }
  for (const round of visible) {
    for (const match of round.matches) {
      const parents = edges.filter((edge) => edge.targetId === match.id).map((edge) => byId.get(edge.sourceId)!);
      if (!parents.length) continue;
      const sameLane = parents.every((parent) => laneRank(parent.bracket) === laneRank(match.bracket));
      if (!sameLane && !isGrandFinal(match.bracket)) continue;
      const y = parents.reduce((sum, parent) => sum + positions.get(parent.id)!.y, 0) / parents.length;
      positions.get(match.id)!.y = Math.round(y);
    }
  }
  const height = Math.max(140, ...[...positions.values()].map((position) => position.y + CARD_HEIGHT)) + 24;
  const width = Math.max(300, (Math.max(0, ...columns.values()) + 1) * (CARD_WIDTH + COLUMN_GAP) - COLUMN_GAP);
  return { rounds: visible, positions, columns, edges, width, height };
}
