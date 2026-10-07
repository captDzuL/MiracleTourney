import React from "react";
import { PublicV3Tabs } from "@/components/v3/public-discovery/PublicV3Primitives";
import type { PublicV3EventViewModel, PublicV3Locale } from "@/lib/events/public-v3-types";

const labels = {
  id: {
    navigation: "Navigasi event",
    overview: "Ringkasan",
    participants: "Peserta",
    schedule: "Jadwal",
    bracket: "Bracket",
    standings: "Standings",
    leaderboard: "Leaderboard",
  },
  en: {
    navigation: "Event navigation",
    overview: "Overview",
    participants: "Participants",
    schedule: "Schedule",
    bracket: "Bracket",
    standings: "Standings",
    leaderboard: "Leaderboard",
  },
} as const;

export function PublicV3EventNavigation({ view, locale }: { view: PublicV3EventViewModel; locale: PublicV3Locale }) {
  const t = labels[locale];
  const items = [
    { href: view.navigation.targets.overview.hrefByLocale[locale], label: t.overview, active: true },
    { href: view.navigation.targets.participants.hrefByLocale[locale], label: t.participants },
    ...(view.navigation.schedule && (view.mode !== "drawing" || Boolean(view.schedule))
      ? [{ href: view.navigation.targets.schedule.hrefByLocale[locale], label: t.schedule }]
      : []),
    ...(view.navigation.bracket
      ? [{ href: view.navigation.targets.bracket.hrefByLocale[locale], label: t.bracket }]
      : view.navigation.leaderboard
        ? [{ href: view.navigation.targets.standings.hrefByLocale[locale], label: t.standings }]
        : []),
    ...(view.navigation.leaderboard
      ? [{ href: view.navigation.targets.leaderboard.hrefByLocale[locale], label: t.leaderboard }]
      : []),
  ];
  return <div data-event-navigation><PublicV3Tabs label={t.navigation} items={items} /></div>;
}
