// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../../../messages/en.json";
import id from "../../../../messages/id.json";
import type { OrganizerWorkspaceSummary } from "@/lib/organizer/workspace-types";
import { OrganizerMasterShell } from "./OrganizerMasterShell";
const route = vi.hoisted(() => ({ pathname: "/organizer/events/cup/overview", locale: "en" }));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => route.pathname,
  Link: React.forwardRef<HTMLAnchorElement, React.AnchorHTMLAttributes<HTMLAnchorElement> & { locale?: string }>(({ href, locale, ...props }, ref) => <a {...props} ref={ref} href={`/${locale ?? route.locale}${href}`} />),
}));
Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });
const summary: OrganizerWorkspaceSummary = {
  event: { id: "cup", title: "Miracle Cup", game: "Mobile Legends", format: "Single Elimination" },
  lifecycle: "ongoing", publication: "published", role: "organizer", updatedAt: "2026-09-14T10:00:00.000Z",
  capabilities: { overview: true, registration: true, participants: false, competition: true, schedule: true, "match-control": true, completion: true, announcements: false, settings: false },
  badges: { registration: 3 }, blockers: [],
};
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  route.pathname = "/organizer/events/cup/overview"; route.locale = "en";
  localStorage.clear(); host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function render(view = summary, child: React.ReactNode = <button>Route action</button>) {
  await act(async () => root.render(<NextIntlClientProvider locale={route.locale} messages={route.locale === "id" ? id : en} timeZone="Asia/Jakarta"><OrganizerMasterShell summary={view} locale={route.locale as "en" | "id"}>{child}</OrganizerMasterShell></NextIntlClientProvider>));
}
function click(element: HTMLElement) { act(() => element.click()); }
function key(element: HTMLElement, key: string, shiftKey = false) { act(() => element.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }))); }
const trigger = () => host.querySelector<HTMLButtonElement>('button[aria-expanded]')!;
describe("OrganizerMasterShell", () => {
  it.each(["organizer", "admin", "platform_admin"] as const)("renders the same event rail for %s with canonical links and capability filtering", async role => {
    await render({ ...summary, role });
    const rail = host.querySelector("aside nav")!;
    expect(rail).not.toBeNull();
    expect(rail.querySelectorAll("a")).toHaveLength(6);
    expect(rail.querySelector('a[aria-current="page"]')?.getAttribute("href")).toBe("/en/organizer/events/cup/overview");
    expect(host.querySelector('a[href*="/settings"]')).toBeNull();
    expect(host.textContent).toContain(en.organizerMaster.roles[role]);
    expect(host.textContent).toContain("Ongoing");
    expect(host.querySelector("time")?.textContent).toContain("14 Sept 2026");
    expect(host.querySelector("time")?.getAttribute("dateTime")).toBe(summary.updatedAt);
    expect(host.querySelector('aside a[href$="/registration"]')?.textContent).toContain("3");
  });
  it("localizes labels and update time and selects the route after navigation", async () => {
    route.locale = "id"; route.pathname = "/organizer/events/cup/schedule"; await render();
    expect(host.querySelector('aside a[aria-current="page"]')?.textContent).toContain("Jadwal");
    expect(host.querySelector('aside a[href$="/match-control"]')?.textContent).toContain("Kontrol Pertandingan");
    expect(host.querySelector("time")?.textContent).toBe("Pembaruan terakhir 14 Sep 2026, 17.00");
    route.pathname = "/organizer/events/cup/matches/match-1"; await render();
    expect(host.querySelector('aside a[aria-current="page"]')?.getAttribute("href")).toBe("/id/organizer/events/cup/match-control");
  });
  it("opens an accessible mobile drawer, traps Tab, closes on Escape and restores focus", async () => {
    await render(); const menu = trigger(); menu.focus(); click(menu);
    const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(menu.getAttribute("aria-controls")).toBe(dialog.id);
    const close = dialog.querySelector<HTMLButtonElement>("button")!;
    const last = Array.from(dialog.querySelectorAll<HTMLElement>("a,button")).at(-1)!;
    expect(document.activeElement).toBe(close);
    key(close, "Tab", true); expect(document.activeElement).toBe(last);
    key(last, "Tab"); expect(document.activeElement).toBe(close);
    key(close, "Escape"); expect(host.querySelector('[role="dialog"]')).toBeNull(); expect(document.activeElement).toBe(menu);
  });
  it("closes the drawer on route changes without intercepting a cross-route link", async () => {
    await render(); click(trigger());
    const link = host.querySelector<HTMLAnchorElement>('[role="dialog"] a[href$="/schedule"]')!;
    let wasPrevented = true;
    host.addEventListener("click", e => { wasPrevented = e.defaultPrevented; e.preventDefault(); }, { once: true });
    click(link); expect(wasPrevented).toBe(false); expect(link.getAttribute("href")).toBe("/en/organizer/events/cup/schedule");
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    click(trigger()); route.pathname = "/organizer/events/cup/schedule"; await render();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });
  it("dismisses the non-modal guide by event and lifecycle and restores it", async () => {
    await render();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    click(host.querySelector<HTMLButtonElement>('[data-guide-dismiss]')!);
    expect(localStorage.getItem("miracle:organizer-guide:cup:ongoing:v1")).toBe("dismissed");
    expect(host.querySelector('[data-guide-dismiss]')).toBeNull();
    expect(host.textContent).toContain("Route action");
    await render({ ...summary }); expect(host.querySelector('[data-guide-dismiss]')).toBeNull();
    click(host.querySelector<HTMLButtonElement>('[data-guide-restore]')!);
    expect(host.querySelector('[data-guide-dismiss]')).not.toBeNull();
    expect(localStorage.getItem("miracle:organizer-guide:cup:ongoing:v1")).toBeNull();
    click(host.querySelector<HTMLButtonElement>('[data-guide-dismiss]')!);
    await render({ ...summary, lifecycle: "finished" }); expect(host.querySelector('[data-guide-dismiss]')).not.toBeNull();
  });
  it("retains event context around loading and error children", async () => {
    await render(summary, <p role="status">Loading schedule</p>);
    expect(host.textContent).toContain("Miracle Cup"); expect(host.querySelector("aside nav")).not.toBeNull();
    await render(summary, <p role="alert">Schedule unavailable</p>);
    expect(host.textContent).toContain("Miracle Cup"); expect(host.querySelector('a[href="/admin"]')).toBeNull();
  });
});
