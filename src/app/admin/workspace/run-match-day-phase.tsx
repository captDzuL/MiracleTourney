// Phase of the admin workspace: run match day and player stats.
// Moved out of admin-workspace.tsx without changes (refactor Phase 4, 4a-admin).

import { buildAdminPhaseHref } from "@/app/admin/admin-flow";
import { MatchupNames, PhaseSection, StatusChip, inputClass, labelClass, matchDeskCardGridClass, primaryButton, quietButton } from "@/app/admin/workspace/shared";
import type { AdminTranslator, EventItem, ManageableEventItem, MatchGameItem, MatchItem, RoundConfigItem } from "@/app/admin/workspace/shared";
import { SubmitButton } from "@/components/submit-button";
import { Section } from "@/components/ui";
import { adminSaveMatchPlayerStatsAction, adminSetMatchGamesAction, adminSetRoundConfigAction, adminUpdateMatchResultAction } from "@/lib/actions/match-actions";
import { getStatKeysForMode } from "@/lib/platform/config";
import type { MatchStatRecording, TeamStatRecordingStatus } from "@/lib/platform/stat-recording";
import { getPlayerStatNumericValue } from "@/lib/player-stats/form";
import type { PlayerStatPayloadMap } from "@/lib/player-stats/form";
import { getMatchWithRosterAndStats } from "@/lib/player-stats/write-repository";
import { RefreshCw, Save, SlidersHorizontal } from "lucide-react";

export type MatchRosterAndStats = Awaited<ReturnType<typeof getMatchWithRosterAndStats>>;

export type CompletedMatchWithEvent = { match: MatchItem; event: EventItem };

