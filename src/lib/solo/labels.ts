import { normalizeKey } from "./normalize";
import type { SlotCounts, SoloQuotaSnapshot } from "./registration-types";

const INDONESIAN: Readonly<Record<string, string>> = {
  goalkeeper: "Kiper",
};

/** A position as a reader should see it. Only the words with an everyday Indonesian name are translated. */
export function positionLabel(position: string, locale: "id" | "en"): string {
  const trimmed = position.trim();
  return (locale === "id" ? INDONESIAN[normalizeKey(trimmed)] : undefined) ?? trimmed;
}

/** All slots of an event added up, or null when the counts are not known. */
export function soloTotals(snapshot: SoloQuotaSnapshot | null | undefined): SlotCounts | null {
  if (!snapshot) return null;
  return {
    quota: snapshot.required.quota + snapshot.open.quota,
    held: snapshot.required.held + snapshot.open.held,
    queued: snapshot.required.queued + snapshot.open.queued,
  };
}
