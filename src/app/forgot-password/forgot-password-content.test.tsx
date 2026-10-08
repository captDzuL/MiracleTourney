import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions", () => ({ requestPasswordResetAction: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

Object.assign(globalThis, { React });

import { renderForgotPasswordPage } from "./forgot-password-content";

describe("renderForgotPasswordPage", () => {
  it("tells the person to check their inbox after a request, with the 30 minute limit and no server-log hint", async () => {
    const html = renderToStaticMarkup(await renderForgotPasswordPage(Promise.resolve({ sent: "1" })));

    expect(html).toContain("Jika email terdaftar");
    expect(html).toContain("kotak masuk");
    expect(html).toContain("spam");
    expect(html).toContain("30 menit");
    expect(html).not.toContain("log server");
  });

  it("shows the email form before a request", async () => {
    const html = renderToStaticMarkup(await renderForgotPasswordPage(Promise.resolve({})));

    expect(html).toContain('name="email"');
  });
});
