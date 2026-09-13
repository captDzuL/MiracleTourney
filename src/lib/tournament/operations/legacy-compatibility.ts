import { generateCompetitionGraph, type CompetitionGraph, type SeededTeam } from "../competition";
import { tournamentFormatConfigSchema, upgradeLegacyTournamentFormat, type TournamentFormatConfig } from "../formats/types";
type LegacyMatch = { id: string; round: number | null; slot: number | null; roundLabel?: string; homeTeamId: string; awayTeamId: string; homeScore: number | null; awayScore: number | null; status: string; resultVersion: number; winnerTeamId?: string | null };
type LegacyRoundEvidence = { roundConfigs: { eventId?: string; roundLabel: string; bestOf: number }[]; matchGames: { matchId: string }[]; resultRevisionCount?: number };
export type LegacyDiagnostic = { status: "ready" | "blocked"; reason: "compatible" | "unsupported_format" | "ambiguous_configuration" | "existing_results" | "graph_mismatch" | "invalid_participants" | "incompatible_round_rules"; graph: CompetitionGraph | null };

function reconcileRoundRules(graph: CompetitionGraph, matches: LegacyMatch[], mapping: Map<string, string>, evidence: LegacyRoundEvidence): CompetitionGraph | null {
  const configs = new Map<string, number>();
  const matchLabels = new Set(matches.map(match => match.roundLabel).filter((label): label is string => !!label));
  for (const rule of evidence.roundConfigs) {
    if (rule.eventId && rule.eventId !== graph.eventId || configs.has(rule.roundLabel) || !matchLabels.has(rule.roundLabel) || !Number.isInteger(rule.bestOf) || rule.bestOf <= 0 || rule.bestOf % 2 === 0) return null;
    configs.set(rule.roundLabel, rule.bestOf);
  }
  const legacyById = new Map(matches.map(match => [match.id, match]));
  const desired = new Map(graph.matches.map(node => {
    const legacy = legacyById.get(mapping.get(node.id)!);
    return [node.id, configs.get(legacy?.roundLabel ?? "") ?? 1] as const;
  }));
  if (graph.config.kind === "round_robin") {
    if ([...desired.values()].some(bestOf => bestOf !== 1)) return null;
    return { ...graph, matches: graph.matches.map(node => ({ ...node, bestOf: 1 })) };
  }
  if (graph.config.kind !== "single_elimination") return null;
  type BestOfKey = keyof typeof graph.config.bestOf;
  const totalRounds = Math.max(0, ...graph.matches.filter(node => node.bracket === "single").map(node => node.round));
  const values = new Map<BestOfKey, Set<number>>();
  const bucket = (node: CompetitionGraph["matches"][number]): BestOfKey => node.bracket === "third_place" ? "thirdPlace"
    : node.round === totalRounds ? "final" : node.round === totalRounds - 1 ? "semifinals" : "earlyRounds";
  for (const node of graph.matches) {
    const key = bucket(node);
    const set = values.get(key) ?? new Set<number>();
    set.add(desired.get(node.id)!);
    values.set(key, set);
  }
  if ([...values.values()].some(set => set.size !== 1)) return null;
  const bestOf = { ...graph.config.bestOf };
  for (const [key, set] of values) bestOf[key] = [...set][0];
  const config: TournamentFormatConfig = { ...graph.config, bestOf };
  return { ...graph, config, matches: graph.matches.map(node => ({ ...node, bestOf: desired.get(node.id)! })) };
}
/** Adopt only a complete unplayed graph with explicit rules. Never infer results. */
export function diagnoseLegacyCompetition(event: { id: string; format: string; formatConfig: unknown }, teams: SeededTeam[], matches: LegacyMatch[], evidence: LegacyRoundEvidence = { roundConfigs: [], matchGames: [] }): LegacyDiagnostic {
  const blocked = (reason: LegacyDiagnostic["reason"]): LegacyDiagnostic => ({ status: "blocked", reason, graph: null });
  if (event.format !== "Single Elimination" && event.format !== "League") return blocked("unsupported_format");
  if (evidence.matchGames.length || evidence.resultRevisionCount || matches.some(m => !["Scheduled", "Upcoming"].includes(m.status) || m.resultVersion > 0 || m.winnerTeamId || m.homeScore || m.awayScore)) return blocked("existing_results");
  const parsed = tournamentFormatConfigSchema.safeParse(event.formatConfig);
  if (!parsed.success && matches.length) return blocked("ambiguous_configuration");
  const config = parsed.success ? parsed.data : upgradeLegacyTournamentFormat(event.format);
  if (config.kind !== "single_elimination" && config.kind !== "round_robin") return blocked("unsupported_format");
  if ((config.kind === "single_elimination") !== (event.format === "Single Elimination")) return blocked("ambiguous_configuration");
  let graph: CompetitionGraph;
  try { graph = generateCompetitionGraph({ eventId: event.id, config, teams }); } catch { return blocked("invalid_participants"); }
  if (!matches.length) return evidence.roundConfigs.length ? blocked("incompatible_round_rules") : { status: "ready", reason: "compatible", graph };
  if (matches.length !== graph.matches.length || graph.matches.some(m => m.status !== "pending")) return blocked("graph_mismatch");
  const mapping = new Map<string, string>();
  for (const node of graph.matches) {
    const home = node.home.kind === "team" ? node.home.teamId : "";
    const away = node.away.kind === "team" ? node.away.teamId : "";
    const candidates = matches.filter(m => m.round === node.round && m.homeTeamId === home && m.awayTeamId === away && (config.kind === "round_robin" || m.slot === node.slot));
    if (candidates.length !== 1 || [...mapping.values()].includes(candidates[0].id)) return blocked("graph_mismatch");
    mapping.set(node.id, candidates[0].id);
  }
  const reconciled = reconcileRoundRules(graph, matches, mapping, evidence);
  if (!reconciled) return blocked("incompatible_round_rules");
  graph = reconciled;
  const source = (s: CompetitionGraph["matches"][number]["home"]) => s.kind === "match" ? { ...s, matchId: mapping.get(s.matchId)! } : s;
  graph = { ...graph, matches: graph.matches.map(m => ({ ...m, id: mapping.get(m.id)!, home: source(m.home), away: source(m.away), advance: m.advance ? source(m.advance) : null })), dependencies: graph.dependencies.map(d => ({ ...d, sourceMatchId: mapping.get(d.sourceMatchId)!, targetMatchId: mapping.get(d.targetMatchId)! })), placements: graph.placements.map(p => ({ ...p, source: source(p.source) })) };
  return { status: "ready", reason: "compatible", graph };
}
export function legacyDiagnosticMessage(reason: LegacyDiagnostic["reason"], locale: "en" | "id") {
  const messages = {
    compatible: ["This unplayed legacy competition can be upgraded after review. Match identities and schedule labels are preserved.", "Kompetisi lama yang belum dimainkan dapat ditingkatkan setelah ditinjau. Identitas pertandingan dan label jadwal dipertahankan."],
    unsupported_format: ["This legacy format cannot be safely upgraded. Continue using legacy Match Day.", "Format lama ini belum dapat ditingkatkan dengan aman. Lanjutkan melalui Match Day lama."],
    ambiguous_configuration: ["Existing fixtures have no unambiguous format rules. Continue using legacy Match Day.", "Pertandingan lama tidak memiliki aturan format yang pasti. Lanjutkan melalui Match Day lama."],
    existing_results: ["Live play or recorded results prevent automatic upgrade. Continue using legacy Match Day; results are preserved.", "Pertandingan berlangsung atau hasil tercatat menghalangi peningkatan otomatis. Lanjutkan melalui Match Day lama; hasil tetap dipertahankan."],
    graph_mismatch: ["Existing fixtures do not exactly match a supported competition graph. Continue using legacy Match Day.", "Pertandingan lama tidak cocok sepenuhnya dengan struktur kompetisi yang didukung. Lanjutkan melalui Match Day lama."],
    incompatible_round_rules: ["Legacy round rules cannot be represented exactly in this competition format. Continue using legacy Match Day.", "Aturan ronde lama tidak dapat direpresentasikan secara tepat dalam format kompetisi ini. Lanjutkan melalui Match Day lama."],
    invalid_participants: ["Confirm at least two valid participants before upgrading.", "Pastikan minimal dua peserta yang valid sebelum meningkatkan kompetisi."],
  };
  return messages[reason][locale === "id" ? 1 : 0];
}
