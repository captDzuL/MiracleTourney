import type { Event } from "@/lib/platform/types";

export type PublicDiscoveryEvent = {
  event: Event;
  phaseStatus: "draft" | "active" | "completed" | null;
  hasLiveMatch: boolean;
  teamCount: number;
  updatedAt: string;
};

export type PublicDiscoveryStage = "ongoing" | "drawing" | "registration" | "finished";

export function getPublicDiscoveryStage(item: PublicDiscoveryEvent): PublicDiscoveryStage {
  if (item.event.status === "Ongoing") return "ongoing";
  if (item.event.status === "Finished") return "finished";
  if (item.event.status === "Registration Closed" || item.phaseStatus === "active") return "drawing";
  return "registration";
}

function priority(item: PublicDiscoveryEvent) {
  return {
    ongoing: 0,
    drawing: 1,
    registration: 2,
    finished: 3,
  }[getPublicDiscoveryStage(item)];
}

export function sortDiscoveryEvents(
  entries: readonly PublicDiscoveryEvent[],
): PublicDiscoveryEvent[] {
  return [...entries].sort((left, right) => {
    const stageOrder = priority(left) - priority(right);
    if (stageOrder) return stageOrder;
    if (getPublicDiscoveryStage(left) === "ongoing" && left.hasLiveMatch !== right.hasLiveMatch) {
      return left.hasLiveMatch ? -1 : 1;
    }
    if (getPublicDiscoveryStage(left) === "finished") {
      const recent = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
      if (recent) return recent;
    }
    return left.event.slug.localeCompare(right.event.slug);
  });
}

export function chooseFeaturedDiscoveryEvent(
  entries: readonly PublicDiscoveryEvent[],
): PublicDiscoveryEvent | null {
  return sortDiscoveryEvents(entries)[0] ?? null;
}

export function groupDiscoveryEvents(entries: readonly PublicDiscoveryEvent[]) {
  const ordered = sortDiscoveryEvents(entries);
  return {
    ongoing: ordered.filter((entry) => getPublicDiscoveryStage(entry) === "ongoing"),
    upcoming: ordered.filter((entry) => ["drawing", "registration"].includes(getPublicDiscoveryStage(entry))),
    finished: ordered.filter((entry) => getPublicDiscoveryStage(entry) === "finished"),
  };
}

export function filterDiscoveryEvents(
  entries: readonly PublicDiscoveryEvent[],
  filters: { game: string; status: string },
) {
  return sortDiscoveryEvents(entries).filter((entry) => {
    if (filters.game !== "all" && entry.event.gameId !== filters.game) return false;
    const stage = getPublicDiscoveryStage(entry);
    if (filters.status === "all") return true;
    if (filters.status === "upcoming") return stage === "drawing" || stage === "registration";
    return stage === filters.status;
  });
}
