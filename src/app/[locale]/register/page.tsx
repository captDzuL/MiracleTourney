import { setRequestLocale } from "next-intl/server";

import { RegisterPageContent } from "../../register/RegisterPageContent";

export default async function LocalizedRegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ error?: string; eventId?: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale === "en" ? "en" : "id";
  setRequestLocale(locale);
  return <RegisterPageContent searchParams={searchParams} locale={locale} />;
}
