import { setRequestLocale } from "next-intl/server";
import AdminWorkspace from "../../../../../admin/admin-workspace";

/** Event layout checks ownership; legacy workspace also scopes every read/write to the actor. */
export default async function LegacyMatchDay({ params, searchParams }: {
  params: Promise<{ locale: string; eventId: string }>;
  searchParams?: Promise<{ matchId?: string; success?: string; error?: string }>;
}) {
  const { locale, eventId } = await params;
  const query = await searchParams;
  setRequestLocale(locale as "en" | "id");
  return AdminWorkspace({ workspaceScope: "organizer_competition", searchParams: Promise.resolve({ phase: "run", activeEventId: eventId, matchEventId: eventId, matchId: query?.matchId, success: query?.success, error: query?.error }) });
}
