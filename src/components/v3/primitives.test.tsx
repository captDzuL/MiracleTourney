// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BrandLogo } from "@/components/v3/BrandLogo";
import { Button } from "@/components/v3/Button";
import { EmptyState } from "@/components/v3/EmptyState";
import { StatusBadge } from "@/components/v3/StatusBadge";
import { Surface } from "@/components/v3/Surface";
import { Tooltip } from "@/components/v3/Tooltip";

// The project compiles JSX with the classic runtime in Vitest.
(globalThis as typeof globalThis & { React?: typeof React }).React = React;

describe("V3 brand primitives", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders the official horizontal and symbol logo assets", () => {
    act(() => {
      root.render(
        <>
          <BrandLogo variant="horizontal" />
          <BrandLogo variant="symbol" />
        </>,
      );
    });

    const logos = container.querySelectorAll("img");
    expect(logos).toHaveLength(2);
    expect(logos[0]?.getAttribute("src")).toBe("/logo/miracle-horizontal.svg");
    expect(logos[1]?.getAttribute("src")).toBe("/logo/miracle-symbol.svg");
    expect(logos[0]?.getAttribute("alt")).toBe("Miracle");
  });

  it("makes the primary action more prominent than secondary and ghost buttons", () => {
    act(() => {
      root.render(
        <>
          <Button variant="primary">Register</Button>
          <Button variant="secondary">Preview</Button>
          <Button variant="ghost">Cancel</Button>
        </>,
      );
    });

    const [primary, secondary, ghost] = Array.from(container.querySelectorAll("button"));
    expect(primary?.className).toContain("bg-[var(--color-brand-cyan)]");
    expect(secondary?.className).toContain("border-[var(--color-border)]");
    expect(ghost?.className).not.toContain("bg-[var(--color-brand-cyan)]");
  });

  it("keeps every status understandable without relying on color", () => {
    act(() => {
      root.render(
        <>
          <StatusBadge status="live" />
          <StatusBadge status="upcoming" />
          <StatusBadge status="completed" />
          <StatusBadge status="cancelled" />
        </>,
      );
    });

    const labels = Array.from(container.querySelectorAll("[data-status-badge]")).map((badge) => badge.textContent);
    expect(labels).toEqual(["Live now", "Upcoming", "Completed", "Cancelled"]);
    expect(container.querySelectorAll("[data-status-badge] svg")).toHaveLength(4);
  });

  it("invokes the empty-state action from its visible button", () => {
    const onAction = vi.fn();

    act(() => {
      root.render(<EmptyState title="No teams yet" description="Invite a team to begin." actionLabel="Invite team" onAction={onAction} />);
    });

    const action = container.querySelector("button");
    expect(action?.textContent).toBe("Invite team");

    act(() => {
      action?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("reveals tooltip content when its trigger receives keyboard focus", () => {
    act(() => {
      root.render(
        <Tooltip content="Copied to clipboard">
          <button type="button">Copy link</button>
        </Tooltip>,
      );
    });

    const trigger = container.querySelector("button");
    expect(container.querySelector('[role="tooltip"]')).toBeNull();

    act(() => {
      trigger?.focus();
    });

    expect(container.querySelector('[role="tooltip"]')?.textContent).toBe("Copied to clipboard");
    expect(trigger?.getAttribute("aria-describedby")).toBeTruthy();
  });

  it("preserves a visible focus treatment on interactive controls", () => {
    act(() => {
      root.render(<Button>Register</Button>);
    });

    const button = container.querySelector("button");
    expect(button?.className).toContain("miracle-focus-ring");
  });

  it("uses a token-driven raised surface for grouped content", () => {
    act(() => {
      root.render(<Surface variant="raised">Bracket details</Surface>);
    });

    const surface = container.querySelector("section");
    expect(surface?.textContent).toBe("Bracket details");
    expect(surface?.className).toContain("bg-[var(--color-surface)]");
  });
});
