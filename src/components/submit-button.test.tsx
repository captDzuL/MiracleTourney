// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { SubmitButton } from "./submit-button";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

let host: HTMLDivElement | undefined;

afterEach(() => {
  host?.remove();
  host = undefined;
});

describe("SubmitButton hydration safety", () => {
  it("cannot submit before React attaches the Server Action handler", () => {
    const server = document.createElement("div");
    server.innerHTML = renderToString(<SubmitButton>Save</SubmitButton>);
    expect(server.querySelector("button")?.disabled).toBe(true);

    host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(<SubmitButton>Save</SubmitButton>));
    expect(host.querySelector("button")?.disabled).toBe(false);
    act(() => root.unmount());
  });
});
