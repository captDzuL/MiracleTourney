import "./globals.css";

import { SpeedInsights } from "@vercel/speed-insights/next";
import React from "react";

// Root layout is a passthrough — <html> and <body> live in [locale]/layout.tsx
// so the lang attribute can be set dynamically per locale.
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {children}
      <div data-observability-root-layout="true">
        <SpeedInsights />
      </div>
    </>
  );
}
