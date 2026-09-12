import type { Standing } from "@/lib/tournament/operations/result-projection";

export type PublicOngoingMatch = {
  id: string; home: string | null; away: string | null; round: number; roundLabel: string;
  phaseId: string; groupId: string | null; bracket: string; bestOf: number;
  status: "scheduled" | "delayed" | "postponed" | "live" | "completed";
  start: string | null; end: string | null; room: string | null; scheduledLabel: string | null;
  homeScore: number | null; awayScore: number | null; resultVersion: number; confirmedAt: string | null;
};
export type PublicOngoingEventViewModel = {
  mode: "ongoing";
  event: { id: string; slug: string; name: string; description: string; timezone: string; format: string };
  matches: PublicOngoingMatch[]; liveMatches: PublicOngoingMatch[]; nextMatches: PublicOngoingMatch[]; recentResults: PublicOngoingMatch[];
  schedule: { version: number; publishedAt: string | null; changes: { matchId: string; before: { start: string; room: string } | null; after: { start: string; room: string } | null }[] } | null;
  standings: { phaseId: string; groupId: string | null; label: string; complete: boolean; qualificationCutline: number | null; rows: (Standing & { name: string })[] }[];
  announcements: { id: string; title: string; body: string; urgency: "info" | "important" | "urgent"; publishedAt: string; endsAt: string | null }[];
  stream: { url: string; label: string; platform: string; isLive: boolean } | null;
  leaderboardHref: string; stateVersion: string; lastUpdatedAt: string;
};
