import { setRequestLocale } from "next-intl/server";

import CaptainPage from "../../captain/page";

export default async function LocalizedCaptainPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as "id" | "en");

  return <CaptainPage searchParams={searchParams} />;
}