export function RunMatchDayPhase({
  activeEvent,
  completedMatchesWithEvent,
  matchStatRecordings,
  completedMatchItem,
  manageableEvents,
  manageableMatches,
  roundConfigMap,
  roundConfigs,
  selectedManageableEvent,
  selectedMatch,
  selectedMatchBestOf,
  selectedMatchGames,
  selectedMatchRosterAndStats,
  locale,
  t,
  teamName,
}: {
  activeEvent: EventItem | undefined;
  completedMatchesWithEvent: CompletedMatchWithEvent[];
  matchStatRecordings: Map<string, MatchStatRecording>;
  completedMatchItem: CompletedMatchWithEvent | undefined;
  manageableEvents: ManageableEventItem[];
  manageableMatches: MatchItem[];
  roundConfigMap: Map<string, number>;
  roundConfigs: RoundConfigItem[];
  selectedManageableEvent: ManageableEventItem | undefined;
  selectedMatch: MatchItem | undefined;
  selectedMatchBestOf: number;
  selectedMatchGames: MatchGameItem[];
  selectedMatchRosterAndStats: MatchRosterAndStats;
  locale?: "id" | "en";
  t: AdminTranslator;
  teamName: (teamId: string | undefined) => string;
}) {
  const distinctRoundLabels = selectedManageableEvent
    ? [...new Set(selectedManageableEvent.manageableMatches.map((match) => match.roundLabel))]
    : [];

  const hasContent = selectedManageableEvent || completedMatchesWithEvent.length > 0;

  return (
    <PhaseSection
      action={
        <a className={quietButton} href={buildAdminPhaseHref("run", { matchEventId: selectedManageableEvent?.event.id })}>
          <RefreshCw className="h-4 w-4" />
          {t("refreshMatchDesk")}
        </a>
      }
      description={t("runDescription")}
      title={t("runTitle")}
    >
      {hasContent ? (
        <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(100%,22rem),1fr))]">
          <div className="grid gap-6">
            {selectedManageableEvent ? (
              <Section title={t("matchQueueTitle")} description={t("matchQueueDescription")} className="rounded-xl shadow-none">
                <form action="" className="mb-5 flex flex-wrap items-end gap-3">
                  <input type="hidden" name="phase" value="run" />
                  <label className={`${labelClass} min-w-64 flex-1`}>
                    {t("eventSelect")}
                    <select className={inputClass} name="matchEventId" defaultValue={selectedManageableEvent.event.id}>
                      {manageableEvents.map(({ event, manageableMatches: eventMatches }) => (
                        <option key={event.id} value={event.id}>
                          {event.name} - {t("matchesRemaining", { n: eventMatches.length })}
                        </option>
                      ))}
                    </select>
                  </label>
                  <SubmitButton className={quietButton}>
                    <RefreshCw className="h-4 w-4" />
                    {t("changeEvent")}
                  </SubmitButton>
                </form>

                <div className={matchDeskCardGridClass}>
                  {manageableMatches.map((match) => {
                    const bo = roundConfigMap.get(match.roundLabel) ?? 1;
                    const isSelected = selectedMatch?.id === match.id;
                    const homeTeamName = teamName(match.homeTeamId);
                    const awayTeamName = teamName(match.awayTeamId);
                    return (
                      <a
                        key={match.id}
                        href={`?phase=run&matchEventId=${selectedManageableEvent.event.id}&matchId=${match.id}`}
                        className={`grid gap-2 rounded-xl border px-3 py-3 transition ${
                          isSelected
                            ? "border-cyan-300 bg-cyan-50 shadow-[0_0_0_3px_rgba(34,211,238,0.15)]"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <span className="flex min-w-0 items-start justify-between gap-2">
                          <span className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-slate-400">
                            {match.roundLabel} · M{match.slot}
                          </span>
                          <span className="shrink-0 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                            BO{bo}
                          </span>
                        </span>
                        <MatchupNames homeName={homeTeamName} awayName={awayTeamName} />
                      </a>
                    );
                  })}
                </div>
              </Section>
            ) : null}

            {completedMatchesWithEvent.length > 0 ? (
              <Section
                title={t("statRecording.title")}
                description={t("statRecording.description", { event: activeEvent?.name ?? "" })}
                className="rounded-xl shadow-none"
              >
                <div className={matchDeskCardGridClass}>
                  {completedMatchesWithEvent.map(({ match }) => {
                    const recording = matchStatRecordings.get(match.id)!;
                    const isSelected = selectedMatch?.id === match.id;
                    const homeScore = match.homeScore;
                    const awayScore = match.awayScore;
                    const homeTeamName = teamName(match.homeTeamId);
                    const awayTeamName = teamName(match.awayTeamId);
                    return (
                      <a
                        key={match.id}
                        href={`?phase=run&activeEventId=${activeEvent?.id ?? ""}&matchEventId=${selectedManageableEvent?.event.id ?? ""}&matchId=${match.id}`}
                        className={`grid gap-2.5 rounded-xl border px-3 py-3 transition ${
                          isSelected
                            ? "border-emerald-300 bg-emerald-50 shadow-[0_0_0_3px_rgba(52,211,153,0.15)]"
                            : "border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/50"
                        }`}
                      >
                        <span className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                          <span className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-slate-400">
                            {match.roundLabel}
                          </span>
                          <StatRecordingBadge status={recording.status} t={t} />
                        </span>
                        <MatchupNames homeName={homeTeamName} awayName={awayTeamName} />
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="rounded-md bg-slate-900 px-2.5 py-1 text-sm font-bold tabular-nums text-white">
                            {homeScore} – {awayScore}
                          </span>
                          <span className="min-w-0 text-xs text-slate-500">
                            {t(`statRecording.hints.${recording.home === "missingRoster" || recording.away === "missingRoster" ? "missingRoster" : recording.status}`)}
                          </span>
                        </span>
                      </a>
                    );
                  })}
                </div>
              </Section>
            ) : null}

            {distinctRoundLabels.length && selectedManageableEvent ? (
              <Section title={t("roundConfigTitle")} description={t("roundConfigDesc")} className="rounded-xl shadow-none">
                <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,14rem),1fr))]">
                  {distinctRoundLabels.map((label) => {
                    const currentBestOf = roundConfigMap.get(label) ?? roundConfigs.find((config) => config.roundLabel === label)?.bestOf ?? 1;
                    return (
                      <form key={label} action={adminSetRoundConfigAction} className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <input type="hidden" name="eventId" value={selectedManageableEvent.event.id} />
                        {locale ? <input type="hidden" name="locale" value={locale} /> : null}
                        <input type="hidden" name="roundLabel" value={label} />
                        <label className={labelClass}>
                          {label}
                          <select name="bestOf" defaultValue={currentBestOf} className={inputClass}>
                            <option value="1">Best of 1</option>
                            <option value="3">Best of 3</option>
                            <option value="5">Best of 5</option>
                          </select>
                        </label>
                        <SubmitButton className={quietButton}>
                          <SlidersHorizontal className="h-4 w-4" />
                          {t("saveRoundConfig")}
                        </SubmitButton>
                      </form>
                    );
                  })}
                </div>
              </Section>
            ) : null}
          </div>

          <div className="grid auto-rows-min gap-6">
            <Section title={t("selectedMatchTitle")} description={t("selectedMatchDescription")} className="rounded-xl shadow-none">
              {selectedMatch ? (
                <div className="grid gap-5">
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                      <p className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-slate-400">
                        {selectedMatch.roundLabel}{selectedMatch.slot ? ` · Match ${selectedMatch.slot}` : ""}
                      </p>
                    </div>
                    <div className="px-4 py-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <MatchupNames homeName={teamName(selectedMatch.homeTeamId)} awayName={teamName(selectedMatch.awayTeamId)} size="base" />
                        <StatusChip tone={selectedMatch.status === "Completed" ? "success" : "warning"}>
                          {selectedMatch.status === "Completed" ? `${selectedMatch.homeScore} – ${selectedMatch.awayScore}` : `BO${selectedMatchBestOf}`}
                        </StatusChip>
                      </div>
                    </div>
                  </div>

                  {selectedMatch.status !== "Completed" && (
                    selectedMatchBestOf === 1 ? (
                      <form action={adminUpdateMatchResultAction} className="grid gap-4">
                        <input type="hidden" name="eventId" value={selectedManageableEvent?.event.id} />
                        <input type="hidden" name="matchEventId" value={selectedManageableEvent?.event.id} />
                        <input type="hidden" name="matchId" value={selectedMatch.id} />
                        {locale ? <input type="hidden" name="locale" value={locale} /> : null}
                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className={labelClass}>
                            {teamName(selectedMatch.homeTeamId)} (Home)
                            <input className={`${inputClass} text-center text-lg font-semibold`} name="homeScore" type="number" min="0" defaultValue="0" />
                          </label>
                          <label className={labelClass}>
                            {teamName(selectedMatch.awayTeamId)} (Away)
                            <input className={`${inputClass} text-center text-lg font-semibold`} name="awayScore" type="number" min="0" defaultValue="0" />
                          </label>
                        </div>
                        <SubmitButton className={primaryButton}>
                          <Save className="h-4 w-4" />
                          {t("saveResult")}
                        </SubmitButton>
                      </form>
                    ) : (
                      <form action={adminSetMatchGamesAction} className="grid gap-4">
                        <input type="hidden" name="matchId" value={selectedMatch.id} />
                        <input type="hidden" name="matchEventId" value={selectedManageableEvent?.event.id} />
                        <input type="hidden" name="bestOf" value={selectedMatchBestOf} />
                        {locale ? <input type="hidden" name="locale" value={locale} /> : null}
                        <div className="grid gap-3">
                          <div className="grid grid-cols-[3rem_1fr_1fr] gap-3">
                            <div />
                            <p className="text-xs font-semibold uppercase text-slate-500">{teamName(selectedMatch.homeTeamId)}</p>
                            <p className="text-xs font-semibold uppercase text-slate-500">{teamName(selectedMatch.awayTeamId)}</p>
                          </div>
                          {Array.from({ length: selectedMatchBestOf }, (_, index) => {
                            const gameNumber = index + 1;
                            const existingGame = selectedMatchGames.find((game) => game.gameNumber === gameNumber);
                            return (
                              <div key={gameNumber} className="grid grid-cols-[3rem_1fr_1fr] items-center gap-3">
                                <p className="text-xs font-semibold text-slate-500">G{gameNumber}</p>
                                <input className={`${inputClass} text-center font-semibold`} name={`game${gameNumber}_home`} type="number" min="0" defaultValue={existingGame?.homeScore ?? ""} placeholder="-" />
                                <input className={`${inputClass} text-center font-semibold`} name={`game${gameNumber}_away`} type="number" min="0" defaultValue={existingGame?.awayScore ?? ""} placeholder="-" />
                              </div>
                            );
                          })}
                        </div>
                        <SubmitButton className={primaryButton}>
                          <Save className="h-4 w-4" />
                          {t("saveGames")}
                        </SubmitButton>
                      </form>
                    )
                  )}

                  <a
                    href={`?phase=run&activeEventId=${activeEvent?.id ?? ""}&matchEventId=${selectedManageableEvent?.event.id ?? ""}`}
                    className="text-sm font-medium text-slate-400 hover:text-slate-600"
                  >
                    {t("cancelAction")}
                  </a>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center">
                  <p className="text-sm text-slate-400">{t("selectMatch")}</p>
                </div>
              )}
              {selectedMatchRosterAndStats?.match.status === "Completed" && (completedMatchItem?.event ?? activeEvent) ? (
                <PlayerStatsSection
                  t={t}
                  recording={matchStatRecordings.get(selectedMatchRosterAndStats.match.id)!}
                  eventId={(completedMatchItem?.event ?? activeEvent)!.id}
                  gameModeId={(completedMatchItem?.event ?? activeEvent)!.gameModeId}
                  gameId={(completedMatchItem?.event ?? activeEvent)!.gameId}
                  matchId={selectedMatchRosterAndStats.match.id}
                  homePlayers={selectedMatchRosterAndStats.homePlayers}
                  awayPlayers={selectedMatchRosterAndStats.awayPlayers}
                  homeTeamId={selectedMatchRosterAndStats.match.homeTeamId}
                  awayTeamId={selectedMatchRosterAndStats.match.awayTeamId}
                  homeTeamName={teamName(selectedMatchRosterAndStats.match.homeTeamId)}
                  awayTeamName={teamName(selectedMatchRosterAndStats.match.awayTeamId)}
                  existingStats={selectedMatchRosterAndStats.existingStats}
                  scoreGameNumbers={selectedMatchRosterAndStats.scoreGameNumbers}
                />
              ) : null}
            </Section>
          </div>
        </div>
      ) : (
        <Section title={t("matchTitle")} description={t("matchDescription")} className="rounded-xl shadow-none">
          <p className="text-sm text-slate-500">{t("noMatches")}</p>
        </Section>
      )}
    </PhaseSection>
  );
}

export type PlayerInfo = { id: string; displayName: string; nickname: string };

export function StatRecordingBadge({ status, t }: { status: TeamStatRecordingStatus; t: AdminTranslator }) {
  const tones = {
    unrecorded: "bg-slate-100 text-slate-600",
    partial: "bg-amber-100 text-amber-800",
    recorded: "bg-emerald-100 text-emerald-700",
    notRequired: "bg-emerald-100 text-emerald-700",
    missingRoster: "bg-amber-100 text-amber-800",
  };
  return (
    <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${tones[status]}`}>
      {t(`statRecording.statuses.${status}`)}
    </span>
  );
}

export function PlayerStatsSection({
  t,
  recording,
  eventId,
  gameModeId,
  gameId,
  matchId,
  homePlayers,
  awayPlayers,
  homeTeamId,
  awayTeamId,
  homeTeamName,
  awayTeamName,
  existingStats,
  scoreGameNumbers,
}: {
  eventId: string;
  gameModeId: string;
  gameId: string;
  matchId: string;
  homePlayers: PlayerInfo[];
  awayPlayers: PlayerInfo[];
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  existingStats: PlayerStatPayloadMap;
  scoreGameNumbers: number[] | null;
  t: AdminTranslator;
  recording: MatchStatRecording;
}) {
  const statKeys = getStatKeysForMode(gameModeId, gameId);
  if (!statKeys.length) return null;

  const statColWidth = statKeys.length <= 3 ? "5rem" : "4rem";
  const metricCount = statKeys.length + (scoreGameNumbers?.length ?? 0);
  const gridCols = `grid-cols-[minmax(8rem,1fr)_repeat(${metricCount},${statColWidth})]`;

  function TeamStatForm({ teamId, teamName, players }: { teamId: string; teamName: string; players: PlayerInfo[] }) {
    const status = teamId === homeTeamId ? recording.home : recording.away;
    return (
      <form action={adminSaveMatchPlayerStatsAction} className="grid gap-0">
        <input type="hidden" name="matchId" value={matchId} />
        <input type="hidden" name="teamId" value={teamId} />
        <input type="hidden" name="eventId" value={eventId} />

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-cyan-400" />
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{teamName}</p>
          <StatRecordingBadge status={status} t={t} />
        </div>

        {players.length === 0 ? (
          <p className="text-sm text-slate-600">{t("statRecording.missingRosterHelp")}</p>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className={`grid gap-0 border-b border-slate-100 bg-slate-50 px-3 py-2 ${gridCols}`}>
                <p className="text-xs font-semibold text-slate-400">{t("statRecording.player")}</p>
                {scoreGameNumbers?.map((gameNumber) => (
                  <p key={gameNumber} className="text-center text-xs font-bold text-slate-500">Score G{gameNumber}</p>
                ))}
                {statKeys.map((key) => (
                  <p key={key} className="text-center text-xs font-bold capitalize text-slate-500">{key}</p>
                ))}
              </div>

              {players.map((player, i) => (
                <div
                  key={player.id}
                  className={`grid items-center gap-0 px-3 py-2 ${gridCols} ${i < players.length - 1 ? "border-b border-slate-100" : ""}`}
                >
                  <p className="truncate pr-2 text-sm font-medium text-slate-800">{player.nickname}</p>
                  {scoreGameNumbers?.map((gameNumber, scoreIndex) => {
                    const savedScores = existingStats[player.id]?.scores;
                    const savedScore = Array.isArray(savedScores) ? savedScores[scoreIndex] : null;
                    return (
                      <input
                        key={gameNumber}
                        aria-label={`${player.nickname} score game ${gameNumber}`}
                        className="mx-0.5 min-h-11 w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 text-center text-sm font-semibold text-slate-900 outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-2 focus:ring-cyan-100"
                        name={`score_${player.id}_${gameNumber}`}
                        type="number"
                        min="0"
                        max="10"
                        step="0.1"
                        defaultValue={typeof savedScore === "number" ? savedScore : ""}
                      />
                    );
                  })}
                  {statKeys.map((key) => (
                    <input
                      key={key}
                      className="mx-0.5 w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 text-center text-sm font-semibold text-slate-900 outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-2 focus:ring-cyan-100"
                      name={`stat_${player.id}_${key}`}
                      type="number"
                      min="0"
                      max="9999"
                      defaultValue={getPlayerStatNumericValue(existingStats[player.id], key)}
                    />
                  ))}
                </div>
              ))}
            </div>

            <SubmitButton className={`${primaryButton} mt-3`}>
              <Save className="h-4 w-4" />
              {t("statRecording.saveTeam", { team: teamName })}
            </SubmitButton>
          </>
        )}
      </form>
    );
  }

  return (
    <div className="grid gap-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-bold text-slate-700">{t("statRecording.playerStats")}</p>
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-500">
          {statKeys.join(" · ")}
        </span>
      </div>
      <TeamStatForm teamId={homeTeamId} teamName={homeTeamName} players={homePlayers} />
      <hr className="border-slate-200" />
      <TeamStatForm teamId={awayTeamId} teamName={awayTeamName} players={awayPlayers} />
    </div>
  );
}
