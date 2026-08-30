import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} data-i18n-link="true" {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/actions", () => ({ loginAction: vi.fn() }));

Object.assign(globalThis, { React });

import { renderLoginPage } from "./login-page-content";

describe("renderLoginPage", () => {
  it("links 'Lupa password?' through the locale-aware Link component, not a raw anchor", async () => {
    const page = await renderLoginPage(Promise.resolve({}));
    const html = renderToStaticMarkup(page);

    expect(html).toContain('href="/forgot-password" data-i18n-link="true"');
  });
});
