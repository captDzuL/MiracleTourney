import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import localFont from "next/font/local";
import { notFound } from "next/navigation";

import { SpeedInsights } from "@vercel/speed-insights/next";

import { AppShell } from "@/components/shell";
import { routing } from "@/i18n/routing";
import { PANEL_THEME_INIT_SCRIPT } from "@/lib/theme/panel-theme";

export const dynamic = "force-dynamic";

// Latin subset only, and only the weights the poster system actually uses.
const displayFont = localFont({
  variable: "--font-display",
  display: "swap",
  fallback: ["Bahnschrift", "Segoe UI Variable", "sans-serif"],
  src: [
    { path: "../fonts/teko-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../fonts/teko-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
});

const uiFont = localFont({
  variable: "--font-ui",
  display: "swap",
  fallback: ["Segoe UI", "system-ui", "sans-serif"],
  src: [
    { path: "../fonts/chakra-petch-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../fonts/chakra-petch-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../fonts/chakra-petch-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
});

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
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/*
          Resolves the operator panel theme before the first paint so switching
          pages never flashes the light palette. Emits only "light" or "dark".
        */}
        <script dangerouslySetInnerHTML={{ __html: PANEL_THEME_INIT_SCRIPT }} />
      </head>
      <body className={`${displayFont.variable} ${uiFont.variable}`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AppShell>{children}</AppShell>
        </NextIntlClientProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
