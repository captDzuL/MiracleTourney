// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../../messages/en.json";
import id from "../../../messages/id.json";
import { AppShell } from "../shell";
import { PanelShell } from "../panel/PanelShell";
import { EventWorkspaceShell } from "./EventWorkspaceShell";
import { OperatorShell } from "./OperatorShell";
import { SiteFooter } from "./SiteFooter";

const route = vi.hoisted(() => ({ pathname: "/en/events", locale: "en", replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useParams: () => ({ locale: route.locale }),
  useRouter: () => ({ replace: route.replace, refresh: route.refresh, push: vi.fn(), prefetch: vi.fn() }),
}));
// next-intl/navigation's external ESM imports next/navigation without an extension,
// which Node cannot resolve in this Vitest setup. Model only that routing boundary;
// the real shells must opt into the locale-aware Link rather than raw anchors.
vi.mock("@/i18n/navigation", () => ({
  Link: React.forwardRef<HTMLAnchorElement, React.AnchorHTMLAttributes<HTMLAnchorElement>>(({ href = "/", ...props }, ref) =>
    <a {...props} ref={ref} href={`/${route.locale}${href === "/" ? "" : href}`} />),
  usePathname: () => route.pathname.replace(/^\/(en|id)(?=\/|$)/, "") || "/",
}));
// Session actions cross the server/database boundary; intl messages stay real.
vi.mock("@/lib/session-actions", () => ({ logoutAction: vi.fn() }));
Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let role: string | null;
async function render(element: React.ReactNode = <AppShell><h1>Page content</h1></AppShell>) {
  await act(async () => {
    root.render(<NextIntlClientProvider locale={route.locale} messages={route.locale === "en" ? en : id} timeZone="Asia/Jakarta">{element}</NextIntlClientProvider>);
  });
}
const links = (scope: ParentNode = container) => Array.from(scope.querySelectorAll("a")).map(a => a.getAttribute("href"));
const menu = () => container.querySelector<HTMLButtonElement>("button[aria-expanded]")!;
const click = (element: HTMLElement) => act(() => element.click());
function key(element: HTMLElement, value: string, shiftKey = false) {
  act(() => element.dispatchEvent(new KeyboardEvent("keydown", { key: value, shiftKey, bubbles: true, cancelable: true })));
}

