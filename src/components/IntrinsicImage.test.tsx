// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IntrinsicImage } from "./IntrinsicImage";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

describe("IntrinsicImage", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it("keeps fixed-height landscape and portrait previews at their decoded width, resets on source change, and exposes load failure", async () => {
    const render = (src: string) => act(() => root.render(<IntrinsicImage src={src} alt="Character art preview" heightRem={6} constrainToParent={false} />));
    const load = async (width: number, height: number) => {
      const image = container.querySelector("img")!;
      Object.defineProperties(image, {
        naturalWidth: { configurable: true, value: width },
        naturalHeight: { configurable: true, value: height },
      });
      await act(async () => image.dispatchEvent(new Event("load", { bubbles: true })));
      return image.parentElement!;
    };

    render("/character-landscape.png");
    expect(new URL(container.querySelector("img")!.src).pathname).toBe("/character-landscape.png");
    expect((await load(1800, 900)).style.width).toBe("12rem");
    expect(container.querySelector("img")?.parentElement?.style.height).toBe("6rem");

    render("/character-portrait.png");
    expect(container.querySelector("img")?.parentElement?.style.width).toBe("0px");
    expect((await load(500, 1000)).style.width).toBe("3rem");
    await act(async () => container.querySelector("img")?.dispatchEvent(new Event("error", { bubbles: true })));
    expect(container.querySelector('[role="img"]')?.textContent).toBe("Character art preview");
  });
});
