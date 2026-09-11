import { setRequestLocale } from "next-intl/server";

import AdminPage from "../../../../../admin/page";

export default async function OrganizerRegistrationPage({
  params,
}: {
  params: Promise<{ locale: string; eventId: string }>;
}) {
  const { locale, eventId } = await params;
  setRequestLocale(locale as "id" | "en");

  return AdminPage({
    searchParams: Promise.resolve({
      phase: "registration",
      activeEventId: eventId,
    }),
  });
}
