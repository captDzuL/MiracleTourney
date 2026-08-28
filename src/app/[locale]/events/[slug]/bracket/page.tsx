import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { getPublicEventBySlug } from "@/lib/platform/repository";
import { renderBracketPage } from "../../../../events/[slug]/bracket/bracket-page-content";

export const dynamic = "force-dynamic";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://miracle-tourney.vercel.app";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const event = await getPublicEventBySlug(slug);
  if (!event) return {};

  const title = `Bracket — ${event.name}`;
  const url = `${BASE_URL}/${locale}/events/${slug}/bracket`;

  return {
    title,
    alternates: { canonical: url },
    openGraph: { title, url },
  };
}

export default async function LocalizedBracketPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale as "id" | "en");

  return renderBracketPage(slug, locale as "id" | "en");
}
