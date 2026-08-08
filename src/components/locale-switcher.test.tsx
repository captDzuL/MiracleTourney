// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LocaleSwitcher } from "@/components/locale-switcher";

const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next-intl", () => ({
  useLocale: () => "id",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({
    replace,
    refresh,
  }),
}));

describe("LocaleSwitcher", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.history.replaceState({}, "", "/");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    replace.mockReset();
    refresh.mockReset();
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }

    container?.remove();
  });

  it("switches to the selected locale through next-intl navigation", async () => {
    await act(async () => {
      root.render(<LocaleSwitcher />);
    });

    const enButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "en");

    expect(enButton).toBeTruthy();

    await act(async () => {
      enButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(replace).toHaveBeenCalledWith("/en");
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
