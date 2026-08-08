import { redirectToActiveLocale } from "@/i18n/redirect";
import { getSessionUser } from "@/lib/auth/session";
import { getPublishedEvents } from "@/lib/platform/repository";
import { RegisterWizard } from "./RegisterWizard";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const user = await getSessionUser();
  if (user) {
    return redirectToActiveLocale("/captain");
  }

  const resolvedParams = await searchParams;
  const errorMsg = resolvedParams?.error ? decodeURIComponent(resolvedParams.error) : undefined;

  const events = await getPublishedEvents();

  return <RegisterWizard events={events} errorMsg={errorMsg} />;
}
