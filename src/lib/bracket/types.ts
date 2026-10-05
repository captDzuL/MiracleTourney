export type BracketAppearance = { backgroundUrl: string | null; positionX: number; positionY: number; overlay: number };
export type BracketTeam = { id: string; name: string; logoUrl: string | null; initials: string };
export type BracketSlot = { team: BracketTeam | null; label: string; sourceMatchId: string | null; outcome: "winner" | "loser" | null };
export type SocialBracketMatch = {
  id: string; roundKey: string; roundLabel: string; round: number; slot: number; bracket: string;
  home: BracketSlot; away: BracketSlot; homeScore: number | null; awayScore: number | null;
  winnerTeamId: string | null; status: "scheduled" | "live" | "completed" | "delayed" | "postponed" | "bye";
  bestOf: number; schedule: string | null; games: Array<{ number: number; homeScore: number; awayScore: number }>;
};
export type SocialBracketModel = {
  event: { id: string; slug: string; name: string; logoUrl: string | null; format: string; status: string };
  locale: "id" | "en"; appearance: BracketAppearance; matches: SocialBracketMatch[];
  champion: BracketTeam | null; preview: boolean;
};
