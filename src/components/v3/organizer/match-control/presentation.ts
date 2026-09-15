import type { CompetitionWorkspaceState, WorkspaceMatch, WorkspaceQuery } from "@/lib/competition/workspace-types";

export type OperationsText = (key: string, values?: Record<string, string | number>) => string;
export const surface = "min-w-0 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5";
export const control = "miracle-focus-ring min-h-11 w-full min-w-0 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-subtle)] px-3 py-2 text-sm";
export const link = "miracle-focus-ring inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--color-border-strong)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-cyan)]";
export const terminal = (match: WorkspaceMatch) => ["Live", "Completed", "Bye"].includes(match.status) || ["live", "completed"].includes(match.scheduleStatus) || match.resultVersion > 0;
export const activeCompetition = (state: CompetitionWorkspaceState) => ["Registration Closed", "Ongoing"].includes(state.event.status ?? "");
export const teamName = (state: CompetitionWorkspaceState, id: string, t: OperationsText) => state.teams.find(team => team.id === id)?.name ?? t("tbd");
export const actionLabel = (title: string, t: OperationsText) => t(title==="Team readiness deadline missed"||title==="Missing readiness"?"readinessDeadline":title==="Review delayed match schedule"?"reviewDelay":"reviewAction");
export const localDay = (start: string | null, timezone: string) => start ? new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(start)) : "";
export function matchLabel(state: CompetitionWorkspaceState, match: WorkspaceMatch, t: OperationsText) {
  const node = state.graph?.matches.find(node => node.id === match.id);
  if (!node) return t("matchNumber", { number: state.matches.findIndex(row => row.id === match.id) + 1 });
  const bracket = ["upper", "lower", "grand_final", "third_place"].includes(node.bracket) ? `${t(node.bracket)} · ` : "";
  return `${bracket}${t(node.bracket === "round_robin" ? "dayLabel" : "roundLabel", { round: node.round })} · ${t("matchNumber", { number: node.slot })}`;
}
export function matchStatus(match: WorkspaceMatch) {
  if (match.status === "Bye") return "bye";
  if (match.resultVersion > 0) return "completed";
  if (match.status === "Live") return "live";
  return ["live", "completed", "delayed", "postponed", "confirmed", "locked", "estimated"].includes(match.scheduleStatus) ? match.scheduleStatus : "pending";
}
export function matchesFilter(state: CompetitionWorkspaceState, match: WorkspaceMatch, filter: string) {
  switch (filter) {
    case "live": return matchStatus(match) === "live";
    case "needs-result": return match.resultVersion === 0 && match.status !== "Bye" && (["Live", "Completed"].includes(match.status) || ["live", "completed"].includes(match.scheduleStatus));
    case "next": return !terminal(match);
    case "completed": return match.resultVersion > 0;
    case "delayed": return ["delayed", "postponed"].includes(match.scheduleStatus);
    case "action": return state.actions.some(action => action.matchId === match.id);
    case "incidents": return state.incidents.some(incident => incident.matchId === match.id && !incident.resolvedAt);
    case "readiness": return !terminal(match) && [match.homeTeamId, match.awayTeamId].some(teamId => !teamId || !state.readiness.some(row => row.matchId === match.id && row.teamId === teamId && row.status === "ready"));
    default: return true;
  }
}
export function workspaceHref(base: string, query: WorkspaceQuery, updates: WorkspaceQuery = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...query, ...updates })) if (value) params.set(key, value);
  return `${base}${params.size ? `?${params}` : ""}`;
}
