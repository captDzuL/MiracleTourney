import { setRequestLocale } from "next-intl/server";

import CaptainSettingsPage from "../../../captain/settings/page";

export default async function LocalizedCaptainSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as "id" | "en");

  return <CaptainSettingsPage searchParams={searchParams} />;
}
