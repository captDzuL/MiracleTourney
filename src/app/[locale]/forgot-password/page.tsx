import { setRequestLocale } from "next-intl/server";

import { renderForgotPasswordPage } from "../../forgot-password/forgot-password-content";

export default async function LocalizedForgotPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ sent?: string; error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as "id" | "en");

  return renderForgotPasswordPage(searchParams);
}