beforeEach(() => {
  route.pathname = "/en/events";
  route.locale = "en";
  role = null;
  vi.stubEnv("FEATURE_FLAG_UI_V3_FOUNDATION", "true");
  vi.stubEnv("FEATURE_FLAG_PUBLIC_VISUAL_V2", "false");
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ user: role ? { name: "Test User", role, pendingCount: 2 } : null }) })));
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("V3 shell integration", () => {
  it("keeps an actual operator panel on legacy classes when the V3 flag is disabled", async () => {
    vi.stubEnv("FEATURE_FLAG_UI_V3_FOUNDATION", "false");
    await render(<AppShell><PanelShell><h1>Legacy operator</h1></PanelShell></AppShell>);
    const panel = container.querySelector(".panel-scope")!;
    expect(panel).not.toBeNull();
    expect(panel.classList.contains("miracle-v3")).toBe(false);
    expect(panel.querySelector('[role="group"]')?.className).toContain("border-slate-200");
    expect(panel.querySelector("button")?.className).not.toContain("miracle-focus-ring");
  });
  it.each(["en", "id"])("preserves %s through the locale navigation boundary and marks nested event paths active", async locale => {
    route.locale = locale;
    route.pathname = `/${locale}/events/cup/participants`;
    await render();
    expect(links()).toContain(`/${locale}/events`);
    expect(links()).toContain(`/${locale}`);
    expect(container.querySelector('nav a[aria-current="page"]')?.getAttribute("href")).toBe(`/${locale}/events`);
    expect(container.querySelector('a[href="#main-content"]')?.textContent).toBe(locale === "en" ? "Skip to content" : "Lewati ke konten");
    expect(container.querySelector("main")?.id).toBe("main-content");
    expect(container.querySelector("main")?.tabIndex).toBe(-1);
    expect(container.querySelector("nav")?.getAttribute("aria-label")).toBe(locale === "en" ? "Primary navigation" : "Navigasi utama");
  });

  it.each([undefined, "false"])("keeps legacy chrome and menu when the V3 flag is %s", async flag => {
    vi.stubEnv("FEATURE_FLAG_UI_V3_FOUNDATION", flag);
    await render();
    expect(container.querySelector(".miracle-v3")).toBeNull();
    expect(container.querySelector("h1")?.textContent).toBe("Page content");
    expect(menu().getAttribute("aria-label")).toBe("Menu");
    vi.stubEnv("FEATURE_FLAG_PUBLIC_VISUAL_V2", "true");
    await render();
    expect(container.querySelector(".public-visual-v2")).not.toBeNull();
    vi.stubEnv("FEATURE_FLAG_UI_V3_FOUNDATION", "true");
    await render();
    expect(container.querySelector(".miracle-v3")).not.toBeNull();
    expect(container.querySelector(".public-visual-v2")).toBeNull();
  });

  it.each([
    ["captain", "/en/captain/stats", "/en/captain/stats", ["/en/admin", "/en/organizer"]],
    ["organizer", "/en/organizer", "/en/organizer", ["/en/captain"]],
    ["platform_admin", "/en/admin", "/en/admin", ["/en/captain"]],
    ["admin", "/en/admin", "/en/admin", ["/en/captain"]],
  ])("shows only permitted navigation for %s and selects the deepest route", async (userRole, path, active, forbidden) => {
    role = userRole as string;
    route.pathname = path as string;
    await render();
    const nav = container.querySelector("aside nav")!;
    expect(nav).not.toBeNull();
    expect(links(nav)).toContain(active);
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(nav.querySelector('[aria-current="page"]')?.getAttribute("href")).toBe(active);
    for (const href of forbidden) expect(links(nav)).not.toContain(href);
    expect(container.querySelectorAll("button[aria-expanded]")).toHaveLength(1);
  });

  it("does not infer a privileged role from an operator URL when session loading fails", async () => {
    route.pathname = "/en/admin";
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    await render();
    const nav = container.querySelector("aside nav")!;
    expect(links(nav)).toEqual(["/en/events"]);
  });

  it("does not classify an event slug named admin as an operator route", async () => {
    route.pathname = "/en/events/admin";
    await render();
    expect(container.querySelector("aside nav")).toBeNull();
  });

  it.each(["/en/organizer", "/en/events"])("opens one accessible drawer at %s, traps focus, and restores focus after Escape", async pathname => {
    route.pathname = pathname;
    role = "organizer";
    await render();
    const trigger = menu();
    expect(trigger.getAttribute("aria-label")).toBe("Open navigation");
    expect(trigger.className).toContain("miracle-focus-ring");
    trigger.focus();
    click(trigger);
    const dialog = container.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(trigger.getAttribute("aria-controls")).toBe(dialog.id);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe(pathname.includes("organizer") ? "Operator navigation" : "Primary navigation");
    const close = dialog.querySelector<HTMLButtonElement>('button[aria-label="Close navigation"]')!;
    expect(document.activeElement).toBe(close);
    const last = Array.from(dialog.querySelectorAll<HTMLElement>("a,button")).at(-1)!;
    key(close, "Tab", true);
    expect(document.activeElement).toBe(last);
    key(last, "Tab");
    expect(document.activeElement).toBe(close);
    key(close, "Escape");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    click(trigger);
    click(container.querySelector<HTMLButtonElement>('[aria-label="Close navigation"]')!);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes the drawer when navigation changes and keeps the new active route", async () => {
    role = "captain";
    route.pathname = "/en/captain";
    await render();
    click(menu());
    route.pathname = "/en/captain/stats";
    await render();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('aside nav [aria-current="page"]')?.getAttribute("href")).toBe("/en/captain/stats");
  });

  it("localizes workspace navigation and next action while retaining the current locale", async () => {
    await render(<EventWorkspaceShell eventTitle="Community Cup" organizerLabel="Community" navigation={[{ href: "/organizer/events/cup", label: "Overview", active: true }]} nextAction={<button>Continue setup</button>}><p>Workspace</p></EventWorkspaceShell>);
    expect(container.querySelector('nav[aria-label="Event navigation"]')).not.toBeNull();
    expect(links()).toContain("/en/organizer/events/cup");
    expect(container.querySelector('aside[aria-label="Next action"]')?.textContent).toContain("Continue setup");
    expect(container.querySelector("h1")?.textContent).toBe("Community Cup");
  });

  it("keeps the pending review count and authenticated sign-out action", async () => {
    role = "organizer";
    route.pathname = "/en/organizer";
    await render();
    expect(container.querySelector('aside a[href="/en/admin"]')?.textContent).toContain("2");
    expect(container.querySelector('form button[aria-label="Sign Out"]')).not.toBeNull();
  });

  it.each([["/en/events", "(min-width: 620px)"], ["/en/organizer", "(min-width: 980px)"]])("closes the drawer on its desktop breakpoint for %s", async (pathname, breakpoint) => {
    route.pathname = pathname;
    const media = { matches: false, media: breakpoint, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.mocked(window.matchMedia).mockReturnValue(media as unknown as MediaQueryList);
    await render();
    click(menu());
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(window.matchMedia).toHaveBeenCalledWith(breakpoint);
    media.matches = true;
    act(() => media.addEventListener.mock.calls[0][1]());
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(container.querySelector("main"));
  });

  it("closes the drawer after following a locale-preserving link", async () => {
    role = "captain";
    route.pathname = "/en/captain";
    await render();
    click(menu());
    const link = container.querySelector<HTMLAnchorElement>('[role="dialog"] a[href="/en/captain/stats"]')!;
    link.addEventListener("click", event => event.preventDefault());
    click(link);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("keeps Indonesian accessible names when opening the drawer", async () => {
    route.locale = "id";
    route.pathname = "/id/organizer";
    role = "organizer";
    await render();
    expect(menu().getAttribute("aria-label")).toBe("Buka navigasi");
    click(menu());
    expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Navigasi operator");
    expect(container.querySelector('[aria-label="Tutup navigasi"]')).not.toBeNull();
  });
  it("renders supplied social contacts and copyright without inventing other contacts", async () => {
    await render(<SiteFooter copyright="Copyright © Miracle" tagline="Community tournaments" socialLabel="Social contacts" socials={[{ href: "https://example.com/community", label: "Community social" }]} />);
    expect(container.textContent).toContain("Copyright © Miracle");
    expect(links()).toEqual(["https://example.com/community"]);
    await render(<SiteFooter copyright="Copyright © Miracle" tagline="Community tournaments" />);
    expect(container.querySelector("nav")).toBeNull();
  });
});
