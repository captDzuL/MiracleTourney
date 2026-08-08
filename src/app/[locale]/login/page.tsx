import { setRequestLocale } from "next-intl/server";

import { renderLoginPage } from "../../login/login-page-content";

export default async function LocalizedLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as "id" | "en");

  return renderLoginPage(searchParams, locale as "id" | "en");
}
