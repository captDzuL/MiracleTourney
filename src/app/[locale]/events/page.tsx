import { setRequestLocale } from "next-intl/server";

import EventsPage from "../../events/page";

export default async function LocalizedEventsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as "id" | "en");

  return <EventsPage />;
}
