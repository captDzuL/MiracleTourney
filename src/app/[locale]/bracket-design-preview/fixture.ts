import type { SocialBracketModel, BracketTeam } from "@/lib/bracket/types";

const names = ["Rising Comets", "Metro Lions", "Scorch United", "Blitz Yard", "Thunder Street", "Solaris Crew", "Vortex FC", "Cobalt Eleven"];
const teams: BracketTeam[] = names.map((name, i) => ({
  id: `team-${i + 1}`, name, initials: name.split(" ").map(word => word[0]).join(""),
  logoUrl: i === 0 ? "/logo/miracle-preview.png" : i === 1 ? "/unavailable-team-logo.png" : null,
}));
const slot = (index: number, sourceMatchId: string | null = null) => ({ team: teams[index], label: teams[index].name, sourceMatchId, outcome: sourceMatchId ? "winner" as const : null });

export function bracketDesignFixture(locale: "id" | "en" = "id", finished = true): SocialBracketModel {
  const label = locale === "id" ? ["Perempat Final", "Semifinal", "Final"] : ["Quarterfinal", "Semifinal", "Final"];
  return {
    event: { id: "design-preview", slug: "miracle-s3", name: "Miracle FC League · Season 3", logoUrl: "/logo/miracle-preview.png", format: "Single Elimination", status: finished ? "Finished" : "Ongoing" },
    locale, appearance: { backgroundUrl: null, positionX: 50, positionY: 50, overlay: 35 }, preview: true,
    champion: finished ? teams[0] : null,
    matches: [
      ...[0, 1, 2, 3].map(i => ({
        id: `qf-${i + 1}`, roundKey: "single:1", roundLabel: label[0], round: 1, slot: i + 1, bracket: "single",
        home: slot(i * 2), away: slot(i * 2 + 1), homeScore: 2, awayScore: i === 1 ? 1 : 0,
        winnerTeamId: teams[i * 2].id, status: "completed" as const, bestOf: 3, schedule: null,
        games: [{ number: 1, homeScore: 3, awayScore: 1 }, { number: 2, homeScore: 2, awayScore: 0 }],
      })),
      ...[0, 1].map(i => ({
        id: `sf-${i + 1}`, roundKey: "single:2", roundLabel: label[1], round: 2, slot: i + 1, bracket: "single",
        home: slot(i * 4, `qf-${i * 2 + 1}`), away: slot(i * 4 + 2, `qf-${i * 2 + 2}`),
        homeScore: finished ? 2 : null, awayScore: finished ? 1 : null, winnerTeamId: finished ? teams[i * 4].id : null,
        status: finished ? "completed" as const : i === 0 ? "live" as const : "scheduled" as const,
        bestOf: 3, schedule: "2026-10-05T12:00:00.000Z", games: [],
      })),
      {
        id: "final", roundKey: "single:3", roundLabel: label[2], round: 3, slot: 1, bracket: "single",
        home: finished ? slot(0, "sf-1") : { team: null, label: locale === "id" ? "Pemenang Match 5" : "Winner of Match 5", sourceMatchId: "sf-1", outcome: "winner" },
        away: finished ? slot(4, "sf-2") : { team: null, label: locale === "id" ? "Pemenang Match 6" : "Winner of Match 6", sourceMatchId: "sf-2", outcome: "winner" },
        homeScore: finished ? 3 : null, awayScore: finished ? 1 : null, winnerTeamId: finished ? teams[0].id : null,
        status: finished ? "completed" : "scheduled", bestOf: 5, schedule: null, games: [],
      },
    ],
  };
}
