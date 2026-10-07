import { notFound } from "next/navigation";

import { CreateEventWizard } from "@/components/v3/events/CreateEventWizard";
import { redirectToActiveLocale } from "@/i18n/redirect";
import { requireAnyRole } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { findGameConfig } from "@/lib/platform/config";
import { getGameModes, getOrganizerUsers } from "@/lib/platform/repository";

export default async function NewEventPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams?: Promise<{ error?: string }> }) {
  const { locale } = await params;
  const query = await searchParams;
  if ((locale !== "id" && locale !== "en") || !isFeatureEnabled("organizer_workspace_v3")) notFound();

  const user = await requireAnyRole(["organizer", "platform_admin", "admin"]);
  if (!user) return redirectToActiveLocale("/login");
  if (user.role === "organizer" && user.mustChangePassword) return redirectToActiveLocale("/organizer/change-password");
  const [gameModes, organizers] = await Promise.all([
    Promise.resolve(getGameModes()),
    user.role === "organizer" ? Promise.resolve([]) : getOrganizerUsers(),
  ]);
  const modeOptions = gameModes.map((mode) => {
    const game = mode.gameId ? findGameConfig(mode.gameId) : undefined;
    return { id: mode.id, label: game ? `${game.name} · ${mode.name}` : mode.name };
  });

  return <main className="mx-auto w-full max-w-7xl px-4 py-8 min-[700px]:px-8">
    {query?.error === "slug-taken" && <p className="mb-5 rounded-[var(--radius-control)] border border-rose-400/50 bg-rose-950/30 px-4 py-3 text-sm font-semibold text-rose-100" role="alert">Public URL is already in use. Choose a different slug and try again.</p>}
    <CreateEventWizard
      competitionOperationsEnabled={isFeatureEnabled("competition_operations_v3")}
      gameModes={modeOptions}
      locale={locale}
      organizers={organizers.map((organizer) => ({ id: organizer.id, name: organizer.name, email: organizer.email }))}
      role={user.role as "organizer" | "platform_admin" | "admin"}
    />
  </main>;
}