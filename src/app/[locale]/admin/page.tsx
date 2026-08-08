import { setRequestLocale } from "next-intl/server";

import AdminPage, { dynamic } from "../../admin/page";

export { dynamic };

export default async function LocalizedAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as "id" | "en");

  return <AdminPage searchParams={searchParams} />;
}
