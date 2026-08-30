import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { getPublicEventBySlug } from "@/lib/platform/repository";
import { renderLeaderboardsPage } from "../../../../events/[slug]/leaderboards/leaderboards-page";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://miracle-league.fun";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const event = await getPublicEventBySlug(slug);
  if (!event) return {};

  const title = `Leaderboard — ${event.name}`;
  const url = `${BASE_URL}/${locale}/events/${slug}/leaderboards`;

  return {
    title,
    alternates: { canonical: url },
    openGraph: { title, url },
  };
}

export default async function LocalizedLeaderboardsPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale as "id" | "en");

  return renderLeaderboardsPage(slug, locale as "id" | "en");
}
