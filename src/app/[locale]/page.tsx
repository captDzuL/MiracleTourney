import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { HomePageContent } from "../home-page-content";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://miracle-league.fun";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isEn = locale === "en";

  return {
    title: "Miracle League",
    description: isEn
      ? "Community multi-game tournament platform. Join, compete, and follow live brackets."
      : "Platform turnamen komunitas multi-game. Daftar, bertanding, dan pantau bracket langsung.",
    alternates: {
      canonical: `${BASE_URL}/${locale}`,
      languages: { id: `${BASE_URL}/id`, en: `${BASE_URL}/en` },
    },
  };
}

export default async function LocalizedHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ game?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as "id" | "en");

  return <HomePageContent searchParams={searchParams} />;
}
