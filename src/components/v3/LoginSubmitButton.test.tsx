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

  it("keeps the submit control enabled and labeled before submission", () => {
    useFormStatus.mockReturnValue({ pending: false });

    const html = renderToStaticMarkup(<LoginSubmitButton label="Sign in" pendingLabel="Signing in…" />);

    expect(html).toContain("Sign in");
    expect(html).not.toMatch(/<button[^>]*\sdisabled(?:=|>)/);
    expect(html).not.toContain('aria-busy="true"');
  });
});
