import { setRequestLocale } from "next-intl/server";

import RegisterPage from "../../register/page";

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
  return <RegisterPage searchParams={searchParams} locale={locale} />;
}