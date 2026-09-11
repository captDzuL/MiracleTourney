import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { permanentRedirect } from "next/navigation";

import { AdaptiveRegistrationEventPage } from "@/components/v3/public-event/AdaptiveRegistrationEventPage";
import type { AdaptiveEventCopy } from "@/components/v3/public-event/PublicEventHero";
import { getSessionUser } from "@/lib/auth/session";
import { getAdaptivePublicEventViewWithRetry, shouldUseAdaptiveRegistrationRenderer } from "@/lib/events/adaptive-public-event";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { serializeJsonLd } from "@/lib/seo/json-ld";
import { getPublicEventBySlug, getPublicEventSlugRedirect } from "@/lib/platform/repository";
import { renderEventDetailPage } from "../../../events/[slug]/event-detail-page";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://miracle-league.fun";


export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const event = await getPublicEventBySlug(slug);
  if (!event) return {};

  let ogImage = event.logoUrl ?? event.gameImageUrl;
  if (isFeatureEnabled("adaptive_public_event_v3")) {
    const adaptive = await getAdaptivePublicEventViewWithRetry(slug, null).catch(() => null);
    if (adaptive && shouldUseAdaptiveRegistrationRenderer({
      enabled: true,
      status: event.status,
      availability: adaptive.registration.availability,
    })) {
      ogImage = adaptive.event.posterUrl ?? adaptive.event.logoUrl ?? undefined;
    }
  }

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

async function getAdaptiveCopy(locale: "id" | "en"): Promise<AdaptiveEventCopy> {
  const t = await getTranslations({ locale, namespace: "adaptiveEvent" });
  return {
    registrationOpen: t("registrationOpen"),
    registrationUpcoming: t("registrationUpcoming"),
    registrationFull: t("registrationFull"),
    registrationClosed: t("registrationClosed"),
    organizedBy: t("organizedBy"),
    verified: t("verified"),
    share: t("share"),
    startsAt: t("startsAt"),
    timezone: t("timezone"),
    venue: t("venue"),
    prize: t("prize"),
    slots: t("slots"),
    summary: t("summary"),
    participants: t("participants"),
    requirements: t("requirements"),
    organizer: t("organizer"),
    registrationPeriod: t("registrationPeriod"),
    opens: t("opens"),
    closes: t("closes"),
    capacity: t("capacity"),
    activeTeams: t("activeTeams"),
    pendingReview: t("pendingReview"),
    remaining: t("remaining"),
    fee: t("fee"),
    feeFree: t("feeFree"),
    feePaid: t("feePaid"),
    roster: t("roster"),
    rosterValue: t.raw("rosterValue"),
    uidIgn: t("uidIgn"),
    howToTitle: t("howToTitle"),
    steps: t.raw("steps") as string[],
    description: t("description"),
    format: t("format"),
    contact: t("contact"),
    contactHint: t("contactHint"),
    importantInfo: t("importantInfo"),
    teamCount: t.raw("teamCount"),
    publicTitle: t("publicTitle"),
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

  if (event && isFeatureEnabled("adaptive_public_event_v3") && ["Published", "Registration Closed"].includes(event.status)) {
    const viewer = await getSessionUser();
    const adaptive = await getAdaptivePublicEventViewWithRetry(slug, viewer).catch(() => null);
    if (adaptive && shouldUseAdaptiveRegistrationRenderer({
      enabled: true,
      status: event.status,
      availability: adaptive.registration.availability,
    })) {
      const copy = await getAdaptiveCopy(locale);
      const jsonLd = {
        "@context": "https://schema.org",
        "@type": "SportsEvent",
        name: adaptive.event.name,
        description: adaptive.event.description,
        startDate: adaptive.event.eventStartsAt,
        location: { "@type": "Place", name: adaptive.event.venue },
        organizer: { "@type": "Organization", name: adaptive.organizer.name },
        sport: adaptive.event.gameName,
        ...(adaptive.event.prize ? { prize: adaptive.event.prize } : {}),
      };
      return <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
        <AdaptiveRegistrationEventPage view={adaptive} locale={locale} copy={copy} />
      </>;
    }
  }

  return renderEventDetailPage(slug, locale, event ?? undefined);
}