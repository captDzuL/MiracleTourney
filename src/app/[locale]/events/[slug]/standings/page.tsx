import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { getPublicEventBySlug } from "@/lib/platform/repository";
import { renderStandingsPage } from "../../../../events/[slug]/standings/standings-page";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://miracle-tourney.vercel.app";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const event = await getPublicEventBySlug(slug);
  if (!event) return {};

  const title = `Klasemen — ${event.name}`;
  const url = `${BASE_URL}/${locale}/events/${slug}/standings`;

  return {
    title,
    alternates: { canonical: url },
    openGraph: { title, url },
  };
}

export default async function LocalizedStandingsPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale as "id" | "en");

  return renderStandingsPage(slug);
}
