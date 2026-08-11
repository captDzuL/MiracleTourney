import { setRequestLocale } from "next-intl/server";

import { renderBracketPage } from "../../../../events/[slug]/bracket/bracket-page-content";

export const dynamic = "force-dynamic";

export default async function LocalizedBracketPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale as "id" | "en");

  return renderBracketPage(slug);
}
