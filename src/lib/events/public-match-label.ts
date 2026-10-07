import type { PublicOngoingMatch } from "./public-ongoing-types";

export function publicGroupLabel(groupNumber: number, locale: "id" | "en") {
  return `${locale === "id" ? "Grup" : "Group"} ${String.fromCharCode(64 + groupNumber)}`;
}

/** Display labels come from the typed graph, never the legacy storage label. */
export function publicMatchLabel(match: PublicOngoingMatch, locale: "id" | "en") {
  const id = locale === "id";
  const brackets = id
    ? { single: "Eliminasi", upper: "Bagan atas", lower: "Bagan bawah", grand_final: "Final utama", third_place: "Perebutan tempat ketiga", round_robin: "Liga" }
    : { single: "Elimination", upper: "Upper bracket", lower: "Lower bracket", grand_final: "Grand final", third_place: "Third place", round_robin: "League" };
  const stage = match.groupNumber ? publicGroupLabel(match.groupNumber, locale) : brackets[match.bracket];
  const round = ["grand_final", "third_place"].includes(match.bracket) ? "" : ` · ${id ? "Babak" : "Round"} ${match.round}`;
  return `${match.isPlayoff ? id ? "Playoff · " : "Playoffs · " : ""}${stage}${round}`;
}
