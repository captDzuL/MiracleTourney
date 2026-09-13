import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { getPublicEventBySlug, getPublicEventSlugRedirect } from "@/lib/platform/repository";
import { renderSchedulePage } from "../../../../events/[slug]/schedule/schedule-page-content";

export const dynamic = "force-dynamic";
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://miracle-league.fun";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const event = await getPublicEventBySlug(slug);
  if (!event) return {};
  const title = `${locale === "id" ? "Jadwal" : "Schedule"} — ${event.name}`;
  const url = `${BASE_URL}/${locale}/events/${slug}/schedule`;
  return { title, alternates: { canonical: url }, openGraph: { title, url } };
}

export default async function LocalizedSchedulePage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale: rawLocale, slug } = await params;
  const locale = rawLocale === "en" ? "en" : "id";
  setRequestLocale(locale);
  const event = await getPublicEventBySlug(slug);
  if (!event) {
    const redirectSlug = await getPublicEventSlugRedirect(slug);
    if (redirectSlug) permanentRedirect(`/${locale}/events/${redirectSlug}/schedule`);
  }
  return renderSchedulePage(slug, locale);
}
