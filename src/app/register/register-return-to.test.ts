// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSessionUser = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ getSessionUser }));
vi.mock("@/lib/actions", () => ({ captainSignUpAction: vi.fn() }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) =>
    React.createElement("a", { ...props, href }),
}));

import { RegisterPageContent } from "./RegisterPageContent";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  getSessionUser.mockResolvedValue(null);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe("captain signup return flow", () => {
  it("preserves a safe event registration path through signup and login", async () => {
    const returnTo = "/events/nusantara-cup/register";
    const page = await RegisterPageContent({ searchParams: Promise.resolve({ returnTo }), locale: "id" });

    await act(async () => root.render(page));

    expect(container.querySelector<HTMLInputElement>('input[name="returnTo"]')?.value).toBe(returnTo);
    expect(container.querySelector<HTMLAnchorElement>("a")?.getAttribute("href")).toBe(
      "/login?returnTo=%2Fevents%2Fnusantara-cup%2Fregister",
    );
  });

  it("drops an external return path before rendering the signup form", async () => {
    const page = await RegisterPageContent({
      searchParams: Promise.resolve({ returnTo: "https://attacker.test/events/x/register" }),
      locale: "id",
    });

    await act(async () => root.render(page));

    expect(container.querySelector('input[name="returnTo"]')).toBeNull();
    expect(container.querySelector<HTMLAnchorElement>("a")?.getAttribute("href")).toBe("/login");
  });
});
