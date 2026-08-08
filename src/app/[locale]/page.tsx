import { setRequestLocale } from "next-intl/server";

import { HomePageContent } from "../home-page-content";

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
