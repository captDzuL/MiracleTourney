// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../../../messages/en.json";
import { AnnouncementsWorkspace } from "./AnnouncementsWorkspace";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });
const boundary = vi.hoisted(() => ({ action: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: boundary.refresh }) }));

describe("AnnouncementsWorkspace", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    boundary.action.mockReset();
    boundary.refresh.mockReset();
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "request-key") });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  function render(announcements: React.ComponentProps<typeof AnnouncementsWorkspace>["announcements"] = []) {
    act(() => root.render(
      <NextIntlClientProvider locale="en" messages={en}>
        <AnnouncementsWorkspace action={boundary.action} announcements={announcements} audit={[]} eventId="event-1" version={4} />
      </NextIntlClientProvider>,
    ));
  }

  async function submitDraft(title: string) {
    const form = host.querySelector<HTMLFormElement>("form")!;
    (form.elements.namedItem("title") as HTMLInputElement).value = title;
    (form.elements.namedItem("body") as HTMLTextAreaElement).value = "Ready";
    await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  }

  it("advances the expected version from each saved receipt", async () => {
    boundary.action
      .mockResolvedValueOnce({ status: "saved", receipt: { version: 5 } })
      .mockResolvedValueOnce({ status: "saved", receipt: { version: 6 } });
    render();

    await submitDraft("First");
    await submitDraft("Second");

    expect(boundary.action).toHaveBeenNthCalledWith(1, expect.objectContaining({ expectedVersion: 4 }));
    expect(boundary.action).toHaveBeenNthCalledWith(2, expect.objectContaining({ expectedVersion: 5 }));
  });

  it("keeps mutation controls disabled until the action settles", async () => {
    let resolveAction!: (result: { status: "saved"; receipt: { version: number } }) => void;
    boundary.action.mockReturnValue(new Promise((resolve) => { resolveAction = resolve; }));
    render([{ id: "announcement-1", title: "Original", body: "Original body", urgency: "info", status: "draft" }]);

    const form = host.querySelector<HTMLFormElement>("form")!;
    (form.elements.namedItem("title") as HTMLInputElement).value = "Pending draft";
    (form.elements.namedItem("body") as HTMLTextAreaElement).value = "Ready";
    act(() => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await act(async () => Promise.resolve());

    expect([...host.querySelectorAll<HTMLButtonElement>("button")].every((button) => button.disabled)).toBe(true);

    resolveAction({ status: "saved", receipt: { version: 5 } });
    await act(async () => Promise.resolve());
    expect([...host.querySelectorAll<HTMLButtonElement>("button")].some((button) => !button.disabled)).toBe(true);
  });

  it("surfaces structured conflicts and refreshes authoritative data", async () => {
    boundary.action.mockResolvedValue({ status: "conflict" });
    render();

    await submitDraft("Changed elsewhere");

    expect(host.querySelector('[role="status"]')?.textContent).toContain("changed in another session");
    expect(host.querySelector('[role="status"]')?.textContent).not.toContain("saved");
    expect(boundary.refresh).toHaveBeenCalledOnce();
  });

  it("keeps a conflicted edit dirty and publish locked", async () => {
    boundary.action.mockResolvedValue({ status: "conflict" });
    render([{ id: "announcement-1", title: "Original", body: "Original body", urgency: "info", status: "draft" }]);

    const editForm = host.querySelectorAll<HTMLFormElement>("form")[1]!;
    const body = editForm.elements.namedItem("body") as HTMLTextAreaElement;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(body, "Unsaved change");
    body.dispatchEvent(new Event("input", { bubbles: true }));
    await act(async () => editForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));

    render([{ id: "announcement-1", title: "Changed elsewhere", body: "Authoritative body", urgency: "important", status: "draft" }]);

    expect(body.value).toBe("Unsaved change");
    expect(host.querySelector<HTMLButtonElement>("article > button")?.disabled).toBe(true);
    expect(boundary.refresh).toHaveBeenCalledOnce();
  });

  it("clears edit dirty state only after a successful save", async () => {
    boundary.action.mockResolvedValue({ status: "saved", receipt: { version: 5 } });
    render([{ id: "announcement-1", title: "Original", body: "Original body", urgency: "info", status: "draft" }]);

    const editForm = host.querySelectorAll<HTMLFormElement>("form")[1]!;
    const body = editForm.elements.namedItem("body") as HTMLTextAreaElement;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(body, "Saved change");
    body.dispatchEvent(new Event("input", { bubbles: true }));
    await act(async () => editForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));

    expect(host.querySelector<HTMLButtonElement>("article > button")?.disabled).toBe(false);
  });
});