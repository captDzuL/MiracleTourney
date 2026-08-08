import { setRequestLocale } from "next-intl/server";

import CaptainStatsPage, { dynamic } from "../../../captain/stats/page";

export { dynamic };

export default async function LocalizedCaptainStatsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as "id" | "en");

  return <CaptainStatsPage />;
}
