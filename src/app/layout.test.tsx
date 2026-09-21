import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@vercel/speed-insights/next", () => ({
  SpeedInsights: () => <span data-speed-insights="true" />,
}));

import RootLayout from "./layout";

describe("root production layout", () => {
  it("renders the Vercel Speed Insights component", () => {
    const html = renderToStaticMarkup(RootLayout({ children: <main>content</main> }));

    expect(html).toContain('data-speed-insights="true"');
  });

  it("renders one stable root signal with exactly one Speed Insights mount", () => {
    const html = renderToStaticMarkup(RootLayout({ children: <main>content</main> }));

    expect(html.match(/data-speed-insights-root="true"/g)).toHaveLength(1);
    expect(html.match(/data-speed-insights="true"/g)).toHaveLength(1);
  });
});
