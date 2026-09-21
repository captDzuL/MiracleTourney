import "./globals.css";

import { SpeedInsights } from "@vercel/speed-insights/next";
import React from "react";

// Root layout is a passthrough — <html> and <body> live in [locale]/layout.tsx
// so the lang attribute can be set dynamically per locale.
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const markedChildren = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<{ "data-speed-insights-root"?: string }>, {
      "data-speed-insights-root": "true",
    })
    : children;
  return (
    <>
      {markedChildren}
      <SpeedInsights />
    </>
  );
}
