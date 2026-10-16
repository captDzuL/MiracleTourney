import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSessionUser: vi.fn() }));

vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/actions/identity-actions", () => ({
  loginAction: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("@/i18n/redirect", () => ({
  getLocalizedRedirectPath: (path: string, locale: string) => `/${locale}${path}`,
  redirectToActiveLocale: async (path: string) => { throw new Error(`REDIRECT ${path}`); },
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`REDIRECT ${path}`); },
}));

Object.assign(globalThis, { React });

import { renderLoginPage } from "./login-page-content";

/**
 * Someone who already holds a valid session has no reason to see the login
 * form. Without this they stay stuck there after pressing "Masuk" from a page
 * that did not know they were signed in.
 */
describe("renderLoginPage for a visitor who is already signed in", () => {
  beforeEach(() => { mocks.getSessionUser.mockReset(); });

  it("sends a captain to the captain area", async () => {
    mocks.getSessionUser.mockResolvedValue({ id: "c1", role: "captain" });
    await expect(renderLoginPage(Promise.resolve({}), "id")).rejects.toThrow("REDIRECT /id/captain");
  });

  it("sends a captain back to the registration page they were heading to", async () => {
    mocks.getSessionUser.mockResolvedValue({ id: "c1", role: "captain" });
    await expect(renderLoginPage(Promise.resolve({ returnTo: "/events/nusantara-cup/register" }), "id"))
      .rejects.toThrow("REDIRECT /id/events/nusantara-cup/register");
  });

  it("sends a captain to registration for the event they chose", async () => {
    mocks.getSessionUser.mockResolvedValue({ id: "c1", role: "captain" });
    await expect(renderLoginPage(Promise.resolve({ eventId: "event-abc" }), "en"))
      .rejects.toThrow("REDIRECT /en/captain?tab=registration&eventId=event-abc");
  });

  it("ignores an unsafe return path", async () => {
    mocks.getSessionUser.mockResolvedValue({ id: "c1", role: "captain" });
    await expect(renderLoginPage(Promise.resolve({ returnTo: "https://evil.example/events/a/register" }), "id"))
      .rejects.toThrow("REDIRECT /id/captain");
  });

  it("sends an organizer to the organizer workspace", async () => {
    mocks.getSessionUser.mockResolvedValue({ id: "o1", role: "organizer" });
    await expect(renderLoginPage(Promise.resolve({}), "id")).rejects.toThrow("REDIRECT /id/organizer");
  });

  it("sends an organizer with a temporary password to change it", async () => {
    mocks.getSessionUser.mockResolvedValue({ id: "o1", role: "organizer", mustChangePassword: true });
    await expect(renderLoginPage(Promise.resolve({}), "id")).rejects.toThrow("REDIRECT /id/organizer/change-password");
  });

  it("sends an admin to the admin area", async () => {
    mocks.getSessionUser.mockResolvedValue({ id: "a1", role: "platform_admin" });
    await expect(renderLoginPage(Promise.resolve({}), "id")).rejects.toThrow("REDIRECT /id/admin");
  });
});

describe("renderLoginPage for everyone else", () => {
  beforeEach(() => { mocks.getSessionUser.mockReset(); });

  it("shows the form when nobody is signed in", async () => {
    mocks.getSessionUser.mockResolvedValue(null);
    const html = renderToStaticMarkup(await renderLoginPage(Promise.resolve({}), "id"));
    expect(html).toContain('name="email"');
  });

  it("still shows the form when the session cannot be checked", async () => {
    mocks.getSessionUser.mockRejectedValue(new Error("database down"));
    const html = renderToStaticMarkup(await renderLoginPage(Promise.resolve({}), "id"));
    expect(html).toContain('name="email"');
  });

  it("keeps the form after a failed attempt so the error stays readable", async () => {
    mocks.getSessionUser.mockResolvedValue(null);
    const html = renderToStaticMarkup(await renderLoginPage(Promise.resolve({ error: "invalid" }), "id"));
    expect(html).toContain('role="alert"');
  });
});
