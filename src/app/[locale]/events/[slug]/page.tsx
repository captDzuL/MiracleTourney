import { setRequestLocale } from "next-intl/server";

import { renderEventDetailPage } from "../../../events/[slug]/event-detail-page";

export default async function LocalizedEventDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale as "id" | "en");

  return renderEventDetailPage(slug, locale as "id" | "en");
}
