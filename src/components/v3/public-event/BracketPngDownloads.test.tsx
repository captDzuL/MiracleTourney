// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BracketPngDownloads } from "./BracketPngDownloads";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => vi.restoreAllMocks());

describe("league bracket PNG downloads", () => {
  it("downloads the round selected beside a league standings view", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["png"], { type: "image/png" }) });
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn().mockReturnValue("blob:png") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(<BracketPngDownloads model={{ event: { id: "e", slug: "cup", name: "Cup", logoUrl: null, format: "League", status: "Ongoing" }, locale: "en" }} rounds={[{ key: "league:1", label: "Round 1" }, { key: "league:2", label: "Round 2" }]} />));
      const selector = host.querySelector<HTMLSelectElement>('select[aria-label="Select round for PNG"]')!;
      expect(selector).not.toBeNull();
      await act(async () => { selector.value = "league:2"; selector.dispatchEvent(new Event("change", { bubbles: true })); });
      const roundButton = [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Download round PNG"))!;
      await act(async () => roundButton.click());
      expect(fetchMock).toHaveBeenCalledWith("/api/events/cup/bracket.png?locale=en&round=league%3A2", { credentials: "same-origin" });
    } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
  });
});
