import { ArrowRight } from "lucide-react";
import { chooseFeaturedDiscoveryEvent, filterDiscoveryEvents, getPublicDiscoveryStage, groupDiscoveryEvents, type PublicDiscoveryEvent } from "@/lib/events/public-discovery";
import { publicV3LocalizedHref, publicV3RouteTarget, resolvePublicV3Route, type PublicV3Locale } from "@/lib/events/public-v3-types";
import type { Game } from "@/lib/platform/types";
import { PublicV3Frame } from "./PublicV3Frame";
import { PublicV3Action, PublicV3Count, PublicV3EmptyState, PublicV3Eyebrow, PublicV3SectionHeading, PublicV3Tabs } from "./PublicV3Primitives";
import { EventDirectoryCard } from "./EventDirectoryCard";
import { homeCopy } from "./home-copy";
import { directoryCopy } from "./directory-copy";

export type EventDirectoryProps = {
  locale: PublicV3Locale;
  entries: readonly PublicDiscoveryEvent[];
  games: readonly Game[];
  filters: { game: string; status: string };
  loadState: "ready" | "error";
};

export function EventDirectory({ locale, entries, games, filters, loadState }: EventDirectoryProps) {
  const t = directoryCopy[locale];
  const shared = homeCopy[locale];
  const localized = (path: string) => publicV3LocalizedHref(path)[locale];
  const failed = loadState === "error";
  const available = failed ? [] : entries;
  const featured = chooseFeaturedDiscoveryEvent(available);
  const grouped = groupDiscoveryEvents(available);
  const counts = { all: available.length, ongoing: grouped.ongoing.length, upcoming: grouped.upcoming.length, finished: grouped.finished.length, registration: grouped.upcoming.filter((entry) => getPublicDiscoveryStage(entry) === "registration").length, drawing: grouped.upcoming.filter((entry) => getPublicDiscoveryStage(entry) === "drawing").length };
  const filtered = filterDiscoveryEvents(available, filters);
  const groups = groupDiscoveryEvents(filtered);
  const href = (next: Partial<typeof filters> = {}) => {
    const selected = { ...filters, ...next };
    const query = new URLSearchParams();
    if (selected.game !== "all") query.set("game", selected.game);
    if (selected.status !== "all") query.set("status", selected.status);
    return localized(`/events${query.size ? `?${query}` : ""}`);
  };
  const statuses = [["all", t.all], ["ongoing", t.ongoing], ["upcoming", t.upcoming], ["registration", t.registration], ["drawing", t.drawing], ["finished", t.finished]] as const;
  return <PublicV3Frame className="mpv3-directory" brandHref={localized("/")} homeLabel={shared.home} skipLabel={shared.skip} navigationLabel={shared.mainNav} navigation={[{ href: localized("/"), label: shared.home }, ...(featured ? [{ href: resolvePublicV3Route(publicV3RouteTarget(featured.event.slug, "overview"), locale), label: shared.featured }] : []), { href: localized("/events"), label: t.allEvents, active: true }]}
    headerEnd={<PublicV3Action href={localized("/login")}>{shared.login}<ArrowRight aria-hidden="true" /></PublicV3Action>}
    footer={<><span>MIRACLE</span><p>{shared.footer}</p></>}>
    <nav className="mpv3-directory-breadcrumb" aria-label={locale === "id" ? "Jejak halaman" : "Breadcrumb"}><a href={localized("/")}>{shared.home}</a><span aria-hidden="true">/</span><span>Event Center</span></nav>
    <div className="mpv3-directory-heading">
      <div><PublicV3Eyebrow>MIRACLE / EVENT ARCHIVE</PublicV3Eyebrow><h1>{t.titleFirst}<br />{t.titleSecond}</h1><p>{t.description}</p></div>
      <div className="mpv3-directory-counts">{([["all", t.total], ["ongoing", t.ongoing], ["upcoming", t.upcoming], ["finished", t.finished]] as const).map(([key, label]) => <PublicV3Count key={key} value={failed ? null : counts[key]} fallback={"\u2014"} label={label} />)}</div>
    </div>
    <div className="mpv3-directory-toolbar"><PublicV3Tabs label={t.statusFilters} variant="segmented" items={statuses.map(([key, label]) => ({ href: href({ status: key }), label: `${label} ${failed ? "\u2014" : counts[key]}`, active: filters.status === key }))} /><p>{t.order}</p></div>
    <PublicV3Tabs label={t.gameFilters} variant="segmented" items={[{ id: "all", name: shared.allGames }, ...games].map((game) => ({ href: href({ game: game.id }), label: game.name, active: filters.game === game.id }))} />
    {failed || !filtered.length ? <div role={failed ? "alert" : "status"}><PublicV3EmptyState title={failed ? t.unavailable : shared.empty} description={failed ? shared.error : t.emptyGroup} action={<PublicV3Action href={failed ? href() : localized("/events")}>{failed ? t.retry : t.reset}</PublicV3Action>} /></div> : null}
    {!failed && ([["ongoing", t.primary, groups.ongoing], ["upcoming", shared.upcoming, groups.upcoming], ["finished", t.archive, groups.finished]] as const).map(([key, label, rows], index) => <section className="mpv3-section" data-lifecycle={key} aria-labelledby={`directory-${key}`} key={key}>
      <PublicV3SectionHeading id={`directory-${key}`} title={label} number={`0${index + 1}`} action={<span className="mpv3-directory-group-count">{rows.length}</span>} />
      {rows.length ? <div className="mpv3-card-grid mpv3-directory-grid">{rows.map((entry) => <EventDirectoryCard key={entry.event.id} entry={entry} games={games} locale={locale} />)}</div> : <p className="mpv3-group-empty">{t.emptyGroup}</p>}
    </section>)}
  </PublicV3Frame>;
}
