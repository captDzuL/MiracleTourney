import { setRequestLocale } from "next-intl/server";

import EventsPage from "../../events/page";

export default async function LocalizedEventsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ game?: string; status?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as "id" | "en");

  return <EventsPage searchParams={searchParams} />;
}
