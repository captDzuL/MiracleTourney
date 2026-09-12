import { generateCompetitionGraph, type CompetitionGraph, type SeededTeam } from "../competition";
import { tournamentFormatConfigSchema, upgradeLegacyTournamentFormat } from "../formats/types";
type LegacyMatch = { id: string; round: number | null; slot: number | null; homeTeamId: string; awayTeamId: string; homeScore: number | null; awayScore: number | null; status: string; resultVersion: number; winnerTeamId?: string | null };
export type LegacyDiagnostic = { status: "ready" | "blocked"; reason: "compatible" | "unsupported_format" | "ambiguous_configuration" | "existing_results" | "graph_mismatch" | "invalid_participants"; graph: CompetitionGraph | null };
/** Adopt only a complete unplayed graph with explicit rules. Never infer results. */
export function diagnoseLegacyCompetition(event: { id: string; format: string; formatConfig: unknown }, teams: SeededTeam[], matches: LegacyMatch[]): LegacyDiagnostic {
  const blocked = (reason: LegacyDiagnostic["reason"]): LegacyDiagnostic => ({ status: "blocked", reason, graph: null });
  if (event.format !== "Single Elimination" && event.format !== "League") return blocked("unsupported_format");
  if (matches.some(m => !["Scheduled", "Upcoming"].includes(m.status) || m.resultVersion > 0 || m.winnerTeamId || m.homeScore || m.awayScore)) return blocked("existing_results");
  const parsed = tournamentFormatConfigSchema.safeParse(event.formatConfig);
  if (!parsed.success && matches.length) return blocked("ambiguous_configuration");
  const config = parsed.success ? parsed.data : upgradeLegacyTournamentFormat(event.format);
  if (config.kind !== "single_elimination" && config.kind !== "round_robin") return blocked("unsupported_format");
  if ((config.kind === "single_elimination") !== (event.format === "Single Elimination")) return blocked("ambiguous_configuration");
  let graph: CompetitionGraph;
  try { graph = generateCompetitionGraph({ eventId: event.id, config, teams }); } catch { return blocked("invalid_participants"); }
  if (!matches.length) return { status: "ready", reason: "compatible", graph };
  if (matches.length !== graph.matches.length || graph.matches.some(m => m.status !== "pending")) return blocked("graph_mismatch");
  const mapping = new Map<string, string>();
  for (const node of graph.matches) {
    const home = node.home.kind === "team" ? node.home.teamId : "";
    const away = node.away.kind === "team" ? node.away.teamId : "";
    const candidates = matches.filter(m => m.round === node.round && m.homeTeamId === home && m.awayTeamId === away && (config.kind === "round_robin" || m.slot === node.slot));
    if (candidates.length !== 1 || [...mapping.values()].includes(candidates[0].id)) return blocked("graph_mismatch");
    mapping.set(node.id, candidates[0].id);
  }
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
    invalid_participants: ["Confirm at least two valid participants before upgrading.", "Pastikan minimal dua peserta yang valid sebelum meningkatkan kompetisi."],
  };
  return messages[reason][locale === "id" ? 1 : 0];
}
