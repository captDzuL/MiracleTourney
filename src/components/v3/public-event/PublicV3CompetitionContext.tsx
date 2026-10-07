import React from "react";

import { AdaptiveBracketBoard } from "./AdaptiveBracketBoard";
import type { AdaptivePhaseStanding } from "@/lib/events/adaptive-public-phases";
import type { PublicV3EventViewModel, PublicV3Locale } from "@/lib/events/public-v3-types";

type CompetitionView = Extract<PublicV3EventViewModel, { mode: "ongoing" | "finished" }>;

function formatKind(format: string): string {
  const normalized = format.toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized.includes("round_robin") || normalized.includes("league")) return "round_robin";
  if (normalized.includes("group") && normalized.includes("playoff")) return "group_playoffs";
  return normalized;
}

function numeric(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function boardMatches(view: CompetitionView, format: string) {
  const matches = view.source !== "authoritative" || format === "round_robin"
    ? []
    : format === "group_playoffs"
      ? view.matches.filter((match) => match.isPlayoff === true)
      : view.matches;
  return matches.map((match) => ({
    id: match.id,
    roundLabel: match.roundLabel,
    home: match.home,
    away: match.away,
    status: match.status,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    isPlayoff: match.isPlayoff,
  }));
}

function boardStandings(view: CompetitionView): AdaptivePhaseStanding[] {
  return view.standings.map((table) => ({
    phaseId: String(table.phaseId ?? "TBD"),
    groupId: typeof table.groupId === "string" ? table.groupId : null,
    label: typeof table.label === "string" ? table.label : undefined,
    groupNumber: numeric(table.groupNumber, 0) || null,
    complete: table.complete === true,
    qualificationCutline: numeric(table.qualificationCutline, 0) || null,
    rows: Array.isArray(table.rows) ? table.rows.map((value, index) => {
      const row = value as Record<string, unknown>;
      return {
        teamId: String(row.teamId ?? `team-${index + 1}`),
        name: String(row.name ?? row.teamId ?? "TBD"),
        rank: Math.max(1, Math.floor(numeric(row.rank, index + 1))),
        played: Math.max(0, Math.floor(numeric(row.played, 0))),
        wins: Math.max(0, Math.floor(numeric(row.wins, 0))),
        draws: Math.max(0, Math.floor(numeric(row.draws, 0))),
        losses: Math.max(0, Math.floor(numeric(row.losses, 0))),
        points: numeric(row.points, 0),
        scoreFor: numeric(row.scoreFor, 0),
        scoreAgainst: numeric(row.scoreAgainst, 0),
        scoreDifference: numeric(row.scoreDifference, 0),
        tied: row.tied === true,
      };
    }) : [],
  }));
}

export function PublicV3CompetitionContext({ view, locale }: { view: CompetitionView; locale: PublicV3Locale }) {
  const format = formatKind(view.identity.format);
  return <section data-public-competition-context={format} data-standings={view.standings.length ? "published" : undefined}>
    <AdaptiveBracketBoard
      locale={locale}
      format={format}
      matches={boardMatches(view, format)}
      standings={boardStandings(view)}
      presentation="v3"
    />
  </section>;
}
