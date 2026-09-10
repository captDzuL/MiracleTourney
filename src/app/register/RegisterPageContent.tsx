import { redirectToActiveLocale } from "@/i18n/redirect";
import { getSessionUser } from "@/lib/auth/session";
import { RegisterWizard } from "./RegisterWizard";

export async function RegisterPageContent({
  searchParams,
  locale,
}: {
  searchParams?: Promise<{ error?: string; eventId?: string }>;
  locale?: "id" | "en";
}) {
  const resolvedParams = await searchParams;
  const eventId = resolvedParams?.eventId && /^[A-Za-z0-9_-]+$/.test(resolvedParams.eventId)
    ? resolvedParams.eventId
    : undefined;
  const user = await getSessionUser();
  if (user) {
    return redirectToActiveLocale(
      user.role === "captain" && eventId
        ? `/captain?tab=registration&eventId=${encodeURIComponent(eventId)}`
        : "/captain",
    );
  }
  const errorMsg = resolvedParams?.error ? decodeURIComponent(resolvedParams.error) : undefined;
  return <RegisterWizard errorMsg={errorMsg} eventId={eventId} locale={locale} />;
}
