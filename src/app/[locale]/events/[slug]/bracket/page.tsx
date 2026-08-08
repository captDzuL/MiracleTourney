import { setRequestLocale } from "next-intl/server";

import {
  generateBracketStaticParams,
  renderBracketPage,
} from "../../../../events/[slug]/bracket/bracket-page-content";

export const revalidate = 30;

export async function generateStaticParams() {
  return generateBracketStaticParams();
}

export default async function LocalizedBracketPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale as "id" | "en");

  return renderBracketPage(slug);
}
