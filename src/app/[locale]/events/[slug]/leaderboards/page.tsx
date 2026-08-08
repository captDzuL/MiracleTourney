import { setRequestLocale } from "next-intl/server";

import { renderLeaderboardsPage } from "../../../../events/[slug]/leaderboards/leaderboards-page";

export default async function LocalizedLeaderboardsPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale as "id" | "en");

  return renderLeaderboardsPage(slug);
}
