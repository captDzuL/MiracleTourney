"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/v3/Button";
import { Surface } from "@/components/v3/Surface";
import { cn } from "@/lib/utils";

export type EmptyStateProps = {
  actionLabel?: string;
  children?: ReactNode;
  className?: string;
  description: string;
  icon?: ReactNode;
  onAction?: () => void;
  title: string;
};

export function EmptyState({ actionLabel, children, className, description, icon, onAction, title }: EmptyStateProps) {
  return (
    <Surface as="section" className={cn("flex flex-col items-start gap-4", className)} variant="inset">
      {icon ? <div aria-hidden="true" className="text-[var(--color-brand-cyan)]">{icon}</div> : null}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">{title}</h2>
        <p className="max-w-prose text-sm leading-6 text-[var(--color-text-muted)]">{description}</p>
      </div>
      {children}
      {actionLabel && onAction ? <Button onClick={onAction}>{actionLabel}</Button> : null}
    </Surface>
  );
}
