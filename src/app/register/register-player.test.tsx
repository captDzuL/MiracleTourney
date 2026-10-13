// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSessionUser = vi.hoisted(() => vi.fn());
const redirectToActiveLocale = vi.hoisted(() => vi.fn());
const playerSignUpAction = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ getSessionUser }));
vi.mock("@/i18n/redirect", () => ({ redirectToActiveLocale }));
vi.mock("@/lib/actions", () => ({ captainSignUpAction: vi.fn() }));
vi.mock("@/lib/actions/player-signup-actions", () => ({ playerSignUpAction }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) =>
    React.createElement("a", { ...props, href }),
}));

import { RegisterPageContent } from "./RegisterPageContent";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

let container: HTMLDivElement;
let root: Root;

async function render(searchParams: Record<string, string> = {}) {
  const page = await RegisterPageContent({ searchParams: Promise.resolve(searchParams), locale: "id" });
  await act(async () => root.render(page));
}

const field = (name: string) => container.querySelector<HTMLInputElement>(`input[name="${name}"]`);
const hrefs = () => Array.from(container.querySelectorAll("a")).map((anchor) => anchor.getAttribute("href"));

beforeEach(() => {
  getSessionUser.mockResolvedValue(null);
  redirectToActiveLocale.mockImplementation((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("register page with solo tournaments switched off", () => {
  it("shows no role choice and ignores ?as=player", async () => {
    await render({ as: "player" });
    expect(container.querySelector("nav")).toBeNull();
    expect(field("whatsapp")).toBeNull();
    expect(field("fullName")).not.toBeNull();
  });

  it("sends a signed-in player to the captain area like any other role (flag off keeps today behaviour)", async () => {
    getSessionUser.mockResolvedValue({ id: "p1", role: "player" });
    await expect(render()).rejects.toThrow("REDIRECT:/captain");
  });
});

describe("register page with solo tournaments switched on", () => {
  beforeEach(() => vi.stubEnv("FEATURE_FLAG_SOLO_TOURNAMENT_V1", "true"));

  it("offers the choice between captain and player, marking the current one", async () => {
    await render();
    const nav = container.querySelector("nav");
    expect(nav?.getAttribute("aria-label")).toBe("roleQuestion");
    expect(hrefs()).toContain("/register");
    expect(hrefs()).toContain("/register?as=player");
    const current = container.querySelector('nav a[aria-current="page"]');
    expect(current?.getAttribute("href")).toBe("/register");
  });

  it("shows the captain form by default", async () => {
    await render();
    expect(field("whatsapp")).toBeNull();
    expect(field("fullName")).not.toBeNull();
  });

  it("shows the player form, with a WhatsApp field, for ?as=player", async () => {
    await render({ as: "player" });
    for (const name of ["fullName", "email", "password", "whatsapp"]) expect(field(name)).not.toBeNull();
    expect(container.querySelector('nav a[aria-current="page"]')?.getAttribute("href")).toBe("/register?as=player");
  });

  it("labels every player field", async () => {
    await render({ as: "player" });
    for (const name of ["fullName", "email", "password", "whatsapp"]) {
      const input = field(name)!;
      expect(container.querySelector(`label[for="${input.id}"]`), name).not.toBeNull();
    }
    expect(field("whatsapp")?.getAttribute("autocomplete")).toBe("tel");
    expect(field("whatsapp")?.getAttribute("inputmode")).toBe("tel");
  });

  it("keeps a safe return path through both the form and the role choice", async () => {
    const returnTo = "/events/solo-cup/register";
    await render({ as: "player", returnTo });
    expect(field("returnTo")?.value).toBe(returnTo);
    expect(hrefs()).toContain(`/register?returnTo=${encodeURIComponent(returnTo)}`);
    expect(hrefs()).toContain(`/register?as=player&returnTo=${encodeURIComponent(returnTo)}`);
    expect(hrefs()).toContain(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  });

  it("drops an external return path", async () => {
    await render({ as: "player", returnTo: "https://attacker.test/events/x/register" });
    expect(field("returnTo")).toBeNull();
  });

  it("passes the page locale to the sign-up action", async () => {
    await render({ as: "player" });
    expect(field("locale")?.value).toBe("id");
  });

  it("blocks submit and shows a message when the WhatsApp number is invalid", async () => {
    await render({ as: "player" });
    const set = (name: string, value: string) => {
      const input = field(name)!;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      act(() => {
        setter.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    set("fullName", "Bima Kartika");
    set("email", "bima@example.com");
    set("password", "password123");
    const confirm = container.querySelector<HTMLInputElement>("#player-confirm-password")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setter.call(confirm, "password123");
      confirm.dispatchEvent(new Event("input", { bubbles: true }));
    });
    set("whatsapp", "123");

    const submit = new Event("submit", { bubbles: true, cancelable: true });
    act(() => {
      container.querySelector("form")!.dispatchEvent(submit);
    });
    expect(submit.defaultPrevented).toBe(true);
    expect(container.textContent).toContain("errorWhatsapp");
  });

  it("sends a signed-in player to the player area, or back to the event they came from", async () => {
    getSessionUser.mockResolvedValue({ id: "p1", role: "player" });
    await expect(render()).rejects.toThrow("REDIRECT:/player");
    await expect(render({ returnTo: "/events/solo-cup/register" })).rejects.toThrow("REDIRECT:/events/solo-cup/register");
  });

  it("still sends a signed-in captain to the captain area", async () => {
    getSessionUser.mockResolvedValue({ id: "c1", role: "captain" });
    await expect(render()).rejects.toThrow("REDIRECT:/captain");
  });
});
