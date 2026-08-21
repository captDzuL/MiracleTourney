import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { getPublicEventBySlug } from "@/lib/platform/repository";
import { renderEventDetailPage } from "../../../events/[slug]/event-detail-page";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://miracle-tourney.vercel.app";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const event = await getPublicEventBySlug(slug);
  if (!event) return {};

  const title = event.name;
  const description = event.description;
  const url = `${BASE_URL}/${locale}/events/${slug}`;
  const ogImage = event.logoUrl ?? event.gameImageUrl;

  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: {
        id: `${BASE_URL}/id/events/${slug}`,
        en: `${BASE_URL}/en/events/${slug}`,
      },
    },
    openGraph: {
      title,
      description,
      url,
      type: "website",
      ...(ogImage ? { images: [{ url: ogImage, width: 1200, height: 630, alt: title }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}

export default async function LocalizedEventDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale as "id" | "en");

  return renderEventDetailPage(slug, locale as "id" | "en");
}
