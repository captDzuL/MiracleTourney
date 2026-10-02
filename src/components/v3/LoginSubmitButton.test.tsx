import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { useFormStatus } = vi.hoisted(() => ({ useFormStatus: vi.fn() }));

vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom");
  return { ...actual, useFormStatus };
});

import { LoginSubmitButton } from "./LoginSubmitButton";

describe("LoginSubmitButton", () => {
  it("disables duplicate submits and visibly announces the localized pending state", () => {
    useFormStatus.mockReturnValue({ pending: true });

    const html = renderToStaticMarkup(<LoginSubmitButton label="Sign in" pendingLabel="Signing in…" />);

    expect(html).toContain("disabled");
    expect(html).toContain("Signing in…");
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-busy="true"');
  });

  it("keeps the pending label out of the button's accessible name duplication", () => {
    useFormStatus.mockReturnValue({ pending: true });

    const html = renderToStaticMarkup(<LoginSubmitButton label="Sign in" pendingLabel="Signing in…" />);
    const button = html.match(/<button[\s\S]*?<\/button>/)?.[0] ?? "";

    expect(button.match(/Signing in…/g)).toHaveLength(1);
    expect(button).not.toContain("aria-live");
    expect(html).toMatch(/<div[^>]*aria-live="polite"[^>]*>Signing in…<\/div>/);
  });

  it("keeps the submit control enabled and labeled before submission", () => {
    useFormStatus.mockReturnValue({ pending: false });

    const html = renderToStaticMarkup(<LoginSubmitButton label="Sign in" pendingLabel="Signing in…" />);

    expect(html).toContain("Sign in");
    expect(html).not.toMatch(/<button[^>]*\sdisabled(?:=|>)/);
    expect(html).not.toContain('aria-busy="true"');
  });
});
