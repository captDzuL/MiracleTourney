import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { permanentRedirect } from "next/navigation";

import { PublicV3EventPage } from "@/components/v3/public-event/PublicV3EventPage";
import { getSessionUser } from "@/lib/auth/session";
import { readPublicV3Event } from "@/lib/events/public-v3-read";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { serializeJsonLd } from "@/lib/seo/json-ld";
import { getPublicEventBySlug, getPublicEventSlugRedirect } from "@/lib/platform/repository";
import { readEventForMetadata } from "@/lib/events/public-event-metadata";
import { renderEventDetailPage } from "../../../events/[slug]/event-detail-page";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://miracle-league.fun";


export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const event = await readEventForMetadata(slug);
  if (!event) return {};

  const ogImage = isFeatureEnabled("adaptive_public_event_v3")
    ? (event.activeVisualAsset?.status === "approved" && event.activeVisualAsset.url ? event.activeVisualAsset.url : null)
      ?? event.gameImageUrl ?? event.logoUrl
    : event.logoUrl ?? event.gameImageUrl;

  const title = event.name;
  const description = event.description;
  const url = `${BASE_URL}/${locale}/events/${slug}`;

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
  const { locale: rawLocale, slug } = await params;
  const locale = rawLocale === "en" ? "en" : "id";
  setRequestLocale(locale);
  const event = await getPublicEventBySlug(slug);
  if (!event) {
    const redirectSlug = await getPublicEventSlugRedirect(slug);
    if (redirectSlug) permanentRedirect(`/${locale}/events/${redirectSlug}`);
  }

  if (event && isFeatureEnabled("adaptive_public_event_v3") && ["Published", "Registration Closed", "Ongoing", "Finished"].includes(event.status)) {
    try {
      let viewer: Awaited<ReturnType<typeof getSessionUser>> = null;
      try {
        viewer = await getSessionUser();
      } catch {
        // Public event data remains readable when the optional session lookup is unavailable.
      }
      const view = await readPublicV3Event(slug, viewer);
      if (view) {
        const jsonLd = {
          "@context": "https://schema.org",
          "@type": "SportsEvent",
          name: view.identity.title,
          description: view.identity.description,
          location: { "@type": "Place", name: view.identity.facts.venue },
          organizer: { "@type": "Organization", name: view.identity.organizer.name },
          sport: view.identity.game.name,
          ...(view.identity.facts.startsAt !== "TBD" ? { startDate: view.identity.facts.startsAt } : {}),
          ...(view.identity.facts.prize ? { prize: view.identity.facts.prize } : {}),
        };
        return <>
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
          <PublicV3EventPage view={view} locale={locale} />
        </>;
      }
      return <PublicV3EventPage view={null} locale={locale} error />;
    } catch {
      return <PublicV3EventPage view={null} locale={locale} error />;
    }
  }

  return renderEventDetailPage(slug, locale, event ?? undefined);
}
