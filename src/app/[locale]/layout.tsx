import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { SpeedInsights } from "@vercel/speed-insights/next";

import { AppShell } from "@/components/shell";
import { routing } from "@/i18n/routing";

export const dynamic = "force-dynamic";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://miracle-tourney.vercel.app";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isEn = locale === "en";

  return {
    metadataBase: new URL(BASE_URL),
    title: {
      default: "Miracle League",
      template: "%s · Miracle League",
    },
    description: isEn
      ? "Community multi-game tournament platform. Join, compete, and follow live brackets."
      : "Platform turnamen komunitas multi-game. Daftar, bertanding, dan pantau bracket langsung.",
    openGraph: {
      siteName: "Miracle League",
      locale: locale === "en" ? "en_US" : "id_ID",
      type: "website",
    },
    twitter: { card: "summary_large_image" },
    alternates: {
      languages: {
        id: `${BASE_URL}/id`,
        en: `${BASE_URL}/en`,
      },
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as "id" | "en")) {
    notFound();
  }

  setRequestLocale(locale as "id" | "en");
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AppShell>{children}</AppShell>
        </NextIntlClientProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
