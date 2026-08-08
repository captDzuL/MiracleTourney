import { setRequestLocale } from "next-intl/server";

import RegisterPage from "../../register/page";

export default async function LocalizedRegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as "id" | "en");

  return <RegisterPage searchParams={searchParams} />;
}
