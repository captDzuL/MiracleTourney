import type { Metadata } from "next";

import { SpeedInsights } from "@vercel/speed-insights/next";

import "@/components/shell";
import "@/app/home-page-content";
import "./globals.css";

export const metadata: Metadata = {
  title: "Miracle League",
  description: "Platform turnamen komunitas multi-game.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
