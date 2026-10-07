import { setRequestLocale } from "next-intl/server";

import { renderEventRegistrationPage } from "../../../../events/[slug]/register/event-registration-page";

export default async function LocalizedEventRegistrationPage({ params, searchParams }: { params: Promise<{ locale: string; slug: string }>; searchParams?: Promise<{ error?: string; success?: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale as "id" | "en");
  return renderEventRegistrationPage(slug, locale as "id" | "en", searchParams);
}
