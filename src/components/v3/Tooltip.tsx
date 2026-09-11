"use client";

import { Children, cloneElement, isValidElement, useId, useState } from "react";

export type TooltipProps = {
  children: React.ReactElement<React.HTMLAttributes<HTMLElement>>;
  content: string;
};

export function Tooltip({ children, content }: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const tooltipId = useId();
  const child = Children.only(children);

  if (!isValidElement<React.HTMLAttributes<HTMLElement>>(child)) {
    throw new Error("Tooltip requires one interactive element as its child.");
  }

  const existingDescription = child.props["aria-describedby"];
  const describedBy = isOpen ? [existingDescription, tooltipId].filter(Boolean).join(" ") : existingDescription;

  return (
    <span className="relative inline-flex">
      {cloneElement(child, {
        "aria-describedby": describedBy,
        onBlur: (event) => {
          child.props.onBlur?.(event);
          setIsOpen(false);
        },
        onFocus: (event) => {
          child.props.onFocus?.(event);
          setIsOpen(true);
        },
        onKeyDown: (event) => {
          child.props.onKeyDown?.(event);
          if (event.key === "Escape") setIsOpen(false);
        },
        onMouseEnter: (event) => {
          child.props.onMouseEnter?.(event);
          setIsOpen(true);
        },
        onMouseLeave: (event) => {
          child.props.onMouseLeave?.(event);
          setIsOpen(false);
        },
      })}
      {isOpen ? (
        <span
          className="absolute left-1/2 top-full z-10 mt-2 w-max max-w-64 -translate-x-1/2 rounded-lg bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-text)] shadow-lg shadow-[var(--color-bg)]/20"
          id={tooltipId}
          role="tooltip"
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
