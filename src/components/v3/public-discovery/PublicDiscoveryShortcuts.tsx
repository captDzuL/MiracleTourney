import { ArrowUpRight, BarChart3, CalendarDays, ListTree, Trophy, Users } from "lucide-react";
import { resolvePublicV3Route, type PublicV3EventViewModel, type PublicV3Locale } from "@/lib/events/public-v3-types";
import { PublicV3SectionHeading } from "./PublicV3Primitives";
import { homeCopy } from "./home-copy";

export function PublicDiscoveryShortcuts({ view, locale }: { view: PublicV3EventViewModel; locale: PublicV3Locale }) {
  const t = homeCopy[locale];
  const items = [
    { key: "overview", label: t.overview, icon: Trophy },
    { key: "participants", label: t.participants, icon: Users },
    { key: "schedule", label: t.schedule, icon: CalendarDays },
    { key: "bracket", label: t.bracket, icon: ListTree },
    { key: "leaderboard", label: t.leaderboard, icon: BarChart3 },
  ] as const;
  return <section className="mpv3-section"><PublicV3SectionHeading title={t.arena} number="01" />
    <nav aria-label={t.nav} className="mpv3-quick-grid">{items.map(({ key, label, icon: Icon }, index) => {
      const content = <><Icon aria-hidden="true" /><ArrowUpRight aria-hidden="true" className="mpv3-quick-arrow" /><h3>{label}</h3><p>{view.navigation[key] ? t.descriptions[index] : t.pending}</p></>;
      return view.navigation[key] ? <a key={key} className="mpv3-quick-card" href={resolvePublicV3Route(view.navigation.targets[key], locale)}>{content}</a> : <div key={key} className="mpv3-quick-card" aria-disabled="true">{content}</div>;
    })}</nav>
  </section>;
}
