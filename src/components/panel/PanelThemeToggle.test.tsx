// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import id from "../../../messages/id.json";
import { PanelThemeToggle } from "@/components/panel/PanelThemeToggle";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

describe("PanelThemeToggle", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("gives every localized V3 theme mode a 44px touch target", async () => {
    await act(async () => {
      root.render(
        <NextIntlClientProvider locale="id" messages={id} timeZone="Asia/Jakarta">
          <PanelThemeToggle variant="v3" />
        </NextIntlClientProvider>,
      );
    });

    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-pressed]'));
    expect(buttons.map((button) => button.title)).toEqual(["Terang", "Gelap", "Sistem"]);
    expect(buttons).toHaveLength(3);
    for (const button of buttons) {
      expect(button.className).toContain("min-h-11");
      expect(button.className).toContain("min-w-11");
    }
  });
});
