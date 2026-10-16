// Teams, matches, slots and leaderboards of a public V3 event.
// Moved out of public-v3-read.ts without changes (refactor Phase 4, 4c-v3read).

import type { CompatiblePublicEventInput, CompatiblePublicMatch, CompatiblePublicTeam, PublicV3BracketSlot, PublicV3LeaderboardEntry, PublicV3Match, PublicV3Team } from "@/lib/events/public-v3-types";
import { MAX_REGISTRATION_TEMPLATE_SLOTS, dateText, nonNegative, publicBracketKind, text } from "@/lib/events/public-v3/basics";
import { readFlashpeakStatPayload } from "@/lib/player-stats/flashpeak";

export function teamsFor(input: CompatiblePublicEventInput): PublicV3Team[] {
  const explicit = Array.isArray(input.teams) ? input.teams : [];
  const fromRegistrations = (Array.isArray(input.registrations) ? input.registrations : [])
    .filter((row) => ["approved", "accepted", "active"].includes(text(row.status).toLowerCase()))
    .map((row) => row.team ?? (row.teamId ? { id: row.teamId, name: text(row.teamId) } : null))
    .filter((team): team is CompatiblePublicTeam => Boolean(team));
  const byId = new Map<string, PublicV3Team>();
  for (const team of [...explicit, ...fromRegistrations]) {
    const id = text(team.id);
    if (!id || byId.has(id)) continue;
    byId.set(id, {
      id,
      name: text(team.name, id),
      tag: typeof team.tag === "string" ? team.tag : null,
      logoUrl: typeof team.logoUrl === "string" ? team.logoUrl : null,
      players: Array.isArray(team.players) ? team.players.length : nonNegative(team.players),
    });
  }
  return [...byId.values()];
}

export function teamNames(input: CompatiblePublicEventInput): Map<string, string> {
  return new Map(teamsFor(input).map((team) => [team.id, team.name]));
}

export function matchOfficial(match: CompatiblePublicMatch): boolean {
  return nonNegative(match.resultVersion) > 0 || ["completed", "complete"].includes(text(match.status).toLowerCase());
}

export function publicScore(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function publicMatch(match: CompatiblePublicMatch, names: Map<string, string>, mode: "registration" | "drawing" | "ongoing" | "finished"): PublicV3Match {
  const official = matchOfficial(match);
  const rawStatus = text(match.status).toLowerCase();
  const status: PublicV3Match["status"] = official
    ? "completed"
    : rawStatus === "live" ? "live"
      : rawStatus === "delayed" ? "delayed"
        : rawStatus === "postponed" ? "postponed" : "scheduled";
  const homeId = text(match.homeTeamId);
  const awayId = text(match.awayTeamId);
  const revealParticipants = mode !== "drawing";
  const round = Math.floor(nonNegative(match.round));
  return {
    id: text(match.id),
    roundLabel: text(match.roundLabel, match.round ? "Round " + match.round : "Match"),
    round: round > 0 ? round : null,
    phaseId: text(match.phaseId) || null,
    groupId: text(match.groupId) || null,
    groupNumber: publicScore(match.groupNumber),
    ...(typeof match.isPlayoff === "boolean" ? { isPlayoff: match.isPlayoff } : {}),
    bracket: publicBracketKind(match.bracket),
    home: revealParticipants && homeId ? names.get(homeId) ?? homeId : null,
    away: revealParticipants && awayId ? names.get(awayId) ?? awayId : null,
    status,
    homeScore: official ? publicScore(match.homeScore) : null,
    awayScore: official ? publicScore(match.awayScore) : null,
    start: dateText(match.scheduledAt),
    end: dateText(match.scheduledEndsAt),
    room: text(match.scheduleRoom) || null,
    bestOf: Math.max(1, Math.floor(nonNegative(match.bestOf, 1))),
    official,
  };
}

export function tbdSlots(matches: PublicV3Match[]): PublicV3BracketSlot[] {
  return matches.map((match) => ({
    id: match.id,
    roundLabel: match.roundLabel,
    home: match.home ?? "TBD",
    away: match.away ?? "TBD",
    status: "tbd",
    homeScore: null,
    awayScore: null,
    official: false,
  }));
}

export function registrationTemplateSlots(participantCap: number): PublicV3BracketSlot[] {
  const count = Math.min(MAX_REGISTRATION_TEMPLATE_SLOTS, Math.max(0, Math.floor(participantCap)));
  return Array.from({ length: count }, (_, index) => ({
    id: `registration-slot-${index + 1}`,
    roundLabel: `Slot ${index + 1}`,
    home: "TBD",
    away: "TBD",
    status: "tbd" as const,
    homeScore: null,
    awayScore: null,
    official: false,
  }));
}

export function leaderboardFor(input: CompatiblePublicEventInput): PublicV3LeaderboardEntry[] {
  const rows = Array.isArray(input.leaderboard) ? input.leaderboard : [];
  return rows.map((row) => {
    const stats = readFlashpeakStatPayload(row.stats ?? {
      scores: row.score === null || row.score === undefined ? [] : [row.score],
      goal: row.goal,
      assist: row.assist,
      passing: row.passing,
      defense: row.defense,
    });
    const validScores = stats.scores.filter((score): score is number => score !== null);
    return {
      playerId: text(row.playerId),
      playerName: text(row.playerName, text(row.playerId)),
      nickname: text(row.nickname, text(row.playerName, text(row.playerId))),
      teamId: text(row.teamId),
      teamName: text(row.teamName, text(row.teamId)),
      position: text(row.position),
      game: nonNegative(row.game, stats.scores.length),
      score: typeof row.score === "number" && Number.isFinite(row.score) ? row.score : validScores.length ? validScores.reduce((sum, score) => sum + score, 0) / validScores.length : null,
      goal: stats.goal,
      assist: stats.assist,
      passing: stats.passing,
      defense: stats.defense,
    };
  });
}
