"use client";

import React from "react";
import { useFormStatus } from "react-dom";

export function LoginSubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      className="miracle-focus-ring mt-2 inline-flex min-h-12 w-full items-center justify-center rounded-[var(--radius-control,8px)] border border-[color:var(--color-brand-cyan,#49D1EC)] bg-[color:var(--color-brand-cyan,#49D1EC)] px-4 py-3 text-sm font-semibold text-[color:var(--color-on-accent,#09111E)] transition hover:brightness-110 disabled:cursor-wait disabled:opacity-70"
    >
      <span>{pending ? pendingLabel : label}</span>
      <span className="sr-only" aria-live="polite">{pending ? pendingLabel : ""}</span>
    </button>
  );
}
