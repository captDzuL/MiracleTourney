// @vitest-environment jsdom

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HydrationGate } from "./HydrationGate";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

describe("HydrationGate", () => {
  it("forwards native div props and exposes readiness after hydration", async () => {
    const beforeHydration = renderToStaticMarkup(
      <HydrationGate id="studio" aria-label="Certificate Studio">
        <button type="button">Publish</button>
      </HydrationGate>,
    );
    expect(beforeHydration).toContain('id="studio"');
    expect(beforeHydration).toContain('aria-label="Certificate Studio"');
    expect(beforeHydration).toContain('aria-busy="true"');
    expect(beforeHydration).toContain("inert");
    expect(beforeHydration).toContain('data-hydration-ready="false"');

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <HydrationGate id="studio" aria-label="Certificate Studio">
          <button type="button">Publish</button>
        </HydrationGate>,
      );
    });
    const gate = container.firstElementChild as HTMLElement;
    expect(gate.getAttribute("aria-busy")).toBe("false");
    expect(gate.hasAttribute("inert")).toBe(false);
    expect(gate.getAttribute("data-hydration-ready")).toBe("true");
    root.unmount();
    container.remove();
  });
});
