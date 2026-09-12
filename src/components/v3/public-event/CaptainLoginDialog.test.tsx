// @vitest-environment jsdom

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

vi.mock("@/lib/actions/captain-event-login", () => ({
  captainEventLoginAction: vi.fn(async () => ({ status: "idle" })),
}));

import { CaptainLoginDialog } from "./CaptainLoginDialog";

describe("CaptainLoginDialog", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(
      <CaptainLoginDialog locale="id" eventId="event-1" eventName="Miracle Cup" triggerLabel="Daftarkan tim" />,
    ));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("opens with event context, accessible dialog semantics, and signup intent", () => {
    const trigger = container.querySelector<HTMLButtonElement>("button")!;
    act(() => trigger.click());

    const dialog = container.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.textContent).toContain("Kamu akan kembali ke event ini");
    expect(dialog.textContent).toContain("Miracle Cup");
    expect(dialog.querySelector('a[href="/id/register?eventId=event-1"]')).not.toBeNull();
    expect(document.activeElement).toBe(dialog.querySelector('input[name="email"]'));
  });

  it("closes on Escape and returns focus to the CTA", async () => {
    const trigger = container.querySelector<HTMLButtonElement>("button")!;
    act(() => trigger.click());
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await act(async () => { await Promise.resolve(); });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes when the backdrop is clicked", () => {
    const trigger = container.querySelector<HTMLButtonElement>("button")!;
    act(() => trigger.click());
    const backdrop = container.querySelector('[role="dialog"]')?.parentElement as HTMLElement;
    act(() => backdrop.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});