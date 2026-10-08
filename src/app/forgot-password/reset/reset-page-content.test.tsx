import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyPasswordResetToken = vi.hoisted(() => vi.fn());

vi.mock("@/lib/actions", () => ({ resetPasswordAction: vi.fn() }));
vi.mock("@/lib/platform/password-reset", () => ({ verifyPasswordResetToken }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

Object.assign(globalThis, { React });

import { renderResetPasswordPage } from "./reset-page-content";

const TOKEN = "a".repeat(64);

describe("renderResetPasswordPage", () => {
  beforeEach(() => {
    verifyPasswordResetToken.mockReset();
  });

  it("shows the new-password form for a usable token", async () => {
    verifyPasswordResetToken.mockResolvedValue({ id: "reset-1" });

    const html = renderToStaticMarkup(await renderResetPasswordPage(Promise.resolve({ token: TOKEN })));

    expect(verifyPasswordResetToken).toHaveBeenCalledWith(TOKEN);
    expect(html).toContain('name="password"');
    expect(html).toContain('name="confirmPassword"');
  });

  it("does not show the form for a used or expired link and offers a new one", async () => {
    verifyPasswordResetToken.mockResolvedValue(null);

    const html = renderToStaticMarkup(await renderResetPasswordPage(Promise.resolve({ token: TOKEN })));

    expect(html).not.toContain('name="password"');
    expect(html).not.toContain(TOKEN);
    expect(html).toContain("sudah dipakai atau kedaluwarsa");
    expect(html).toContain('href="/forgot-password"');
  });

  it("does not show the form when the token is missing, without hitting the database", async () => {
    const html = renderToStaticMarkup(await renderResetPasswordPage(Promise.resolve({})));

    expect(verifyPasswordResetToken).not.toHaveBeenCalled();
    expect(html).not.toContain('name="password"');
    expect(html).toContain('href="/forgot-password"');
  });

  it("treats a lookup failure as an invalid link instead of crashing the page", async () => {
    verifyPasswordResetToken.mockRejectedValue(new Error("database unreachable"));

    const html = renderToStaticMarkup(await renderResetPasswordPage(Promise.resolve({ token: TOKEN })));

    expect(html).not.toContain('name="password"');
    expect(html).toContain('href="/forgot-password"');
  });

  it("keeps the form and shows the validation error when a usable token had a bad submit", async () => {
    verifyPasswordResetToken.mockResolvedValue({ id: "reset-1" });

    const html = renderToStaticMarkup(
      await renderResetPasswordPage(Promise.resolve({ token: TOKEN, error: encodeURIComponent("Password minimal 8 karakter.") })),
    );

    expect(html).toContain('name="password"');
    expect(html).toContain("Password minimal 8 karakter.");
  });
});
