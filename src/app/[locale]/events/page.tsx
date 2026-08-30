import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import EventsPage from "../../events/page";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://miracle-league.fun";

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

  return <EventsPage searchParams={searchParams} />;
}
