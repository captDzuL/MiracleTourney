import { redirectToActiveLocale } from "@/i18n/redirect";
import { getSessionUser } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getSafeReturnTo } from "@/lib/navigation/safe-return-to";
import { PlayerRegisterForm } from "./PlayerRegisterForm";
import { ChangeRoleLink, RegisterRoleChooser } from "./RegisterRoleChooser";
import { RegisterWizard } from "./RegisterWizard";

export async function RegisterPageContent({
  searchParams,
  locale,
}: {
  searchParams?: Promise<{ error?: string; eventId?: string; returnTo?: string; as?: string }>;
  locale?: "id" | "en";
}) {
  const resolvedParams = await searchParams;
  const eventId = resolvedParams?.eventId && /^[A-Za-z0-9_-]+$/.test(resolvedParams.eventId)
    ? resolvedParams.eventId
    : undefined;
  const returnTo = getSafeReturnTo(resolvedParams?.returnTo);
  const soloEnabled = isFeatureEnabled("solo_tournament_v1");
  const user = await getSessionUser();
  if (user) {
    if (soloEnabled && user.role === "player") return redirectToActiveLocale(returnTo ?? "/player");
    return redirectToActiveLocale(
      user.role === "captain" && eventId
        ? `/captain?tab=registration&eventId=${encodeURIComponent(eventId)}`
        : user.role === "captain" && returnTo
          ? returnTo
          : "/captain",
    );
  }
  const errorMsg = resolvedParams?.error ? decodeURIComponent(resolvedParams.error) : undefined;

  if (!soloEnabled) {
    return <RegisterWizard errorMsg={errorMsg} eventId={eventId} locale={locale} returnTo={returnTo ?? undefined} />;
  }

  // A visit from an event page (?eventId) is already a captain; everyone else picks first.
  const asParam = resolvedParams?.as;
  const role = asParam === "player" ? "player" : asParam === "captain" || eventId ? "captain" : null;
  if (!role) return <RegisterRoleChooser returnTo={returnTo ?? undefined} />;

  return (
    <>
      <ChangeRoleLink returnTo={returnTo ?? undefined} />
      {role === "player" ? (
        <PlayerRegisterForm errorMsg={errorMsg} locale={locale} returnTo={returnTo ?? undefined} />
      ) : (
        <RegisterWizard errorMsg={errorMsg} eventId={eventId} locale={locale} returnTo={returnTo ?? undefined} />
      )}
    </>
  );
}
