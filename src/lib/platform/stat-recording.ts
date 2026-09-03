export type StatRecordingStatus = "unrecorded" | "partial" | "recorded" | "notRequired";
export type TeamStatRecordingStatus = StatRecordingStatus | "missingRoster";

export type MatchStatRecording = {
  status: StatRecordingStatus;
  home: TeamStatRecordingStatus;
  away: TeamStatRecordingStatus;
};

/** Only persisted numeric fields count; unsaved form defaults are not passed here. */
export function getTeamStatRecording(
  players: ReadonlyArray<{ id: string }>,
  statKeys: readonly string[],
  stats: Record<string, unknown>,
): TeamStatRecordingStatus {
  if (!statKeys.length) return "notRequired";
  if (!players.length) return "missingRoster";

  const complete = players.every(({ id }) => {
    const values = stats[id];
    if (!values || typeof values !== "object" || Array.isArray(values)) return false;
    return statKeys.every((key) => {
      const value = (values as Record<string, unknown>)[key];
      return typeof value === "number" && Number.isFinite(value);
    });
  });
  if (complete) return "recorded";
  return players.some(({ id }) => Object.hasOwn(stats, id)) ? "partial" : "unrecorded";
}

export function getMatchStatRecording(
  home: TeamStatRecordingStatus,
  away: TeamStatRecordingStatus,
): StatRecordingStatus {
  if (home === "notRequired" && away === "notRequired") return "notRequired";
  if (home === "recorded" && away === "recorded") return "recorded";
  return [home, away].some((status) => status === "recorded" || status === "partial")
    ? "partial"
    : "unrecorded";
}
