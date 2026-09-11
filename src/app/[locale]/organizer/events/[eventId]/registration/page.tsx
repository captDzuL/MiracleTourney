import { setRequestLocale } from "next-intl/server";

import AdminWorkspace from "../../../../../admin/admin-workspace";

export default async function OrganizerRegistrationPage({
  params,
}: {
  params: Promise<{ locale: string; eventId: string }>;
}) {
  const { locale, eventId } = await params;
  setRequestLocale(locale as "id" | "en");

  return AdminWorkspace({
    workspaceScope: "organizer_registration",
    searchParams: Promise.resolve({
      phase: "registration",
      activeEventId: eventId,
    }),
  });
}
