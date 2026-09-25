import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@vercel/speed-insights/next", () => ({
  SpeedInsights: () => <span data-speed-insights="true" />,
}));
vi.mock("next/font/local", () => ({ default: () => ({ variable: "mock-font" }) }));
vi.mock("next-intl", () => ({
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("next-intl/server", () => ({
  getMessages: vi.fn(async () => ({})),
  setRequestLocale: vi.fn(),
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }) }));
vi.mock("@/components/panel/PanelThemeSync", () => ({ PanelThemeSync: () => null }));
vi.mock("@/components/shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/i18n/routing", () => ({ routing: { locales: ["id", "en"] } }));
vi.mock("@/lib/observability/logger", () => ({
  withServerActionLog: vi.fn(async (_operation: string, _route: string, work: () => Promise<unknown>) => work()),
}));

import RootLayout from "../layout";
import LocaleLayout from "./layout";

describe("locale production layout", () => {
  it("renders the locale page through the root DOM boundary with one Speed Insights mount", async () => {
    const localeTree = await LocaleLayout({
      children: <main>content</main>,
      params: Promise.resolve({ locale: "en" }),
    });
    const html = renderToStaticMarkup(RootLayout({ children: localeTree }));

    expect(html).toContain('<html lang="en"');
    expect(html).toContain('<div data-observability-root-layout="true">');
    expect(html.match(/data-speed-insights="true"/g)).toHaveLength(1);
  });
});
