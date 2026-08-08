import { setRequestLocale } from "next-intl/server";

import { renderParticipantsPage } from "../../../../events/[slug]/participants/participants-page";

export default async function LocalizedParticipantsPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale as "id" | "en");

  return renderParticipantsPage(slug);
}
