import { setRequestLocale } from "next-intl/server";

import { renderStandingsPage } from "../../../../events/[slug]/standings/standings-page";

export default async function LocalizedStandingsPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale as "id" | "en");

  return renderStandingsPage(slug);
}
