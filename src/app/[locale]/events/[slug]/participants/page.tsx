import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { getPublicEventBySlug } from "@/lib/platform/repository";
import { renderParticipantsPage } from "../../../../events/[slug]/participants/participants-page";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://miracle-tourney.vercel.app";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const event = await getPublicEventBySlug(slug);
  if (!event) return {};

  const title = `Peserta — ${event.name}`;
  const url = `${BASE_URL}/${locale}/events/${slug}/participants`;

  return {
    title,
    alternates: { canonical: url },
    openGraph: { title, url },
  };
}

export default async function LocalizedParticipantsPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale as "id" | "en");

  return renderParticipantsPage(slug, locale as "id" | "en");
}
