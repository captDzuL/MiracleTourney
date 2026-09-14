import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { unstable_cache } from "next/cache";
import { EventDirectory } from "@/components/v3/public-discovery/EventDirectory";
import { loadPublicDiscovery } from "@/lib/events/public-discovery-read";
import { getAllGames, getPublicDiscoveryEvents } from "@/lib/platform/repository";
import { isFeatureEnabled } from "@/lib/feature-flags";

import EventsPage from "../../events/page";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://miracle-league.fun";
const getCachedDiscovery = unstable_cache(getPublicDiscoveryEvents, ["public-discovery-events-v3"], { revalidate: 30 });

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isEn = locale === "en";
  const title = isEn ? "Tournaments" : "Semua Turnamen";
  const description = isEn
    ? "Browse all active and past community tournaments on Miracle League."
    : "Jelajahi semua turnamen komunitas aktif dan selesai di Miracle League.";
  const url = `${BASE_URL}/${locale}/events`;

  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: { id: `${BASE_URL}/id/events`, en: `${BASE_URL}/en/events` },
    },
    openGraph: { title, description, url },
  };
}

export default async function LocalizedEventsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ game?: string; status?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as "id" | "en");

  if (isFeatureEnabled("public_discovery_v3")) {
    const [discovery, query] = await Promise.all([loadPublicDiscovery(getCachedDiscovery), searchParams]);
    return <EventDirectory locale={locale === "en" ? "en" : "id"} entries={discovery.entries} games={getAllGames()} filters={{ game: query?.game ?? "all", status: query?.status ?? "all" }} loadState={discovery.loadState} />;
  }

  return <EventsPage searchParams={searchParams} />;
}
