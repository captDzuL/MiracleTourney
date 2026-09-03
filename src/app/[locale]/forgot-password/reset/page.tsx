import { setRequestLocale } from "next-intl/server";

import { renderResetPasswordPage } from "../../../forgot-password/reset/reset-page-content";

export default async function LocalizedResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ token?: string; error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as "id" | "en");

  return renderResetPasswordPage(searchParams);
}
