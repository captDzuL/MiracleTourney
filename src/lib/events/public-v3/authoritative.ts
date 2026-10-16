// Projection of authoritative competition data into a public V3 event.
// Moved out of public-v3-read.ts without changes (refactor Phase 4, 4c-v3read).

import type { RegistrationCta, RegistrationViewerState } from "@/lib/events/adaptive-public-event";
import type { CompatiblePublicTeam, PublicV3BracketSlot, PublicV3Certificate, PublicV3LeaderboardEntry, PublicV3Match, PublicV3Shared } from "@/lib/events/public-v3-types";
import { dateText, nonNegative, publicBracketKind, record, text } from "@/lib/events/public-v3/basics";
import type { AnyRecord } from "@/lib/events/public-v3/basics";
import { publicScore } from "@/lib/events/public-v3/parts";
import { mapRegistrationCta, registrationState } from "@/lib/events/public-v3/registration";
import { authoritativeUpdates } from "@/lib/events/public-v3/updates";
import { readFlashpeakStatPayload } from "@/lib/player-stats/flashpeak";

export function teamsFromRaw(value: unknown): CompatiblePublicTeam[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = record(entry);
    const id = text(row.id);
    if (!id) return [];
    const count = publicScore(record(row._count).players);
    return [{
      id,
      name: text(row.name, id),
      tag: typeof row.tag === "string" ? row.tag : null,
      logoUrl: typeof row.logoUrl === "string" ? row.logoUrl : null,
      players: Array.isArray(row.players) ? row.players : count ?? undefined,
    }];
  });
}

export function projectPublicV3AuthoritativeMatch(value: unknown): PublicV3Match {
  const row = record(value);
  const rawStatus = text(row.status).toLowerCase();
  const resultVersion = nonNegative(row.resultVersion);
  const official = row.official === true || resultVersion > 0 || rawStatus === "completed" || rawStatus === "complete";
  const status: PublicV3Match["status"] = official
    ? "completed"
    : rawStatus === "live" ? "live"
      : rawStatus === "delayed" ? "delayed"
        : rawStatus === "postponed" ? "postponed" : "scheduled";
  const round = Math.floor(nonNegative(row.round));
  const home = text(row.home, text(row.homeTeamId)) || null;
  const away = text(row.away, text(row.awayTeamId)) || null;
  const bracket = publicBracketKind(row.bracket);
  return {
    id: text(row.id, "TBD"),
    roundLabel: text(row.roundLabel, round > 0 ? "Round " + round : "Match"),
    round: round > 0 ? round : null,
    phaseId: text(row.phaseId) || null,
    groupId: text(row.groupId) || null,
    groupNumber: publicScore(row.groupNumber),
    ...(typeof row.isPlayoff === "boolean" ? { isPlayoff: row.isPlayoff } : {}),
    bracket,
    home,
    away,
    status,
    homeScore: official ? publicScore(row.homeScore) : null,
    awayScore: official ? publicScore(row.awayScore) : null,
    start: dateText(row.start, dateText(row.scheduledAt)),
    end: dateText(row.end, dateText(row.scheduledEndsAt)),
    room: text(row.room, text(row.scheduleRoom)) || null,
    bestOf: Math.max(1, Math.floor(nonNegative(row.bestOf, 1))),
    official,
  };
}

export function authoritativeMatches(value: unknown): PublicV3Match[] {
  return Array.isArray(value) ? value.map(projectPublicV3AuthoritativeMatch) : [];
}

export function authoritativeBracketSlots(matches: PublicV3Match[]): PublicV3BracketSlot[] {
  return matches.map((match) => ({
    id: match.id,
    roundLabel: match.roundLabel,
    home: match.home ?? "TBD",
    away: match.away ?? "TBD",
    status: match.status === "live" ? "live" : match.status === "completed" ? "completed" : "scheduled",
    homeScore: match.official ? match.homeScore : null,
    awayScore: match.official ? match.awayScore : null,
    official: match.official,
  }));
}

export function authoritativeSeeds(value: unknown): Array<{ teamId: string; teamName: string; seed: number }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = record(entry);
    const teamId = text(row.teamId);
    const seed = publicScore(row.seed);
    if (!teamId || seed === null) return [];
    return [{ teamId, teamName: text(row.teamName, teamId), seed: Math.floor(seed) }];
  });
}

