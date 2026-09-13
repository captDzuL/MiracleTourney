"use client";
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

export function SubmitButton({ children, className, pendingLabel = "Memproses...", title }: { children: React.ReactNode; className?: string; pendingLabel?: string; title?: string }) {
  const { pending } = useFormStatus();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return (
    <button type="submit" disabled={!hydrated || pending} aria-busy={pending} className={className} title={title}>
      {pending ? pendingLabel : children}
    </button>
  );
}
