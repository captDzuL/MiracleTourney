// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BracketAppearanceEditor } from "./BracketAppearanceEditor";
import { bracketDesignFixture } from "@/app/[locale]/bracket-design-preview/fixture";
Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement; let root: ReturnType<typeof createRoot>;
const initial = { backgroundUrl: "/bracket-backgrounds/old.png", positionX: 50, positionY: 50, overlay: 35 };
const fetchMock = vi.fn();
beforeEach(() => { vi.clearAllMocks(); host = document.createElement("div"); document.body.append(host); root = createRoot(host); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function render(locale: "en" | "id" = "en") { await act(async () => root.render(<BracketAppearanceEditor eventId="event-1" locale={locale} initial={initial} />)); }
async function renderWithBoard(locale: "en" | "id" = "en") { await act(async () => root.render(<BracketAppearanceEditor eventId="event-1" locale={locale} initial={initial} previewModel={bracketDesignFixture(locale)} />)); }
async function click(action: string) { await act(async () => host.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`)!.click()); }
function change(name: string, value: string) { const element = host.querySelector<HTMLInputElement>(`input[name="${name}"]`)!; act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true })); }); }
describe("BracketAppearanceEditor", () => {
  it("requires saving slider and local artwork changes before exporting, then re-enables export after save or reset", async () => {
    await renderWithBoard();
    const full = () => [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Download full PNG"))!;
    const round = () => [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Download round PNG"))!;
    expect(full().disabled).toBe(false);
    change("positionX", "25");
    expect(full().disabled).toBe(true);
    expect(round().disabled).toBe(true);
    expect(host.textContent).toContain("Save appearance before downloading PNG");
    expect(host.querySelectorAll('[aria-label="Select round"] button')).toHaveLength(3);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ...initial, positionX: 25 }) });
    await click("save");
    expect(full().disabled).toBe(false);
    const picker = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(picker, "files", { configurable: true, value: [new File(["picture"], "image.png", { type: "image/png" })] });
    act(() => picker.dispatchEvent(new Event("change", { bubbles: true })));
    expect(full().disabled).toBe(true);
    expect(round().disabled).toBe(true);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ backgroundUrl: null, positionX: 50, positionY: 50, overlay: 35 }) });
    await click("reset");
    expect(full().disabled).toBe(false);
  });
  it("keeps PNG export disabled while a save is pending and after a failed save", async () => {
    await renderWithBoard("id");
    const full = () => [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Unduh PNG lengkap"))!;
    change("overlay", "55");
    let rejectSave!: (reason: Error) => void;
    fetchMock.mockReturnValue(new Promise((_resolve, reject) => { rejectSave = reject; }));
    await act(async () => { host.querySelector<HTMLButtonElement>('button[data-action="save"]')!.click(); });
    expect(full().disabled).toBe(true);
    expect(host.textContent).toContain("Simpan tampilan sebelum mengunduh PNG");
    await act(async () => rejectSave(new Error("failed")));
    expect(full().disabled).toBe(true);
  });
  it("shows localized controls and immediately previews position and overlay", async () => {
    await render("id"); expect(host.textContent).toContain("Tampilan bracket");
    change("positionX", "25"); change("overlay", "70");
    expect(host.querySelector<HTMLElement>("[data-preview]")?.getAttribute("style")).toContain("25%");
    expect(host.querySelector<HTMLElement>("[data-preview]")?.getAttribute("style")).toContain("0.7");
  });
  it("keeps saved appearance and reports a failed save", async () => {
    await render(); change("positionX", "25");
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ code: "internal_error" }) });
    await click("save");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Could not save");
    expect(host.textContent).toContain("Saved background: Custom");
  });
  it("requires artwork rights and preserves saved state after upload failure", async () => {
    await render();
    const picker = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(picker, "files", { configurable: true, value: [new File(["picture"], "image.png", { type: "image/png" })] });
    act(() => picker.dispatchEvent(new Event("change", { bubbles: true })));
    await click("save");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Confirm artwork rights");
    act(() => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ code: "signature_mismatch" }) });
    await click("save");
    expect((fetchMock.mock.calls[0][1].body as FormData).get("action")).toBe("upload");
    expect(host.textContent).toContain("Saved background: Custom");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Could not save");
  });  it("sends reset and uses the returned default background", async () => {
    await render();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ backgroundUrl: null, positionX: 50, positionY: 50, overlay: 35 }) });
    await click("reset");
    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get("action")).toBe("reset");
    expect(host.textContent).toContain("Saved background: Default");
  });
});