export function authoritativeDrawingStandings(value: unknown): Array<{ phaseId: string; groupId: string | null; rows: Array<Record<string, unknown>> }> {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const row = record(entry);
    const output = {
      phaseId: text(row.phaseId, "TBD"),
      groupId: typeof row.groupId === "string" ? row.groupId : null,
      rows: Array.isArray(row.rows) ? row.rows.map((standing) => ({ ...record(standing) })) : [],
    };
    return {
      ...output,
      ...(publicScore(row.groupNumber) !== null ? { groupNumber: publicScore(row.groupNumber) } : {}),
      ...(typeof row.label === "string" && row.label.trim() ? { label: row.label } : {}),
      ...(typeof row.complete === "boolean" ? { complete: row.complete } : {}),
      ...(publicScore(row.qualificationCutline) !== null ? { qualificationCutline: publicScore(row.qualificationCutline) } : {}),
    };
  });
}

export function authoritativeOngoingStandings(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const row = record(entry);
    return {
      phaseId: text(row.phaseId, "TBD"),
      groupId: typeof row.groupId === "string" ? row.groupId : null,
      groupNumber: publicScore(row.groupNumber),
      label: text(row.label),
      complete: row.complete === true,
      qualificationCutline: publicScore(row.qualificationCutline),
      rows: Array.isArray(row.rows) ? row.rows.map((standing) => ({ ...record(standing) })) : [],
    };
  });
}

export function authoritativeDrawingSchedule(value: unknown): { version: number; publishedAt: string | null } | null {
  const row = record(value);
  if (!Object.keys(row).length) return null;
  return {
    version: Math.max(0, Math.floor(nonNegative(row.version))),
    publishedAt: dateText(row.publishedAt),
  };
}

export function authoritativeOngoingSchedule(value: unknown): { version: number; publishedAt: string | null; changes: Array<Record<string, unknown>> } | null {
  const row = record(value);
  if (!Object.keys(row).length) return null;
  return {
    version: Math.max(0, Math.floor(nonNegative(row.version))),
    publishedAt: dateText(row.publishedAt),
    changes: Array.isArray(row.changes) ? row.changes.map((change) => ({ ...record(change) })) : [],
  };
}

export function authoritativeStream(value: unknown): { url: string; label: string; platform: string; isLive: boolean } | null {
  const row = record(value);
  const url = text(row.url);
  return url ? { url, label: text(row.label, "Live stream"), platform: text(row.platform, "external"), isLive: row.isLive === true } : null;
}

export function authoritativeLeaderboard(value: unknown): PublicV3LeaderboardEntry[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const row = record(entry);
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
      game: Math.floor(nonNegative(row.game, stats.scores.length)),
      score: publicScore(row.score) ?? (validScores.length ? validScores.reduce((sum, score) => sum + score, 0) / validScores.length : null),
      goal: stats.goal,
      assist: stats.assist,
      passing: stats.passing,
      defense: stats.defense,
    };
  });
}

export function authoritativeCertificate(value: unknown, type: string, recipientKind: "team" | "player", recipientId: string, recipientName: string): PublicV3Certificate | null {
  const row = record(value);
  const publishedUrl = text(row.publishedUrl);
  const verificationCode = text(row.verificationCode);
  if (!publishedUrl || !verificationCode) return null;
  return {
    id: text(row.id, verificationCode),
    type,
    recipientKind,
    recipientId: text(row.recipientId, recipientId),
    recipientName: text(row.recipientName, recipientName),
    publishedUrl,
    verificationCode,
  };
}

export function authoritativeRegistrationCta(value: unknown): { state: RegistrationViewerState; cta: RegistrationCta } {
  const row = record(value);
  const state = registrationState(row.state);
  const fallback: RegistrationCta = { kind: "disabled", label: "registration_unavailable", reason: "registration_unavailable", enabled: false };
  return { state, cta: mapRegistrationCta(row.cta, fallback) };
}

export function normalizedUpdates(raw: AnyRecord, persisted: PublicV3Shared["updates"]): PublicV3Shared["updates"] {
  return persisted.length ? persisted : authoritativeUpdates(raw.announcements ?? raw.updates);
}
